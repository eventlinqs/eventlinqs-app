/*
 * THE REFUND POLICY DECISION, AND THE ONE-WAY RULE.
 *
 * The one-way rule exists in two places by design: a database trigger that cannot
 * be bypassed, and a TypeScript copy so the edit screen can refuse in words before
 * the save. Two copies of a rule is normally the defect this codebase removes, so
 * the cases below are written as ONE table driven through the TypeScript copy here
 * and through the SQL copy in scripts/verify/refund-policy-drill.mjs, so a change
 * to one that is not made to the other shows up.
 *
 * DIRECTION IS THE THING MOST LIKELY TO BE GOT BACKWARDS and is therefore tested
 * from both ends: a SMALLER number of days is LOOSER, because it lets a buyer ask
 * later.
 */
import { describe, expect, test } from 'vitest'
import {
  evaluateRefundEligibility,
  describeRefundPolicy,
  refundPolicyBadge,
  refundDeadline,
  isLooserOrEqual,
  explainTightening,
  policyFromEvent,
  type RefundPolicy,
} from '@/lib/refunds/policy'

const OPEN: RefundPolicy = { type: 'days_before', days: 7, absorbFee: false, selfService: false }
const NONE: RefundPolicy = { type: 'no_refunds', days: 7, absorbFee: false, selfService: false }

const START = new Date('2026-12-01T19:00:00+11:00')
const base = {
  policy: OPEN,
  eventStatus: 'published' as const,
  eventStartDate: START,
  orderTotalCents: 5000,
  orderStatus: 'confirmed',
  liveTicketCount: 2,
  hasOpenRequest: false,
  now: new Date('2026-11-01T00:00:00+11:00'),
}

describe('the request window', () => {
  test('inside the window a buyer may request, and it qualifies for auto', () => {
    const r = evaluateRefundEligibility(base)
    expect(r.canRequest).toBe(true)
    expect(r.qualifiesForAuto).toBe(true)
    expect(r.reason).toBe('within_policy')
  })

  test('past the cut-off the request is refused, and the message says when it closed', () => {
    const r = evaluateRefundEligibility({ ...base, now: new Date('2026-11-29T00:00:00+11:00') })
    expect(r.canRequest).toBe(false)
    expect(r.reason).toBe('window_closed')
    // EVERY REFUSAL NAMES ITS REAL CAUSE. "Not on sale yet" once described a sales
    // window that did not exist, so a refusal that does not say WHY is a defect.
    expect(r.message).toMatch(/closed on/i)
    expect(r.message).toMatch(/7 days before/i)
  })

  test('the deadline is exactly N days before the start', () => {
    const d = refundDeadline(OPEN, START)
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe(new Date('2026-11-24T19:00:00+11:00').toISOString())
  })

  test('days = 0 means refundable right up to the start', () => {
    const p: RefundPolicy = { ...OPEN, days: 0 }
    const justBefore = evaluateRefundEligibility({
      ...base, policy: p, now: new Date('2026-12-01T18:00:00+11:00'),
    })
    expect(justBefore.canRequest).toBe(true)
    const justAfter = evaluateRefundEligibility({
      ...base, policy: p, now: new Date('2026-12-01T20:00:00+11:00'),
    })
    expect(justAfter.canRequest).toBe(false)
  })

  test('no_refunds refuses, and does not pretend there is a deadline', () => {
    const r = evaluateRefundEligibility({ ...base, policy: NONE })
    expect(r.canRequest).toBe(false)
    expect(r.reason).toBe('policy_no_refunds')
    expect(r.deadline).toBeNull()
  })
})

describe('the overrides that beat the policy', () => {
  test('a CANCELLED event is refundable even under no_refunds and even past the window', () => {
    // Eventbrite states this in the same breath as the no-refunds option: "if your
    // event is cancelled, you're required to issue refunds".
    const r = evaluateRefundEligibility({
      ...base,
      policy: NONE,
      eventStatus: 'cancelled',
      now: new Date('2027-01-01T00:00:00+11:00'),
    })
    expect(r.canRequest).toBe(true)
    expect(r.qualifiesForAuto).toBe(true)
    expect(r.reason).toBe('event_cancelled_always_refundable')
  })

  test('a free order has nothing to refund, and is told so without being told to wait', () => {
    const r = evaluateRefundEligibility({ ...base, orderTotalCents: 0 })
    expect(r.canRequest).toBe(false)
    expect(r.reason).toBe('free_order')
    expect(r.message).toMatch(/free ticket/i)
  })

  test('CONTROL: the cancelled override is checked BEFORE the window, not after', () => {
    // If the ordering were wrong this would come back window_closed, which is the
    // exact bug the override exists to prevent: an organiser cancels, and the
    // platform tells the buyer they are too late to ask for their money back.
    const r = evaluateRefundEligibility({
      ...base, eventStatus: 'cancelled', now: new Date('2027-06-01T00:00:00+11:00'),
    })
    expect(r.reason).not.toBe('window_closed')
    expect(r.canRequest).toBe(true)
  })
})

describe('order-level facts come first', () => {
  test('an already refunded order is refused as refunded, not as out of window', () => {
    const r = evaluateRefundEligibility({ ...base, orderStatus: 'refunded' })
    expect(r.reason).toBe('order_not_refundable')
    expect(r.message).toMatch(/refunded/)
  })

  test('an order with no live tickets is refused for that reason', () => {
    const r = evaluateRefundEligibility({ ...base, liveTicketCount: 0 })
    expect(r.reason).toBe('no_live_tickets')
  })

  test('a second request while one is open is refused, and says one is open', () => {
    const r = evaluateRefundEligibility({ ...base, hasOpenRequest: true })
    expect(r.canRequest).toBe(false)
    expect(r.reason).toBe('request_already_open')
    expect(r.message).toMatch(/already have a refund request open/i)
  })

  test('a partially refunded order can still be asked about', () => {
    const r = evaluateRefundEligibility({ ...base, orderStatus: 'partially_refunded' })
    expect(r.canRequest).toBe(true)
  })
})

/*
 * THE ONE-WAY RULE. The table below is the contract. It is deliberately explicit
 * about direction in both directions, because "looser" inverts for the day count
 * and that is the half a reader gets wrong.
 */
const ONE_WAY_CASES: Array<{ name: string; from: RefundPolicy; to: RefundPolicy; allowed: boolean }> = [
  {
    name: 'no change at all',
    from: OPEN, to: { ...OPEN }, allowed: true,
  },
  {
    name: 'shortening the notice period 30 -> 1 is LOOSER (buyer can ask later)',
    from: { ...OPEN, days: 30 }, to: { ...OPEN, days: 1 }, allowed: true,
  },
  {
    name: 'lengthening the notice period 1 -> 30 is TIGHTER (buyer must ask earlier)',
    from: { ...OPEN, days: 1 }, to: { ...OPEN, days: 30 }, allowed: false,
  },
  {
    name: 'no_refunds -> days_before is LOOSER',
    from: NONE, to: OPEN, allowed: true,
  },
  {
    name: 'days_before -> no_refunds is TIGHTER',
    from: OPEN, to: NONE, allowed: false,
  },
  {
    name: 'turning self-service ON is LOOSER',
    from: OPEN, to: { ...OPEN, selfService: true }, allowed: true,
  },
  {
    name: 'turning self-service OFF is TIGHTER',
    from: { ...OPEN, selfService: true }, to: OPEN, allowed: false,
  },
  {
    name: 'starting to absorb the fee is LOOSER',
    from: OPEN, to: { ...OPEN, absorbFee: true }, allowed: true,
  },
  {
    name: 'stopping absorbing the fee is TIGHTER',
    from: { ...OPEN, absorbFee: true }, to: OPEN, allowed: false,
  },
  {
    name: 'loosening the days while tightening self-service is still TIGHTER',
    from: { ...OPEN, days: 30, selfService: true }, to: { ...OPEN, days: 1, selfService: false }, allowed: false,
  },
]

describe('the one-way rule (TypeScript copy)', () => {
  for (const c of ONE_WAY_CASES) {
    test(`${c.allowed ? 'ALLOWS' : 'REFUSES'}: ${c.name}`, () => {
      expect(isLooserOrEqual(c.from, c.to)).toBe(c.allowed)
    })
  }

  test('every refusal explains itself in words an organiser can act on', () => {
    for (const c of ONE_WAY_CASES.filter(x => !x.allowed)) {
      const why = explainTightening(c.from, c.to)
      expect(why.length, c.name).toBeGreaterThan(40)
      expect(why, c.name).not.toMatch(/error|invalid|failed/i)
    }
  })

  test('CONTROL: the rule is capable of refusing, so the ALLOWS above are not vacuous', () => {
    const refusals = ONE_WAY_CASES.filter(c => !isLooserOrEqual(c.from, c.to))
    expect(refusals.length).toBeGreaterThanOrEqual(5)
  })

  test('the exported case table is what the SQL drill reads, so the two stay in step', () => {
    // If this count changes without scripts/verify/refund-policy-drill.mjs being
    // re-run, the two copies of the rule have drifted apart untested.
    expect(ONE_WAY_CASES.length).toBe(10)
  })
})

describe('what a buyer reads before paying', () => {
  test('the policy description names the window, the fee and who decides', () => {
    const s = describeRefundPolicy({ type: 'days_before', days: 7, absorbFee: true, selfService: true }, false)
    expect(s).toMatch(/7 days before/)
    expect(s).toMatch(/covers the booking fee/i)
    expect(s).toMatch(/automatic/i)
    expect(s).toMatch(/cancelled/i)
  })

  test('a no-refunds policy still promises a refund on cancellation', () => {
    const s = describeRefundPolicy(NONE, false)
    expect(s).toMatch(/no refunds/i)
    expect(s).toMatch(/cancelled you will be refunded/i)
  })

  test('a free event says so instead of quoting a window', () => {
    const s = describeRefundPolicy(OPEN, true)
    expect(s).toMatch(/free event/i)
    expect(s).not.toMatch(/7 days/)
  })

  test('the badge is short and never empty', () => {
    expect(refundPolicyBadge(OPEN, false)).toBe('Refundable to 7 days before')
    expect(refundPolicyBadge({ ...OPEN, days: 1 }, false)).toBe('Refundable to 1 day before')
    expect(refundPolicyBadge({ ...OPEN, days: 0 }, false)).toBe('Refundable until start')
    expect(refundPolicyBadge(NONE, false)).toBe('No refunds')
    expect(refundPolicyBadge(OPEN, true)).toBe('Free event')
  })

  test('NO EM DASHES OR EN DASHES in anything a buyer reads', () => {
    const strings = [
      describeRefundPolicy(OPEN, false),
      describeRefundPolicy(NONE, false),
      describeRefundPolicy(OPEN, true),
      refundPolicyBadge(OPEN, false),
      evaluateRefundEligibility(base).message,
      evaluateRefundEligibility({ ...base, policy: NONE }).message,
      evaluateRefundEligibility({ ...base, orderTotalCents: 0 }).message,
      evaluateRefundEligibility({ ...base, now: new Date('2026-11-29T00:00:00+11:00') }).message,
      ...ONE_WAY_CASES.filter(c => !c.allowed).map(c => explainTightening(c.from, c.to)),
    ]
    for (const s of strings) {
      expect(s, s).not.toMatch(/[–—]/)
      expect(s, s).not.toMatch(/!/)
    }
  })
})

describe('policyFromEvent', () => {
  test('reads the four columns', () => {
    const p = policyFromEvent({
      refund_policy_type: 'no_refunds',
      refund_policy_days: 3,
      refund_policy_absorb_fee: true,
      refund_policy_self_service: true,
    })
    expect(p).toEqual({ type: 'no_refunds', days: 3, absorbFee: true, selfService: true })
  })

  test('an absent policy falls back to the migration default rather than to no_refunds', () => {
    // The dangerous silent failure would be defaulting to the STRICT setting: it
    // would refuse every buyer on the platform and read as a policy decision
    // rather than as an unapplied migration.
    const p = policyFromEvent({})
    expect(p.type).toBe('days_before')
    expect(p.days).toBe(7)
  })
})
