/**
 * AQ1. CONSENT TO DISCOVER, CAPTURED AT CHECKOUT.
 *
 * The four acceptance lines, and what is asserted where:
 *
 *   1. the checkbox is unticked by default
 *        tests/component/discovery-consent-is-never-preticked.test.tsx renders
 *        both surfaces and reads the DOM. Here: the surfaces cannot ASK in two
 *        places at once, which is the other half of "asked once, unticked".
 *   2. the exact wording shown is the wording stored
 *        the rendered half is in the component test; the STORED half is here,
 *        including the case AQ1's reversal creates, where the buyer reads the
 *        sentence on one screen and their consent is written on another.
 *   3. a declined buyer is excluded from every discovery query
 *        here, behaviourally through the one resolver, plus the enumeration of
 *        what "every discovery query" is. The build-failing half is
 *        scripts/guards/discovery-asks-the-consent-door.mjs.
 *   4. checkout conversion measured before and after, and the two percent rule
 *        here, exhaustively, against fixed rows rather than a shared database.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  placementPeriodsFrom,
  placementInForceAt,
  isCapturePlacement,
  CAPTURE_PLACEMENTS,
  DEFAULT_CAPTURE_PLACEMENT,
} from '@/lib/consent/capture-placement-math'
import {
  conversionRate,
  judgeCaptureConversion,
  conversionSentence,
  formatRate,
  CAPTURE_CONVERSION_FALL_LIMIT_POINTS,
  CAPTURE_CONVERSION_MINIMUM_SAMPLE,
} from '@/lib/consent/capture-conversion-math'
import { buildCaptureConversionReport } from '@/lib/consent/capture-conversion'
import { decideSend, type LedgerConsentEvent } from '@/lib/consent/decide'
import { FACILITATED_MARKETING_PURPOSE, LOCAL_DIGEST_PURPOSE, PLATFORM_TENANT_SLUG } from '@/lib/consent/purposes'

const read = (p: string) => readFileSync(p, 'utf8')

const MIGRATION = read('supabase/migrations/20260919000110_marketing_capture_placement.sql')
const CHECKOUT_PAGE = read('src/app/checkout/[reservation_id]/page.tsx')
const CHECKOUT_ACTION = read('src/app/actions/checkout.ts')
const EVENT_PAGE = read('src/app/events/[slug]/page.tsx')
const CARRIER = read('src/lib/consent/capture-carrier.ts')
const CARRY_ACTION = read('src/app/actions/discovery-consent.ts')
const SQUAD_PAGE = read('src/app/squad/[token]/pay/[member_id]/page.tsx')

// ---------------------------------------------------------------------------
// ACCEPTANCE 1, the half a rendered test cannot see: asked in ONE place.
// ---------------------------------------------------------------------------

describe('AQ1: the question is asked in exactly one place at a time', () => {
  it('the payment step asks only while the placement says checkout', () => {
    expect(CHECKOUT_PAGE).toContain('resolveCapturePlacement')
    expect(CHECKOUT_PAGE).toMatch(/capturePlacement === 'checkout'/)
  })

  it('the payment step also stops asking once an answer is already carried', () => {
    // The stronger of the two conditions. A placement that moved back mid
    // purchase must not produce a second question about the same thing.
    expect(CHECKOUT_PAGE).toContain('readCarriedAnswer')
    expect(CHECKOUT_PAGE).toMatch(/carriedAnswer === null/)
  })

  it('the ticket page asks only while the placement says ticket page', () => {
    expect(EVENT_PAGE).toContain('resolveCapturePlacement')
    expect(EVENT_PAGE).toMatch(/capturePlacement === 'ticket_page'/)
  })

  it('the two conditions are opposites of one value, so they can never both be true', () => {
    expect(CAPTURE_PLACEMENTS).toEqual(['checkout', 'ticket_page'])
    expect(isCapturePlacement('checkout')).toBe(true)
    expect(isCapturePlacement('ticket_page')).toBe(true)
    expect(isCapturePlacement('nowhere')).toBe(false)
    expect(isCapturePlacement(null)).toBe(false)
  })

  it('an unreadable placement falls back to where the platform has always asked', () => {
    expect(DEFAULT_CAPTURE_PLACEMENT).toBe('checkout')
  })

  it('the squad payment step keeps asking, and that is the stated exception', () => {
    /*
     * A squad member arrives on a payment link and never passes a ticket page,
     * so there is no earlier surface to move their question to. AQ1 says the
     * capture MOVES rather than being removed, and removing it for them is what
     * gating this page on the placement would do.
     */
    expect(SQUAD_PAGE).toContain("isFeatureEnabled('audience_capture')")
    expect(SQUAD_PAGE).not.toContain('resolveCapturePlacement')
  })
})

// ---------------------------------------------------------------------------
// ACCEPTANCE 2, the stored half.
// ---------------------------------------------------------------------------

describe('AQ1: the wording shown is the wording stored, on both surfaces', () => {
  it('the carrier stores the verbatim sentence and its version, not a reference to it', () => {
    expect(MIGRATION).toContain('wording text')
    expect(MIGRATION).toContain('wording_version text not null')
    expect(MIGRATION).toContain('marketing_capture_answer_wording_present')
  })

  it('the carried wording is what gets recorded, never whatever is in force later', () => {
    expect(CHECKOUT_ACTION).toMatch(/wording: carried\?\.wording \?\? null/)
    const answer = read('src/lib/consent/checkout-answer.ts')
    // The recorder prefers the wording it was handed and only falls back to a
    // fresh read when the question was asked on this same request.
    expect(answer).toMatch(/params\.wording \?\? \(await getCurrentConsentWording/)
  })

  it('the version carried is the one in force when the reservation was made, read on the server', () => {
    expect(CARRY_ACTION).toContain('getConsentWordingAsAt')
    expect(CARRY_ACTION).toContain('reservation.created_at')
  })

  it('the browser never supplies the wording, because evidence a stranger can choose is not evidence', () => {
    // The action's input schema is the whole of what a caller may send.
    expect(CARRY_ACTION).toMatch(/const Schema = z\.object\(\{\s*reservation_id: z\.string\(\)\.uuid\(\),\s*ticked: z\.boolean\(\),\s*\}\)/)
    expect(CARRY_ACTION).not.toContain('wording_version: z.')
  })

  it('the scopes come from the immutable record, read back by the carried version', () => {
    expect(CARRIER).toContain('getConsentWordingByVersion')
    expect(CARRIER).toContain('scopesReconstructed')
  })

  it('the carrier is not evidence and says so where somebody would look', () => {
    expect(CARRIER).toContain('public.consent_events is the evidence')
    expect(MIGRATION).toContain('A carrier, never evidence')
  })
})

// ---------------------------------------------------------------------------
// ACCEPTANCE 3, a declined buyer is excluded from every discovery query.
// ---------------------------------------------------------------------------

/**
 * WHAT "EVERY DISCOVERY QUERY" IS, enumerated rather than gestured at. These
 * are the three modules that choose WHO hears about somebody else's event. The
 * guard re-derives this set from the repository on every build, so a fourth one
 * cannot be added without either asking the door or failing the build.
 */
const DISCOVERY_READERS = [
  'src/lib/matching/run.ts',
  'src/lib/campaigner/allowlist.ts',
  'src/lib/campaigner/run.ts',
] as const

function declinedEvent(at: string, id = 'declined-1'): LedgerConsentEvent {
  return {
    id,
    tenantSlug: PLATFORM_TENANT_SLUG,
    purpose: FACILITATED_MARKETING_PURPOSE,
    channelScope: 'both',
    decision: 'declined',
    occurredAt: at,
    wordingVersion: 'lane-b-aq1-v1',
  }
}

function grantedEvent(at: string, id = 'granted-1'): LedgerConsentEvent {
  return { ...declinedEvent(at, id), decision: 'granted' }
}

const QUESTION = {
  tenantSlug: PLATFORM_TENANT_SLUG,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel: 'email' as const,
  now: new Date('2026-09-19T00:00:00.000Z'),
  maxAgeMonths: 24,
}

describe('AQ1: a declined buyer is excluded from every discovery query', () => {
  it('the door refuses a decline, and names the event that said so', () => {
    const verdict = decideSend(QUESTION, [declinedEvent('2026-09-01T00:00:00.000Z')], [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.decidingEventId).toBe('declined-1')
  })

  it('refuses on every channel, not only the one the decline was given on', () => {
    for (const channel of ['email', 'sms'] as const) {
      const verdict = decideSend(
        { ...QUESTION, channel },
        [declinedEvent('2026-09-01T00:00:00.000Z')],
        [],
      )
      expect(verdict.permitted, `channel ${channel}`).toBe(false)
    }
  })

  it('refuses the narrower purpose a facilitated consent would have covered', () => {
    const verdict = decideSend(
      { ...QUESTION, purpose: LOCAL_DIGEST_PURPOSE },
      [declinedEvent('2026-09-01T00:00:00.000Z')],
      [],
    )
    expect(verdict.permitted).toBe(false)
  })

  it('a decline AFTER a grant refuses, because the latest event wins', () => {
    const verdict = decideSend(
      QUESTION,
      [grantedEvent('2026-08-01T00:00:00.000Z'), declinedEvent('2026-09-01T00:00:00.000Z')],
      [],
    )
    expect(verdict.permitted).toBe(false)
    expect(verdict.decidingEventId).toBe('declined-1')
  })

  it('is permanent until the buyer themselves grants again, which AQ1 asks for by name', () => {
    const stillDeclined = decideSend(
      QUESTION,
      [declinedEvent('2026-01-01T00:00:00.000Z')],
      [],
    )
    expect(stillDeclined.permitted).toBe(false)

    const changedTheirMind = decideSend(
      QUESTION,
      [declinedEvent('2026-01-01T00:00:00.000Z'), grantedEvent('2026-09-01T00:00:00.000Z', 'granted-2')],
      [],
    )
    expect(changedTheirMind.permitted).toBe(true)
    expect(changedTheirMind.decidingEventId).toBe('granted-2')
  })

  it('every discovery reader asks the door about every person it selects', () => {
    for (const file of DISCOVERY_READERS) {
      const source = read(file)
      const asks =
        source.includes('resolveSend') ||
        source.includes('filterPermittedRecipients') ||
        source.includes('admitMatchRunToAllowlist')
      expect(asks, `${file} passes its candidates through the resolver`).toBe(true)
    }
  })

  it('the audience table itself cannot hold a person without a live consent', () => {
    const asset = read('supabase/migrations/20260913000030_audience_asset.sql')
    expect(asset).toMatch(/consent_state/)
    // The trigger removes somebody the moment their consent stops permitting,
    // so a decline does not merely fail to add them, it takes them out.
    const ledger = read('supabase/migrations/20260913000040_consent_ledger.sql')
    expect(ledger).toContain('delete from public.audience_members where email = v_email;')
  })
})

// ---------------------------------------------------------------------------
// ACCEPTANCE 4, the measurement and the two percent rule.
// ---------------------------------------------------------------------------

describe('AQ1: the conversion rate itself', () => {
  it('is null rather than zero when nothing has settled', () => {
    expect(conversionRate({ settled: 0, converted: 0 }).percent).toBeNull()
    expect(formatRate(null)).toBe('no settled reservations')
  })

  it('computes the obvious cases exactly', () => {
    expect(conversionRate({ settled: 200, converted: 100 }).percent).toBe(50)
    expect(conversionRate({ settled: 4, converted: 1 }).percent).toBe(25)
  })

  it('never reports more conversions than reservations, whatever it is handed', () => {
    const r = conversionRate({ settled: 10, converted: 40 })
    expect(r.converted).toBe(10)
    expect(r.percent).toBe(100)
  })
})

describe('AQ1: the two percent rule, at its boundaries on both sides', () => {
  const n = CAPTURE_CONVERSION_MINIMUM_SAMPLE * 10
  const at = (percent: number) => ({ settled: n, converted: Math.round((percent / 100) * n) })

  it('a fall of exactly the limit HOLDS, because the rule says more than', () => {
    const c = judgeCaptureConversion(at(60), at(58))
    expect(c.deltaPoints).toBeCloseTo(-2, 10)
    expect(c.verdict).toBe('hold')
  })

  it('a fall just past the limit MOVES', () => {
    const c = judgeCaptureConversion(at(60), at(57.9))
    expect(c.verdict).toBe('move')
  })

  it('a rise holds, however large', () => {
    expect(judgeCaptureConversion(at(40), at(90)).verdict).toBe('hold')
  })

  it('refuses to judge a sample under the floor, on either side', () => {
    const small = { settled: CAPTURE_CONVERSION_MINIMUM_SAMPLE - 1, converted: 0 }
    expect(judgeCaptureConversion(small, at(60)).verdict).toBe('not-enough-evidence')
    expect(judgeCaptureConversion(at(60), small).verdict).toBe('not-enough-evidence')
  })

  it('judges at exactly the floor, so the floor is a floor and not a gap', () => {
    const exact = {
      settled: CAPTURE_CONVERSION_MINIMUM_SAMPLE,
      converted: Math.round(CAPTURE_CONVERSION_MINIMUM_SAMPLE * 0.5),
    }
    expect(judgeCaptureConversion(exact, exact).verdict).toBe('hold')
  })

  it('reports the other reading of "two percent" beside the one it acts on', () => {
    const c = judgeCaptureConversion(at(50), at(45))
    expect(c.deltaPoints).toBeCloseTo(-5, 10)
    expect(c.deltaRelativePercent).toBeCloseTo(-10, 10)
    expect(CAPTURE_CONVERSION_FALL_LIMIT_POINTS).toBe(2)
  })

  it('reports how uncertain the difference is, without letting it change the verdict', () => {
    const tight = judgeCaptureConversion(at(50), at(47))
    const loose = judgeCaptureConversion(
      { settled: 120, converted: 60 },
      { settled: 120, converted: 56 },
    )
    expect(tight.verdict).toBe('move')
    expect(loose.verdict).toBe('move')
    expect(loose.standardErrorPoints).toBeGreaterThan(tight.standardErrorPoints as number)
  })

  it('says in words exactly what the verdict says in code', () => {
    const labels = { before: 'Before', after: 'After' }
    expect(conversionSentence(judgeCaptureConversion(at(60), at(50)), labels)).toContain(
      'the question moves to the ticket page',
    )
    expect(conversionSentence(judgeCaptureConversion(at(60), at(59)), labels)).toContain(
      'the question stays where it is',
    )
    expect(
      conversionSentence(judgeCaptureConversion({ settled: 1, converted: 0 }, at(60)), labels),
    ).toContain('Not enough evidence')
  })

  it('never says a rate fell when it rose', () => {
    const sentence = conversionSentence(judgeCaptureConversion(at(40), at(44)), {
      before: 'Before',
      after: 'After',
    })
    expect(sentence).toContain('rose 4.0 points')
    expect(sentence).not.toContain('fell')
  })
})

describe('AQ1: a reservation is attributed to the placement that was in force when it was made', () => {
  const decisions = [
    { id: 'd1', placement: 'checkout' as const, effectiveFrom: '2026-01-01T00:00:00.000Z', reason: 'first' },
    { id: 'd2', placement: 'ticket_page' as const, effectiveFrom: '2026-06-01T00:00:00.000Z', reason: 'moved' },
  ]
  const periods = placementPeriodsFrom(decisions)

  const reservation = (created_at: string, status: 'converted' | 'expired' | 'cancelled' | 'active') => ({
    created_at,
    status,
  })

  it('splits a decision log into half open periods', () => {
    expect(periods).toEqual([
      { placement: 'checkout', from: '2026-01-01T00:00:00.000Z', until: '2026-06-01T00:00:00.000Z' },
      { placement: 'ticket_page', from: '2026-06-01T00:00:00.000Z', until: null },
    ])
  })

  it('merges a decision that repeats the placement already in force', () => {
    const merged = placementPeriodsFrom([
      ...decisions,
      { id: 'd3', placement: 'ticket_page' as const, effectiveFrom: '2026-07-01T00:00:00.000Z', reason: 'again' },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[1].from).toBe('2026-06-01T00:00:00.000Z')
  })

  it('answers null before the first decision, which is the "before" half of the measurement', () => {
    expect(placementInForceAt(periods, '2025-12-31T23:59:59.999Z')).toBeNull()
    expect(placementInForceAt(periods, '2026-01-01T00:00:00.000Z')).toBe('checkout')
    expect(placementInForceAt(periods, '2026-05-31T23:59:59.999Z')).toBe('checkout')
    expect(placementInForceAt(periods, '2026-06-01T00:00:00.000Z')).toBe('ticket_page')
    expect(placementInForceAt(periods, '2030-01-01T00:00:00.000Z')).toBe('ticket_page')
  })

  it('buckets every settled reservation and excludes the ones still in flight', () => {
    const report = buildCaptureConversionReport(decisions, periods, [
      reservation('2025-06-01T00:00:00.000Z', 'converted'),
      reservation('2025-06-02T00:00:00.000Z', 'expired'),
      reservation('2026-02-01T00:00:00.000Z', 'converted'),
      reservation('2026-02-02T00:00:00.000Z', 'converted'),
      reservation('2026-02-03T00:00:00.000Z', 'cancelled'),
      reservation('2026-07-01T00:00:00.000Z', 'converted'),
      reservation('2026-07-02T00:00:00.000Z', 'expired'),
      reservation('2026-07-03T00:00:00.000Z', 'active'),
    ])

    expect(report.beforeTheQuestion).toMatchObject({ settled: 2, converted: 1, percent: 50 })
    expect(report.underCheckout).toMatchObject({ settled: 3, converted: 2 })
    expect(report.underTicketPage).toMatchObject({ settled: 2, converted: 1, percent: 50 })
    expect(report.inFlight).toBe(1)
    expect(report.currentPlacement).toBe('ticket_page')
  })

  it('a cancelled reservation counts as a non sale rather than being ignored', () => {
    const report = buildCaptureConversionReport(decisions, periods, [
      reservation('2026-02-01T00:00:00.000Z', 'converted'),
      reservation('2026-02-02T00:00:00.000Z', 'cancelled'),
    ])
    expect(report.underCheckout.percent).toBe(50)
  })

  it('reports nothing to compare rather than a zero when a placement has no reservations', () => {
    const report = buildCaptureConversionReport(decisions, periods, [])
    expect(report.underCheckout.percent).toBeNull()
    expect(report.theQuestionArriving.verdict).toBe('not-enough-evidence')
    expect(report.theMove.verdict).toBe('not-enough-evidence')
  })
})

// ---------------------------------------------------------------------------
// The decision log, and the reversal it exists to make possible.
// ---------------------------------------------------------------------------

describe('AQ1: the placement log is append only, and the database enforces it', () => {
  it('refuses UPDATE, DELETE and TRUNCATE on the decision log', () => {
    for (const verb of ['update', 'delete', 'truncate']) {
      expect(
        MIGRATION.includes(`before ${verb} on public.marketing_capture_placement`),
        `${verb} is refused`,
      ).toBe(true)
    }
    expect(MIGRATION).toContain('public.refuse_ledger_mutation()')
  })

  it('refuses UPDATE on the carrier, so the answer read is the answer given', () => {
    expect(MIGRATION).toContain('before update on public.marketing_capture_answer')
  })

  it('allows the carrier to leave with its reservation, and says why that is not the same thing', () => {
    expect(MIGRATION).toContain('on delete cascade')
    expect(MIGRATION).toContain('DELETE IS ALLOWED HERE AND REFUSED ON THE LEDGER')
  })

  it('cannot hold two decisions at the same instant, which would make attribution undecidable', () => {
    expect(MIGRATION).toContain('unique (effective_from)')
  })

  it('refuses a placement it does not know, and a decision with no reason', () => {
    expect(MIGRATION).toContain("check (placement in ('checkout', 'ticket_page'))")
    expect(MIGRATION).toContain('marketing_capture_placement_reason_present')
  })

  it('seeds the first decision from the ledger rather than from a date somebody typed', () => {
    expect(MIGRATION).toContain('select min(occurred_at)')
    expect(MIGRATION).toContain("where purpose = 'facilitated_event_marketing'")
    expect(MIGRATION).toMatch(/coalesce\([\s\S]*now\(\)\s*\)/)
  })
})

describe('AQ1: moving the question is a control, not a deploy', () => {
  const ADMIN_ACTION = read('src/app/admin/(authed)/audience/actions.ts')

  it('is reachable by an admin with the permission, and audit logged', () => {
    expect(ADMIN_ACTION).toContain("assertCan(session, 'admin.network.manage')")
    expect(ADMIN_ACTION).toContain('admin.audience.capture_placement_moved')
  })

  it('appends a decision and never edits one', () => {
    expect(ADMIN_ACTION).toContain('recordPlacementDecision')
    expect(ADMIN_ACTION).not.toContain('.update(')
  })

  it('refuses a decision nobody can argue with later', () => {
    expect(ADMIN_ACTION).toMatch(/min\(10,/)
  })
})

describe('AQ1: the carry can fail without costing anybody a ticket', () => {
  it('a duplicate carry is reported as success, because the first answer is the answer', () => {
    expect(CARRIER).toContain("error.code === '23505'")
  })

  it('the selector reports a failed carry and proceeds to the payment step regardless', () => {
    const selector = read('src/components/checkout/ticket-selector.tsx')
    expect(selector).toContain('carrying the discovery answer failed')
    expect(selector).toMatch(/await carryTheAnswer\(result\.reservation_id\)\n\s*router\.push/)
  })

  it('the action refuses a reservation the caller does not hold', () => {
    expect(CARRY_ACTION).toContain('that reservation is not yours')
    expect(CARRY_ACTION).toContain('getGuestSessionId')
  })

  it('the action refuses a reservation that is no longer active', () => {
    expect(CARRY_ACTION).toContain("reservation.status !== 'active'")
  })
})
