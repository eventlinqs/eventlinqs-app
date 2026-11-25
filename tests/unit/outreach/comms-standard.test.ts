import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'
import { sellThroughMessage } from '@/lib/listings/sell-through-report-words'
import { letterExpiry } from '@/lib/outreach/event-validity'
import { FOLLOW_UP_LETTERS } from '@/lib/outreach/follow-up-letters'
import { LIFECYCLE_ACQ, LIFECYCLE_LETTERS, LIFECYCLE_PERM, LIFECYCLE_SUBTYPE, lifecycleFields, type LifecycleFacts } from '@/lib/outreach/lifecycle-letters'
import { emailClosing, renderTemplate, ruleFailures, type Draft, type TemplateRow } from '@/lib/outreach/rules'
import { SEGMENT_A_LETTERS } from '@/lib/outreach/segment-a-letter'
import { SOURCE_ASK_EMAIL } from '@/lib/outreach/source-asks'
import { touchVoiceMessage } from '@/lib/outreach/touch-voice'
import { TWENTY_LETTERS } from '@/lib/outreach/twenty-letters'
import { VENUE_ASK_DM, VENUE_ASK_EMAIL } from '@/lib/outreach/venue-asks'
import { founderIntroductionProblems, readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'

/*
 * THE COMMUNICATION STANDARD (Lawal, 22 November 2026, 20:45: he adopted C:\dev\START-16OCT\COMMS-STANDARD-REVIEW-22NOV.md,
 * "follow this A to Z", "change everything, even the greetings"; the PM's 20:47, item 8: "regression tests (red first: a
 * you/we count still enforced, a stock greeting, a countdown, a claim link in a permission letter, an expired event, a
 * follow up after a reply)"). One test for each, numbered as the PM lists them. What is law or fact stays held by its own
 * tests (the sender's identity, the opt out, no invented fact, no expired event, eligibility and suppression).
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000`
const APPROVAL = `${ORIGIN}/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000`
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://www.melbournerecital.com.au/contact', noMarketingStatementChecked: true }

/** The review's own example, as the records would hold it: A Ceremony of Carols, Saturday 12 December 2026, 7pm. */
const CAROLS: LifecycleFacts = {
  organiserName: 'Melbourne Recital Centre',
  personName: null,
  websiteUrl: 'https://www.melbournerecital.com.au',
  night: {
    title: 'A Ceremony of Carols',
    slug: 'a-ceremony-of-carols-melbourne-recital-centre-2026-12-12',
    startDate: '2026-12-12T08:00:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    bookingUrl: 'https://www.melbournerecital.com.au/events/2026/a-ceremony-of-carols',
  },
  photoLink: APPROVAL,
  approvalLink: APPROVAL,
  origin: ORIGIN,
}
const CAROLS_EVENT = { startDate: CAROLS.night.startDate, endDate: null, status: 'published', timezone: 'Australia/Melbourne' }
// The request lands on Monday 23 November 2026, 07:00 in Melbourne (QUIET below); the follow up is judged on:
const SAT_28_7AM = new Date('2026-11-27T20:00:00Z') // Saturday 28 November, 07:00: T-14, five days after the request

function gate(subtype: string, step: number, subject: string | null, body: string, landsOn: string) {
  return voiceProblems(
    {
      ...touchVoiceMessage({
        channel: 'email',
        purpose: 'cadence',
        step,
        address: 'boxoffice@melbournerecital.com.au',
        subject,
        body,
        personName: null,
        organiserName: 'Melbourne Recital Centre',
        firstTouchId: step === 1 ? null : 'the-request',
        subtype,
      }),
      from: 'hello@eventlinqs.com',
      consent: CONSENT,
      eventDate: '2026-12-12',
      landsOn,
    },
    readVoicePolicy(),
  )
}

/** A stock pleasantry in any of its forms: "I hope you're well", "I hope you're all well", "I hope the nights are going well". */
const STOCK = /\bI hope\b|\bhope (all is well|this finds you)\b|\btrust (you're|you are) well\b/i

/** Every template the code holds, in every flow. */
const CODE_TEMPLATES: readonly (TemplateRow & { key: string })[] = [...LIFECYCLE_LETTERS, ...SEGMENT_A_LETTERS, ...FOLLOW_UP_LETTERS, ...TWENTY_LETTERS, VENUE_ASK_EMAIL, VENUE_ASK_DM, SOURCE_ASK_EMAIL]

/** The template rows the data files hold, each with the version its file writes (outreach-templates.mjs --version). */
function dataTemplates(): (TemplateRow & { key: string; version: number; file: string })[] {
  const dir = 'scripts/ops/data'
  return readdirSync(dir)
    .filter((f) => /^outreach-templates-.+\.json$/.test(f))
    .flatMap((file) => {
      const version = Number(file.match(/-v(\d+)\.json$/)?.[1] ?? 1)
      const rows = (JSON.parse(readFileSync(join(dir, file), 'utf8')) as { templates: (TemplateRow & { key: string })[] }).templates
      return rows.map((t) => ({ key: t.key, version, file, channel: t.channel, purpose: t.purpose, step: t.step, subject: t.subject, body: t.body }))
    })
}

/** The newest version of each key, as the drafter picks it (drafts.ts: the highest version of the key). */
function newestByKey<T extends { key: string; version: number }>(rows: readonly T[]): T[] {
  const top = new Map<string, number>()
  for (const r of rows) top.set(r.key, Math.max(top.get(r.key) ?? 0, r.version))
  return rows.filter((r) => r.version === top.get(r.key))
}

describe('1. no numerical writing rule: a letter is never held for a you and we count, a question count or a word count', () => {
  it('the approved permission request, with more "we" than "you", is held for nothing', () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(CAROLS), UNSUB)
    expect(r.heldBecause).toEqual([])
    const words = r.content.toLowerCase().match(/[a-z']+/g) ?? []
    const we = words.filter((w) => ['we', 'our', "we're", "we'd"].includes(w)).length
    const you = words.filter((w) => ['you', 'your', "you're"].includes(w)).length
    expect(we).toBeGreaterThan(you)
  })
  it('a first letter with two questions and over 125 words passes the CRM rules; the gateway counts no calls to action', () => {
    const content = [
      'Hi Sam,',
      `We're featuring upcoming Ballarat events on EventLinqs and our guide carries the Saturday live nights. ${'We put each night on our guide with its own page and its own link. '.repeat(10)}`,
      'Could you confirm the start time? And would you like us to add your poster?',
    ].join('\n\n')
    const draft: Draft = { channel: 'email', purpose: 'cadence', step: 1, subject: 'Promoting Saturday live nights on EventLinqs', content, closing: emailClosing('Kind regards,', UNSUB) }
    expect(ruleFailures(draft)).toEqual([])
    const perm = renderTemplate(LIFECYCLE_PERM, lifecycleFields(CAROLS), UNSUB)
    const twoAsks = perm.body.replace('Thanks for your time.', 'Could you reply with one image, or add it here? Thanks for your time.')
    expect(gate('PERM-IMAGE', 1, perm.subject, twoAsks, '2026-11-23').some((x) => x.includes('call to action'))).toBe(false)
  })
})

describe('2. no stock greeting: "Hi <name>," and straight into the purpose, in every template', () => {
  it('no template in the code opens with a pleasantry', () => {
    for (const t of CODE_TEMPLATES) expect(`${t.subject ?? ''}\n${t.body}`, t.key).not.toMatch(STOCK)
  })
  it('the newest version of every stored template row, and every row written on or after the ruling, carries none', () => {
    const rows = dataTemplates()
    for (const r of newestByKey(rows)) expect(r.body, `${r.key} v${r.version} (${r.file})`).not.toMatch(STOCK)
    for (const r of rows.filter((x) => x.file.includes('22nov'))) expect(r.body, `${r.key} (${r.file})`).not.toMatch(STOCK)
  })
  it('every row written on or after the ruling still passes every CRM rule once filled, so none is held for ever', () => {
    const facts = {
      'first name': 'Sam',
      venue: 'The Brewpub',
      night: 'Saturday live night',
      nights: 'Saturday live nights',
      'night type': 'Live music',
      city: 'Ballarat',
      'city slug': 'ballarat',
      organiser: 'The Brewpub',
      'what they run, or events': 'events',
      'true line': 'Live acts in the brewpub every Saturday, free entry.',
      'claim link': `${ORIGIN}/claim/abc`,
      'poster preview': `${ORIGIN}/kit/00000000-0000-4000-8000-000000000001/1`,
      link: `${ORIGIN}/organisers/submit`,
    }
    const rows = dataTemplates().filter((x) => x.file.includes('22nov'))
    expect(rows.map((r) => r.key).sort()).toEqual(['acq_first', 'anything_coming_up', 'first_invitation', 'first_invitation', 'who_looks_after_events'])
    for (const r of rows) expect(renderTemplate(r, facts, UNSUB).heldBecause, `${r.key} (${r.file})`).toEqual([])
  })
  // THE FOUNDER SENTENCE IN ALL ITS FORMS (Lawal, 11:31 of 18 November 2026; the PM's 23:16 of 23 November 2026, item 2):
  // no template that drafts today introduces the founder. The twenty still do, word for word from October, and draft
  // nothing: they are switched off (TWENTY_ADVICE_DRAFTING, hidden and never deleted, law 13), which this holds.
  it('no template that drafts introduces the founder; the twenty, which still do, stay switched off', () => {
    const std = readVoicePolicy().standard
    for (const t of CODE_TEMPLATES.filter((x) => !TWENTY_LETTERS.includes(x as (typeof TWENTY_LETTERS)[number]))) {
      expect(founderIntroductionProblems(t.body.split('\n\nKind regards,')[0], std), t.key).toEqual([])
    }
    expect(readFileSync('src/lib/outreach/twenty-drafts.ts', 'utf8')).toMatch(/export const TWENTY_ADVICE_DRAFTING = false\b/)
  })
  it("the newest standing approval of each template carries none, and the app's copy is the gateway's record", () => {
    const standing = (JSON.parse(readFileSync('src/lib/outreach/standing-approvals.generated.json', 'utf8')) as { templates: { key: string; version: number; body: string; on: boolean }[] }).templates
    const newest = newestByKey(standing)
    expect(newest.length).toBeGreaterThan(0)
    for (const s of newest) expect(s.body, `${s.key} v${s.version}`).not.toMatch(STOCK)
  })
  it('the sell-through report opens straight into its purpose', () => {
    const msg = sellThroughMessage(
      { to: 'iryna@example.org', name: 'Iryna', title: 'Kyivska Perepichka', venue: 'The Wheeler Centre', figures: { viewers: 12, saves: 2, reminders: 0, wentToBooking: 3 }, mayOffer: false, origin: ORIGIN },
      'hello@eventlinqs.com',
      ['Lawal Adams', 'Founder, EventLinqs'],
    )
    expect(msg?.body).not.toMatch(STOCK)
    expect(voiceProblems(msg!, readVoicePolicy())).toEqual([])
  })
  it('the gateway asks for no pleasantry: the permission request opening on its purpose passes whole', () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(CAROLS), UNSUB)
    expect(r.body.split('\n\n')[1]).toBe("We're featuring upcoming Melbourne events on EventLinqs and have included A Ceremony of Carols on Saturday 12 December.")
    expect(gate(LIFECYCLE_SUBTYPE.lifecycle_perm, 1, r.subject, r.body, '2026-11-23')).toEqual([])
  })
})

describe('3. no countdown: every date is the day and date read from the record, never a count of days', () => {
  const COUNTDOWN = /\[days\]|\bdays? to go\b|\b\d+ days? to\b/i
  it('no template carries a countdown field or wording', () => {
    for (const t of CODE_TEMPLATES) expect(`${t.subject ?? ''}\n${t.body}`, t.key).not.toMatch(COUNTDOWN)
  })
  it('the fields carry no count of days, and the ACQ subject names the day and date', () => {
    const fields = lifecycleFields(CAROLS)
    expect(fields).not.toHaveProperty('days')
    for (const l of LIFECYCLE_LETTERS) {
      const r = renderTemplate(l, fields, UNSUB)
      expect(`${r.subject}\n${r.body}`, l.key).not.toMatch(/\b\d+ days?\b/)
    }
    expect(renderTemplate(LIFECYCLE_ACQ, fields, UNSUB).subject).toBe("A Ceremony of Carols on Saturday 12 December: let's fill it")
  })
  it('the gateway takes the day and date subject and refuses the countdown one', () => {
    const subjects = readVoicePolicy().standard.acqFirstSubjects ?? []
    const takes = (s: string) => subjects.some((p) => new RegExp(p).test(s))
    expect(takes("A Ceremony of Carols on Saturday 12 December: let's fill it")).toBe(true)
    expect(takes("20 days to A Ceremony of Carols: let's fill it")).toBe(false)
  })
})

describe('4. no claim link and no "listed free" in a permission letter: the claim invitation is its own letter', () => {
  it('the permission request is the approved wording, filled only from the records', () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(CAROLS), UNSUB)
    expect(r.subject).toBe('Promoting A Ceremony of Carols on EventLinqs')
    expect(r.content).toBe(
      [
        'Hi Melbourne Recital Centre team,',
        "We're featuring upcoming Melbourne events on EventLinqs and have included A Ceremony of Carols on Saturday 12 December.",
        "We'd love to help more people discover the event through our Instagram, Facebook, and upcoming event guides.",
        'Could you please confirm whether we have permission to use the event image displayed on your website for this promotion?',
        `You can review the image and approve its use here: ${APPROVAL}.`,
        'If another party owns the image, please let us know so we can contact the appropriate rights holder.',
        'Thanks for your time.',
      ].join('\n\n'),
    )
  })
  it('no permission letter, request or follow up, carries a claim link or "listed free"', async () => {
    const { LIFECYCLE_PERM_FOLLOW_UP } = await import('@/lib/outreach/perm-follow-up')
    const perm = [...CODE_TEMPLATES.filter((t) => TEMPLATE_CLASS[t.key]?.category === 'PERM'), LIFECYCLE_PERM_FOLLOW_UP]
    expect(perm.map((t) => t.key)).toEqual(expect.arrayContaining(['lifecycle_perm', 'lifecycle_perm_follow_up']))
    for (const t of perm) expect(`${t.subject ?? ''}\n${t.body}`, t.key).not.toMatch(/claim|listed free/i)
    // The approved two carry one link only, the approval link: no listing link in either.
    for (const t of [LIFECYCLE_PERM, LIFECYCLE_PERM_FOLLOW_UP]) expect(t.body.match(/\[[a-z ]*link\]/g), t.key).toEqual(['[approval link]'])
  })
})

/** The request's subject as it went (lifecycle_perm version 2); its follow up answers it in its own thread. */
const REQUEST_SUBJECT = 'Promoting A Ceremony of Carols on EventLinqs'

/** A request sent on Monday 23 November, nothing heard since, the contact still eligible. */
const QUIET = { eligible: true, replied: false, approved: false, declined: false, requestSentAt: '2026-11-22T20:05:00Z', followUpSentAt: null }

describe('5. an expired event: no letter names an event on or after its day, or one no longer published', () => {
  it('the follow up for an event that has passed, is on its day, or was cancelled is never drafted', async () => {
    const { draftPermFollowUp } = await import('@/lib/outreach/perm-follow-up')
    const after = draftPermFollowUp({ facts: CAROLS, record: QUIET, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: new Date('2026-12-13T20:00:00Z') })
    expect(after).toMatchObject({ state: 'not drafted' })
    expect(after.state === 'not drafted' ? after.why : '').toMatch(/^expired/)
    const onTheDay = draftPermFollowUp({ facts: CAROLS, record: QUIET, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: new Date('2026-12-11T20:00:00Z') })
    expect(onTheDay.state === 'not drafted' ? onTheDay.why : '').toMatch(/^expired/)
    const cancelled = draftPermFollowUp({ facts: CAROLS, record: QUIET, event: { ...CAROLS_EVENT, status: 'cancelled' }, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM })
    expect(cancelled.state === 'not drafted' ? cancelled.why : '').toMatch(/^expired: the event it names is cancelled/)
    // The request itself, at the send press (sender.ts, event-validity.ts): never on or after its day.
    expect(letterExpiry('lifecycle_perm', CAROLS_EVENT, new Date('2026-12-12T01:00:00Z'))).toMatch(/^expired/)
  })
})

describe('6. a follow up after a reply: one follow up, only to an eligible contact with nothing recorded, while the event is ahead', () => {
  it('a reply, an approval or a decline recorded means no follow up; silence is never permission', async () => {
    const { draftPermFollowUp } = await import('@/lib/outreach/perm-follow-up')
    for (const heard of [{ replied: true }, { approved: true }, { declined: true }]) {
      const r = draftPermFollowUp({ facts: CAROLS, record: { ...QUIET, ...heard }, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM })
      expect(r.state, JSON.stringify(heard)).toBe('not drafted')
    }
    expect(draftPermFollowUp({ facts: CAROLS, record: { ...QUIET, eligible: false }, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM }).state).toBe('not drafted')
    expect(draftPermFollowUp({ facts: CAROLS, record: { ...QUIET, followUpSentAt: '2026-11-27T20:00:00Z' }, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM }).state).toBe('not drafted')
    expect(draftPermFollowUp({ facts: CAROLS, record: { ...QUIET, requestSentAt: null }, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM }).state).toBe('not drafted')
  })
  it('the drill: with nothing recorded it is drafted, in the approved wording, in the request thread, and passes every rule and the gateway', async () => {
    const { draftPermFollowUp } = await import('@/lib/outreach/perm-follow-up')
    const r = draftPermFollowUp({ facts: CAROLS, record: QUIET, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject: REQUEST_SUBJECT, now: SAT_28_7AM })
    expect(r.state).toBe('drafted')
    if (r.state !== 'drafted') return
    expect(r.letter.heldBecause).toEqual([])
    expect(r.letter.subject).toBe('Re: Promoting A Ceremony of Carols on EventLinqs')
    expect(r.letter.content).toBe(
      [
        'Hi Melbourne Recital Centre team,',
        'Just following up on our request to use the event image for A Ceremony of Carols in our EventLinqs promotions.',
        `If you're happy for us to use it, you can confirm here: ${APPROVAL}.`,
        "Otherwise, no problem at all. We'll leave the image out.",
        'Thanks for your time.',
      ].join('\n\n'),
    )
    expect(r.letter.closing).toBe(`Kind regards,\nLawal Adams\nFounder, EventLinqs\n\nIf you'd rather I didn't write again, just reply and say so, or unsubscribe here: ${UNSUB}`)
    expect(gate('PERM-REMINDER', 2, r.letter.subject, r.letter.body, '2026-11-28')).toEqual([])
  })
  it('answers the request in its own thread, whichever version of the request went, and never Re: Re:', async () => {
    const { draftPermFollowUp } = await import('@/lib/outreach/perm-follow-up')
    const v1 = 'Your A Ceremony of Carols listing on EventLinqs: may we use your photo?'
    const subjectOf = (threadSubject: string) => {
      const r = draftPermFollowUp({ facts: CAROLS, record: QUIET, event: CAROLS_EVENT, unsubscribeUrl: UNSUB, threadSubject, now: SAT_28_7AM })
      return r.state === 'drafted' ? r.letter.subject : r.why
    }
    expect(subjectOf(v1)).toBe(`Re: ${v1}`)
    expect(subjectOf(`Re: ${REQUEST_SUBJECT}`)).toBe(`Re: ${REQUEST_SUBJECT}`)
  })
})
