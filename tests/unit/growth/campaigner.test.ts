import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  SKIP_REASON,
  SKIP_SENTENCE,
  daysRemainingToEvent,
  planNextSend,
  type PacingRecipient,
  type PacingStep,
} from '@/lib/campaigner/pacing'
import {
  CampaignRenderError,
  RENDER_FAILURE,
  RENDER_FAILURE_SENTENCE,
  renderCampaignMessage,
  smsOptOutInstruction,
  unsubscribeUrl,
  type CampaignTemplate,
  type SenderIdentity,
} from '@/lib/campaigner/render'
import { segmentFingerprint } from '@/lib/campaigner/fingerprint'
import { SEEDED_CAMPAIGNER_CONFIG } from '@/lib/campaigner/config'
import { SEND_PATHS } from '@/lib/consent/send-paths'

/**
 * GA4. THE CAMPAIGNER, HELD TO THE TWO RULES THAT CAN END THIS BUSINESS.
 *
 * Pacing and rendering are pure, so they are walked here at every boundary and
 * in both directions. What is NOT decided here is whether the DATABASE refuses
 * a send to somebody absent from the allowlist, an SMS on a consent scoped to
 * email, the insert that exceeds a cap, or a message leaving draft with nobody
 * having approved it. Those are constraints, and GA4 requires them proven by
 * REMOVING every application level check and watching the database refuse
 * anyway, which is a thing only a real database can demonstrate. They are
 * driven, by name, in scripts/verify/ga4-campaigner-drive.mjs, and the
 * structural half of each is asserted below so the constraint cannot be dropped
 * without this file going red.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000070_campaigner.sql')
const LIB = join(ROOT, 'src', 'lib', 'campaigner')

const NOW = new Date('2026-09-14T09:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()

const EMAIL_STEP: PacingStep = {
  id: 'step-email',
  stepOrder: 1,
  channelCode: 'email',
  daysRemainingMin: 8,
  daysRemainingMax: 45,
  templateKey: 'event_first_word',
  minHoursSincePreviousSend: 0,
}
const LAST_CALL_STEP: PacingStep = {
  id: 'step-last-call',
  stepOrder: 2,
  channelCode: 'email',
  daysRemainingMin: 2,
  daysRemainingMax: 7,
  templateKey: 'event_last_call',
  minHoursSincePreviousSend: 96,
}
const SMS_STEP: PacingStep = {
  id: 'step-sms',
  stepOrder: 3,
  channelCode: 'sms',
  daysRemainingMin: 1,
  daysRemainingMax: 3,
  templateKey: 'event_last_call_sms',
  minHoursSincePreviousSend: 48,
}
const STEPS = [EMAIL_STEP, LAST_CALL_STEP, SMS_STEP]

function recipient(overrides: Partial<PacingRecipient> = {}): PacingRecipient {
  return {
    allowlistId: 'allow-one',
    consentChannelScope: 'both',
    lastSentAt: null,
    stepIdsAlreadySent: [],
    ...overrides,
  }
}

describe('GA4 acceptance 1: pacing', () => {
  it('step_selected_by_days_remaining_inside_bounds', () => {
    const outcome = planNextSend({ daysRemaining: 20, steps: STEPS, recipient: recipient(), now: NOW })
    expect(outcome.queued).toBe(true)
    if (outcome.queued) expect(outcome.step.id).toBe(EMAIL_STEP.id)
  })

  it('the bounds are INCLUSIVE at both ends, which is where an off by one would live', () => {
    for (const days of [8, 45]) {
      const outcome = planNextSend({ daysRemaining: days, steps: [EMAIL_STEP], recipient: recipient(), now: NOW })
      expect(outcome.queued, `day ${days}`).toBe(true)
    }
    for (const days of [7, 46]) {
      const outcome = planNextSend({ daysRemaining: days, steps: [EMAIL_STEP], recipient: recipient(), now: NOW })
      expect(outcome.queued, `day ${days}`).toBe(false)
    }
  })

  it('no_step_when_days_remaining_outside_every_bound', () => {
    const outcome = planNextSend({ daysRemaining: 60, steps: STEPS, recipient: recipient(), now: NOW })
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) expect(outcome.reason).toBe(SKIP_REASON.NO_STEP_FOR_DAYS_REMAINING)
  })

  it('minimum_hours_since_previous_send_blocks_second_send', () => {
    // Four days out, the last call step is open and wants 96 hours since the
    // previous message. This person heard from the campaign two hours ago.
    const blocked = planNextSend({
      daysRemaining: 4,
      steps: STEPS,
      recipient: recipient({ lastSentAt: hoursAgo(2) }),
      now: NOW,
    })
    expect(blocked.queued).toBe(false)
    if (!blocked.queued) expect(blocked.reason).toBe(SKIP_REASON.INSIDE_MINIMUM_GAP)

    const allowed = planNextSend({
      daysRemaining: 4,
      steps: STEPS,
      recipient: recipient({ lastSentAt: hoursAgo(97) }),
      now: NOW,
    })
    expect(allowed.queued).toBe(true)
  })

  it('sms_step_skipped_when_sms_consent_false_with_reason_stored', () => {
    // Two days out, with the email last call already taken, the SMS step is the
    // only one left. A consent scoped to email does not open it.
    const outcome = planNextSend({
      daysRemaining: 2,
      steps: STEPS,
      recipient: recipient({
        consentChannelScope: 'email',
        stepIdsAlreadySent: [LAST_CALL_STEP.id],
        lastSentAt: hoursAgo(200),
      }),
      now: NOW,
    })
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) {
      expect(outcome.reason).toBe(SKIP_REASON.SMS_CONSENT_NOT_GRANTED)
      // The reason is STORED, per step, not merely returned as a headline.
      expect(outcome.considered.map(c => c.reason)).toContain(SKIP_REASON.SMS_CONSENT_NOT_GRANTED)
      expect(outcome.considered.find(c => c.stepId === SMS_STEP.id)?.reason).toBe(
        SKIP_REASON.SMS_CONSENT_NOT_GRANTED,
      )
    }
  })

  it('sms_step_sent_when_separate_sms_consent_true', () => {
    for (const scope of ['sms', 'both'] as const) {
      const outcome = planNextSend({
        daysRemaining: 2,
        steps: STEPS,
        recipient: recipient({
          consentChannelScope: scope,
          stepIdsAlreadySent: [LAST_CALL_STEP.id],
          lastSentAt: hoursAgo(200),
        }),
        now: NOW,
      })
      expect(outcome.queued, scope).toBe(true)
      if (outcome.queued) expect(outcome.step.id).toBe(SMS_STEP.id)
    }
  })

  it('event_already_started_queues_nothing', () => {
    for (const days of [-1, -30]) {
      const outcome = planNextSend({ daysRemaining: days, steps: STEPS, recipient: recipient(), now: NOW })
      expect(outcome.queued).toBe(false)
      if (!outcome.queued) expect(outcome.reason).toBe(SKIP_REASON.EVENT_ALREADY_STARTED)
    }
  })

  it('a step already sent to this person is not sent again', () => {
    const outcome = planNextSend({
      daysRemaining: 20,
      steps: [EMAIL_STEP],
      recipient: recipient({ stepIdsAlreadySent: [EMAIL_STEP.id] }),
      now: NOW,
    })
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) expect(outcome.reason).toBe(SKIP_REASON.ALREADY_SENT_THIS_STEP)
  })

  it('two steps can cover one day and they are tried in step order', () => {
    // At two days out the email last call and the SMS are both open. The email
    // is step 2 and goes first; the SMS opens only once it has been taken.
    const first = planNextSend({ daysRemaining: 2, steps: STEPS, recipient: recipient(), now: NOW })
    expect(first.queued).toBe(true)
    if (first.queued) expect(first.step.id).toBe(LAST_CALL_STEP.id)
  })

  it('days remaining is FLOORED, so a step never opens half a day early', () => {
    // Two and a half days before the event, the answer is two, not three.
    const event = new Date(NOW.getTime() + 2.5 * 24 * 60 * 60 * 1000).toISOString()
    expect(daysRemainingToEvent(event, NOW)).toBe(2)
    // And the moment the event starts it is zero, not minus one.
    expect(daysRemainingToEvent(NOW.toISOString(), NOW)).toBe(0)
  })

  it('every skip reason has a sentence a person can read', () => {
    for (const reason of Object.values(SKIP_REASON)) {
      expect(SKIP_SENTENCE[reason].length).toBeGreaterThan(0)
    }
  })

  it('pacing is pure: the same input twice gives an identical answer', () => {
    const once = planNextSend({ daysRemaining: 2, steps: STEPS, recipient: recipient(), now: NOW })
    const twice = planNextSend({ daysRemaining: 2, steps: STEPS, recipient: recipient(), now: NOW })
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
  })
})

const IDENTITY: SenderIdentity = {
  fromName: 'Lane B Sound',
  replyTo: 'hello@lane-b-sound.test',
  identityLine: 'Lane B Sound, 1 Test Street, Geelong VIC 3220.',
  isVerified: true,
}

const EMAIL_TEMPLATE: CampaignTemplate = {
  key: 'event_first_word',
  channelCode: 'email',
  subjectTemplate: '{{organiser_name}}: {{event_title}}',
  bodyTemplate: '{{opening_line}}\n\n{{event_title}} is on {{event_date}}.\n\nTickets: {{tracked_link}}\n\n{{signature}}',
}

const SMS_TEMPLATE: CampaignTemplate = {
  key: 'event_last_call_sms',
  channelCode: 'sms',
  subjectTemplate: '',
  bodyTemplate: '{{organiser_name}}: {{event_title}}. Tickets {{tracked_link}}',
}

const VALUES = {
  organiser_name: 'Lane B Sound',
  event_title: 'Lane B warehouse night',
  event_date: '14 Oct 2026',
  tracked_link: 'https://www.eventlinqs.com.au/m/abcdefgh1234',
  opening_line: 'We have one more night at the warehouse before summer.',
  signature: 'Jo, Lane B Sound',
}

const UNSUBSCRIBE = 'https://www.eventlinqs.com.au/marketing/preferences/3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('GA4 acceptance 2: rendering', () => {
  it('email_renders_unsubscribe_link_and_sender_identity', () => {
    const rendered = renderCampaignMessage({
      template: EMAIL_TEMPLATE,
      values: VALUES,
      senderIdentity: IDENTITY,
      unsubscribeUrl: UNSUBSCRIBE,
      destination: 'lane-b-ga4@eventlinqs.test',
    })
    expect(rendered.body).toContain(UNSUBSCRIBE)
    expect(rendered.body).toContain(IDENTITY.identityLine)
    expect(rendered.body).toContain(IDENTITY.replyTo)
    expect(rendered.html).toContain(UNSUBSCRIBE)
    expect(rendered.html).toContain(IDENTITY.identityLine)
    expect(rendered.subject).toBe('Lane B Sound: Lane B warehouse night')
  })

  it('email_render_without_sender_identity_raises_named_error', () => {
    expect(() =>
      renderCampaignMessage({
        template: EMAIL_TEMPLATE,
        values: VALUES,
        senderIdentity: null,
        unsubscribeUrl: UNSUBSCRIBE,
        destination: 'lane-b-ga4@eventlinqs.test',
      }),
    ).toThrowError(CampaignRenderError)

    try {
      renderCampaignMessage({
        template: EMAIL_TEMPLATE,
        values: VALUES,
        senderIdentity: null,
        unsubscribeUrl: UNSUBSCRIBE,
        destination: 'lane-b-ga4@eventlinqs.test',
      })
      throw new Error('it rendered, which it must not')
    } catch (error) {
      expect((error as CampaignRenderError).reason).toBe(RENDER_FAILURE.SENDER_IDENTITY_MISSING)
    }
  })

  it('an UNVERIFIED sender identity is refused by its own name', () => {
    try {
      renderCampaignMessage({
        template: EMAIL_TEMPLATE,
        values: VALUES,
        senderIdentity: { ...IDENTITY, isVerified: false },
        unsubscribeUrl: UNSUBSCRIBE,
        destination: 'lane-b-ga4@eventlinqs.test',
      })
      throw new Error('it rendered, which it must not')
    } catch (error) {
      expect((error as CampaignRenderError).reason).toBe(RENDER_FAILURE.SENDER_IDENTITY_UNVERIFIED)
    }
  })

  it('email_render_without_unsubscribe_token_raises_named_error', () => {
    for (const missing of [null, '', '   ']) {
      try {
        renderCampaignMessage({
          template: EMAIL_TEMPLATE,
          values: VALUES,
          senderIdentity: IDENTITY,
          unsubscribeUrl: missing,
          destination: 'lane-b-ga4@eventlinqs.test',
        })
        throw new Error('it rendered, which it must not')
      } catch (error) {
        expect((error as CampaignRenderError).reason).toBe(RENDER_FAILURE.UNSUBSCRIBE_MISSING)
      }
    }
  })

  it('sms_renders_sender_name_and_opt_out', () => {
    const rendered = renderCampaignMessage({
      template: SMS_TEMPLATE,
      values: VALUES,
      senderIdentity: IDENTITY,
      unsubscribeUrl: null,
      destination: 'lane-b-ga4@eventlinqs.test',
    })
    expect(rendered.subject).toBe('')
    expect(rendered.body).toContain(IDENTITY.fromName)
    expect(rendered.body).toContain(smsOptOutInstruction())
    // An SMS carries an INSTRUCTION rather than a link: a URL nobody can read on
    // a locked screen is not an opt out, and it is what every scam message has.
    expect(rendered.body).not.toContain('marketing/preferences')
    expect(rendered.html).toBe('')
  })

  it('organiser_opening_line_and_signature_appear_verbatim', () => {
    const rendered = renderCampaignMessage({
      template: EMAIL_TEMPLATE,
      values: VALUES,
      senderIdentity: IDENTITY,
      unsubscribeUrl: UNSUBSCRIBE,
      destination: 'lane-b-ga4@eventlinqs.test',
    })
    expect(rendered.body).toContain(VALUES.opening_line)
    expect(rendered.body).toContain(VALUES.signature)
    // And in the html, escaped rather than rewritten.
    expect(rendered.html).toContain('We have one more night at the warehouse before summer.')
  })

  it('a placeholder nothing fills refuses rather than leaving a gap', () => {
    try {
      renderCampaignMessage({
        template: EMAIL_TEMPLATE,
        values: { ...VALUES, opening_line: '' },
        senderIdentity: IDENTITY,
        unsubscribeUrl: UNSUBSCRIBE,
        destination: 'lane-b-ga4@eventlinqs.test',
      })
      throw new Error('it rendered, which it must not')
    } catch (error) {
      expect((error as CampaignRenderError).reason).toBe(RENDER_FAILURE.PLACEHOLDER_UNFILLED)
      expect((error as CampaignRenderError).message).toContain('opening_line')
    }
  })

  it('a value carrying html is escaped in the html part and left alone in the text', () => {
    const rendered = renderCampaignMessage({
      template: EMAIL_TEMPLATE,
      values: { ...VALUES, opening_line: 'Doors at 9 <script>alert(1)</script>' },
      senderIdentity: IDENTITY,
      unsubscribeUrl: UNSUBSCRIBE,
      destination: 'lane-b-ga4@eventlinqs.test',
    })
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
  })

  it('the unsubscribe address is built from the configured path, never a route literal', () => {
    expect(unsubscribeUrl('https://www.eventlinqs.com.au/', '/marketing/preferences', 'abc')).toBe(
      'https://www.eventlinqs.com.au/marketing/preferences/abc',
    )
    expect(unsubscribeUrl('https://x.test', 'marketing/preferences', 'abc')).toBe(
      'https://x.test/marketing/preferences/abc',
    )
  })

  it('every render failure has a sentence a person can read', () => {
    for (const reason of Object.values(RENDER_FAILURE)) {
      expect(RENDER_FAILURE_SENTENCE[reason].length).toBeGreaterThan(0)
    }
  })
})

describe('GA4 acceptance 4: approval is per segment', () => {
  const base = { matchRunId: '4e4a2b1c-0000-4000-8000-000000000001', channelCode: 'email', allowlistSize: 40 }

  it('repeat_send_to_same_fingerprint_needs_no_second_approval', () => {
    expect(segmentFingerprint(base)).toBe(segmentFingerprint({ ...base }))
  })

  it('approval_for_one_fingerprint_does_not_authorise_a_changed_segment', () => {
    const original = segmentFingerprint(base)
    // A different list, even at the same size.
    expect(segmentFingerprint({ ...base, matchRunId: '4e4a2b1c-0000-4000-8000-000000000002' })).not.toBe(original)
    // The same list, one person bigger.
    expect(segmentFingerprint({ ...base, allowlistSize: 41 })).not.toBe(original)
    // The same list, a different channel: approving an email to 40 people is
    // not approving an SMS to the same 40.
    expect(segmentFingerprint({ ...base, channelCode: 'sms' })).not.toBe(original)
  })

  it('the fingerprint cannot be confused by where one field ends and the next begins', () => {
    expect(segmentFingerprint({ matchRunId: 'ab', channelCode: 'c', allowlistSize: 1 })).not.toBe(
      segmentFingerprint({ matchRunId: 'a', channelCode: 'bc', allowlistSize: 1 }),
    )
  })

  it('it refuses to fingerprint something it cannot identify', () => {
    expect(() => segmentFingerprint({ ...base, matchRunId: '' })).toThrow()
    expect(() => segmentFingerprint({ ...base, allowlistSize: -1 })).toThrow()
    expect(() => segmentFingerprint({ ...base, allowlistSize: 1.5 })).toThrow()
  })

  it('it is a sha256 hex digest, which is what the database column accepts', () => {
    expect(segmentFingerprint(base)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('GA4 acceptance 3: the rules are constraints, not application checks', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('insert_send_for_non_allowlisted_recipient_is_refused_by_database', () => {
    // The mechanism is a COMPOSITE foreign key, so a send row must name an
    // allowlist row belonging to its own campaign AND its own channel.
    expect(sql).toContain('constraint marketing_send_recipient_is_allowlisted')
    expect(sql).toContain('foreign key (allowlist_id, campaign_id, channel_code)')
    expect(sql).toContain('references public.marketing_recipient_allowlist (id, campaign_id, channel_code)')
    expect(sql).toContain('allowlist_id uuid not null')
  })

  it('insert_allowlist_row_with_consent_false_is_refused_by_database', () => {
    expect(sql).toContain('constraint marketing_recipient_allowlist_consent_must_be_true check (consent_state)')
    expect(sql).toContain('constraint marketing_recipient_allowlist_scope_covers_channel')
  })

  it('insert_send_exceeding_campaign_cap_is_refused_by_database_with_cap_in_error', () => {
    expect(sql).toContain('create or replace function public.marketing_send_respects_cap()')
    expect(sql).toContain('before insert on public.marketing_send')
    // The cap and the campaign reference are IN the error, so a refusal names
    // what it refused rather than reporting that something went wrong.
    expect(sql).toContain('has reached its volume cap of %')
    // And the campaign row is locked before the count, so two dispatchers
    // cannot both read one under the cap and both insert.
    expect(sql).toContain('for update')
  })

  it('send_without_approval_for_new_segment_fingerprint_is_refused', () => {
    expect(sql).toContain('create or replace function public.marketing_send_requires_approval()')
    expect(sql).toContain('before insert or update on public.marketing_send')
    expect(sql).toContain('has no approval for segment fingerprint')
  })

  it('the database is what refuses, so no application file re-implements these rules', () => {
    for (const file of readdirSync(LIB)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(LIB, file), 'utf8')
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(String.fromCharCode(10))
        .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join(String.fromCharCode(10))
      // Counting sends against the cap in application code would make the
      // application the thing under test instead of the constraint.
      expect(code, `${file} counts sends against the cap itself`).not.toMatch(/volume_?[Cc]ap\s*[<>=]/)
    }
  })
})

describe('GA4 acceptance 9: nothing this item adds writes a forbidden literal', () => {
  const addedFiles = [
    ...readdirSync(LIB).filter(f => f.endsWith('.ts')).map(f => join(LIB, f)),
  ]

  const codeOf = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(String.fromCharCode(10))
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join(String.fromCharCode(10))

  it('every file this item adds exists where the test says it does', () => {
    expect(addedFiles.length).toBeGreaterThan(5)
    for (const file of addedFiles) expect(existsSync(file), file).toBe(true)
  })

  it('no template key is written as a literal anywhere in the item', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const keys = [...sql.matchAll(/^\s*'(event_[a-z_]+)',$/gm)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const file of addedFiles) {
      for (const key of keys) {
        expect(codeOf(file), `${file} names the template key ${key}`).not.toContain(key)
      }
    }
  })

  it('no day count, cap or channel code is written as a literal', () => {
    for (const file of addedFiles) {
      if (file.endsWith(join('campaigner', 'config.ts'))) continue
      const code = codeOf(file)
      expect(code, `${file} writes a days-remaining bound as a literal`).not.toMatch(
        /daysRemaining(Min|Max)\s*[=:]\s*\d/,
      )
      expect(code, `${file} writes a volume cap as a literal`).not.toMatch(/volumeCap\s*[=:]\s*\d/)
      expect(code, `${file} writes a minimum gap as a literal`).not.toMatch(
        /minHoursSincePreviousSend\s*[=:]\s*\d/,
      )
    }
  })

  it('no fee, rate or route is named anywhere in the item', () => {
    for (const file of addedFiles) {
      const code = codeOf(file)
      expect(code, `${file} names a fee`).not.toMatch(/fee_?[Pp]ercent|percentage|\d+(\.\d+)?%/)
      /*
       * config.ts is the ONE exception, for the reason every other reader on
       * this platform has one: it carries the seeded fallback, and the test
       * above asserts that fallback is character for character what the
       * migration seeds. It is not a second source of the value; it is a copy
       * held equal to the first by a test that fails when they drift.
       */
      if (file.endsWith(join('campaigner', 'config.ts'))) continue
      expect(code, `${file} writes the unsubscribe route as a literal`).not.toContain("'/marketing/preferences")
    }
  })

  it('the seeded fallback config equals what the migration actually seeds', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain(
      `(true, '${SEEDED_CAMPAIGNER_CONFIG.mode}', '${SEEDED_CAMPAIGNER_CONFIG.testDomain}', ` +
        `${SEEDED_CAMPAIGNER_CONFIG.defaultVolumeCap}, '${SEEDED_CAMPAIGNER_CONFIG.unsubscribePath}')`,
    )
  })

  it('the safe posture when the configuration cannot be read is HOLD, not the seeded mode', () => {
    /*
     * Every other configuration reader on this platform falls back to the
     * posture the product is already taking. This one is the opposite, because
     * the failure mode here is SENDING: a campaigner that cannot read its own
     * configuration must not decide on its own that it may message people.
     */
    const source = readFileSync(join(LIB, 'config.ts'), 'utf8')
    expect(source).toMatch(/SAFE_POSTURE[\s\S]{0,200}mode:\s*'hold'/)
  })
})

describe('GA4: the campaigner is a registered send path and goes through the one door', () => {
  it('the runner is registered as a marketing path', () => {
    const entry = SEND_PATHS.find(p => p.file === 'src/lib/campaigner/run.ts')
    expect(entry).toBeDefined()
    expect(entry?.kind).toBe('marketing')
    expect(entry?.purpose).toBe('facilitated_event_marketing')
  })

  it('the transport adapter is registered as a transport, and decides nothing', () => {
    const entry = SEND_PATHS.find(p => p.file === 'src/lib/campaigner/sink.ts')
    expect(entry).toBeDefined()
    expect(entry?.kind).toBe('transport')
  })

  it('the runner asks the resolver in its own file, at SEND time', () => {
    const source = readFileSync(join(LIB, 'run.ts'), 'utf8')
    expect(source).toContain("import { resolveSend } from '@/lib/consent/resolver'")
    expect(source).toContain('await resolveSend(admin, {')
  })

  it('the lane C notification router is not imported anywhere in the campaigner', () => {
    for (const file of readdirSync(LIB)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(LIB, file), 'utf8')
      expect(source, `${file} imports the notification router`).not.toContain("@/lib/notifications/")
    }
  })
})

describe('GA4 acceptance 8: the copy gate laws hold in every sentence this item can print', () => {
  const sentences = [
    ...Object.values(SKIP_SENTENCE),
    ...Object.values(RENDER_FAILURE_SENTENCE),
    smsOptOutInstruction(),
    renderCampaignMessage({
      template: EMAIL_TEMPLATE,
      values: VALUES,
      senderIdentity: IDENTITY,
      unsubscribeUrl: UNSUBSCRIBE,
      destination: 'lane-b-ga4@eventlinqs.test',
    }).body,
    renderCampaignMessage({
      template: SMS_TEMPLATE,
      values: VALUES,
      senderIdentity: IDENTITY,
      unsubscribeUrl: null,
      destination: 'lane-b-ga4@eventlinqs.test',
    }).body,
  ]

  it('no em dash, no en dash and no hyphen with spaces around it', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain(String.fromCharCode(8212))
      expect(sentence, sentence).not.toContain(String.fromCharCode(8211))
      expect(sentence, sentence).not.toMatch(/ - /)
    }
  })

  it('no exclamation mark, and no American spelling of the words this item uses', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain('!')
      expect(sentence, sentence).not.toMatch(/\b(organiz|recogniz|personaliz|analyz)/i)
      expect(sentence, sentence).not.toMatch(/\bcolor\b|\bcenter\b/i)
    }
  })

  it('the banned word appears in nothing this item prints', () => {
    for (const sentence of sentences) {
      expect(sentence.toLowerCase(), sentence).not.toContain('cultur')
    }
  })
})
