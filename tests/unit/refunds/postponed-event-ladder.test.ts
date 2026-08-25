/**
 * THE POSTPONED-EVENT LADDER.
 *
 * The competitor-parity audit called this the only launch-blocking gap, and the
 * measurement before the build confirmed both halves of it:
 *
 *   REFUNDS. src/lib/refunds/policy.ts overrode the organiser's policy for a
 *   CANCELLED event and had no branch at all for a POSTPONED one, so a
 *   postponed event fell through to the ordinary policy. An organiser on
 *   `no_refunds` refused the refund; an organiser on `days_before` refused it
 *   too, because that window is measured from a start date the postponement had
 *   already made meaningless.
 *
 *   PAYOUTS. findDisbursableEvents() selected on `end_date` alone and did not
 *   select `events.status` at all, so a postponed event was paid out to the
 *   organiser as soon as its ORIGINAL end date passed.
 *
 * Sources for every number and rule are cited in src/lib/refunds/postponement.ts
 * (Eventbrite's Postponed Event Policy, Ticketmaster AU Purchase Policy clause
 * 6.3, and the ACCC's consumer-rights page), all fetched 2026-08-23.
 *
 * EVERY OVERRIDE BELOW CARRIES A NEGATIVE CONTROL. The control is the SAME
 * inputs with the postponement removed, which must be REFUSED. Without it,
 * "the refund was allowed" would also pass if the policy module simply allowed
 * everything, which is precisely the failure mode a permissive default has.
 */
import { describe, it, expect } from 'vitest'

import {
  evaluatePostponement,
  RESCHEDULE_REFUND_WINDOW_DAYS,
  POSTPONEMENT_BECOMES_CANCELLATION_DAYS,
  NON_DISBURSABLE_EVENT_STATUSES,
} from '@/lib/refunds/postponement'
import { evaluateRefundEligibility, type RefundEligibilityInput } from '@/lib/refunds/policy'
import { buildEventSchemaPayload } from '@/components/features/events/event-schema-jsonld'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-08-23T10:00:00+10:00')
const days = (n: number) => new Date(NOW.getTime() - n * DAY)

/** An organiser who has switched refunds off entirely. The hardest case. */
const NO_REFUNDS = { type: 'no_refunds' as const, days: 0, absorbFee: false, selfService: false }
/** A window that closed a fortnight ago, measured from the original start date. */
const WINDOW_CLOSED = { type: 'days_before' as const, days: 7, absorbFee: false, selfService: false }

function order(overrides: Partial<RefundEligibilityInput> = {}): RefundEligibilityInput {
  return {
    policy: NO_REFUNDS,
    eventStatus: 'postponed',
    // The original date, already in the past: this is what a postponement
    // leaves behind, and what closed the ordinary window.
    eventStartDate: days(10),
    orderTotalCents: 4500,
    orderStatus: 'confirmed',
    liveTicketCount: 2,
    hasOpenRequest: false,
    now: NOW,
    postponedAt: days(3),
    rescheduledAt: null,
    ...overrides,
  }
}

describe('the ladder itself', () => {
  it('an event that was never postponed is untouched', () => {
    const v = evaluatePostponement({
      eventStatus: 'published', postponedAt: null, rescheduledAt: null, now: NOW,
    })
    expect(v.stage).toBe('none')
    expect(v.refundMandatory).toBe(false)
    expect(v.payoutHeld).toBe(false)
  })

  it('rung 1: postponed with no new date holds the payout and makes refunds mandatory', () => {
    const v = evaluatePostponement({
      eventStatus: 'postponed', postponedAt: days(1), rescheduledAt: null, now: NOW,
    })
    expect(v.stage).toBe('postponed_open')
    expect(v.refundMandatory).toBe(true)
    expect(v.payoutHeld).toBe(true)
  })

  it('rung 1 applies from DAY ZERO, not after Eventbrite’s 90-day discretion window', () => {
    // THE DELIBERATE DIVERGENCE. Eventbrite gives the organiser 90 days during
    // which they "can process refunds at their own discretion". Under Australian
    // Consumer Law the entitlement attaches to the major change, not to a
    // countdown, so importing that window would mean refusing refunds an
    // Australian buyer may already be entitled to.
    const v = evaluatePostponement({
      eventStatus: 'postponed', postponedAt: NOW, rescheduledAt: null, now: NOW,
    })
    expect(v.refundMandatory).toBe(true)
  })

  it.each([1, 30, 89])('stays a postponement at %i days', d => {
    const v = evaluatePostponement({
      eventStatus: 'postponed', postponedAt: days(d), rescheduledAt: null, now: NOW,
    })
    expect(v.stage).toBe('postponed_open')
  })

  it.each([90, 91, 200])('becomes an overdue cancellation at %i days', d => {
    // Eventbrite's own definition: "Cancelled - The event ... will not be
    // rescheduled within 90 days."
    const v = evaluatePostponement({
      eventStatus: 'postponed', postponedAt: days(d), rescheduledAt: null, now: NOW,
    })
    expect(v.stage).toBe('overdue_cancellation')
    expect(v.refundMandatory).toBe(true)
    expect(v.payoutHeld).toBe(true)
  })

  it('the 90-day threshold is the documented one, not an invented number', () => {
    expect(POSTPONEMENT_BECOMES_CANCELLATION_DAYS).toBe(90)
  })

  it('rung 2: a reschedule opens a decline window and releases the payout', () => {
    const v = evaluatePostponement({
      eventStatus: 'published', postponedAt: days(20), rescheduledAt: days(2), now: NOW,
    })
    expect(v.stage).toBe('rescheduled_window_open')
    expect(v.refundMandatory).toBe(true)
    expect(v.payoutHeld).toBe(false)
    expect(v.declineDeadline).toEqual(new Date(days(2).getTime() + RESCHEDULE_REFUND_WINDOW_DAYS * DAY))
  })

  it('rung 3: silence past the decline window is reconfirmation', () => {
    // Ticketmaster AU clause 6.3: "Failure to notify us by any reasonable
    // specified deadline ... will be deemed to be a reconfirmation of your
    // order."
    const v = evaluatePostponement({
      eventStatus: 'published',
      postponedAt: days(40),
      rescheduledAt: days(RESCHEDULE_REFUND_WINDOW_DAYS + 1),
      now: NOW,
    })
    expect(v.stage).toBe('rescheduled_window_closed')
    expect(v.refundMandatory).toBe(false)
    expect(v.payoutHeld).toBe(false)
  })

  it('the decline window boundary is inclusive on its last day', () => {
    const rescheduledAt = days(RESCHEDULE_REFUND_WINDOW_DAYS)
    const v = evaluatePostponement({
      eventStatus: 'published', postponedAt: days(40), rescheduledAt, now: NOW,
    })
    expect(v.stage).toBe('rescheduled_window_open')
  })
})

describe('the refund override, against the hardest organiser settings', () => {
  it('a postponed event is refundable even on a no_refunds policy', () => {
    const v = evaluateRefundEligibility(order({ policy: NO_REFUNDS }))
    expect(v.canRequest).toBe(true)
    expect(v.qualifiesForAuto).toBe(true)
    expect(v.reason).toBe('event_postponed_always_refundable')
  })

  it('negative control: the SAME order on a live event IS refused by that policy', () => {
    // This is what proves the assertion above measures the override rather than
    // a policy module that says yes to everything.
    const v = evaluateRefundEligibility(
      order({ policy: NO_REFUNDS, eventStatus: 'published', postponedAt: null }),
    )
    expect(v.canRequest).toBe(false)
    expect(v.reason).toBe('policy_no_refunds')
  })

  it('a postponed event is refundable even though the days_before window closed', () => {
    const v = evaluateRefundEligibility(order({ policy: WINDOW_CLOSED }))
    expect(v.canRequest).toBe(true)
    expect(v.reason).toBe('event_postponed_always_refundable')
  })

  it('negative control: the SAME order on a live event IS refused as window_closed', () => {
    const v = evaluateRefundEligibility(
      order({ policy: WINDOW_CLOSED, eventStatus: 'published', postponedAt: null }),
    )
    expect(v.canRequest).toBe(false)
    expect(v.reason).toBe('window_closed')
  })

  it('a rescheduled event is refundable inside the decline window, with the deadline shown', () => {
    const rescheduledAt = days(2)
    const v = evaluateRefundEligibility(
      order({ eventStatus: 'published', rescheduledAt, postponedAt: days(20) }),
    )
    expect(v.canRequest).toBe(true)
    expect(v.reason).toBe('reschedule_decline_window_open')
    expect(v.deadline).toEqual(new Date(rescheduledAt.getTime() + RESCHEDULE_REFUND_WINDOW_DAYS * DAY))
  })

  it('once the decline window closes the organiser’s policy applies again', () => {
    const v = evaluateRefundEligibility(
      order({
        eventStatus: 'published',
        policy: NO_REFUNDS,
        postponedAt: days(40),
        rescheduledAt: days(RESCHEDULE_REFUND_WINDOW_DAYS + 1),
      }),
    )
    expect(v.canRequest).toBe(false)
    expect(v.reason).toBe('policy_no_refunds')
  })

  it('a cancelled event still wins, and is not shadowed by the new branch', () => {
    const v = evaluateRefundEligibility(order({ eventStatus: 'cancelled' }))
    expect(v.reason).toBe('event_cancelled_always_refundable')
  })

  it('a free order is still not refundable, postponed or not', () => {
    // The order-level facts must keep running before the event-level override:
    // there is nothing to refund on a free ticket whatever happened to the event.
    const v = evaluateRefundEligibility(order({ orderTotalCents: 0 }))
    expect(v.reason).toBe('free_order')
  })
})

describe('the payout hold', () => {
  it('names exactly the two statuses that must never be paid out', () => {
    expect([...NON_DISBURSABLE_EVENT_STATUSES].sort()).toEqual(['cancelled', 'postponed'])
  })

  it('negative control: a completed event is NOT in the held list', () => {
    // Without this, a list that happened to contain every status would pass.
    expect((NON_DISBURSABLE_EVENT_STATUSES as readonly string[])).not.toContain('completed')
    expect((NON_DISBURSABLE_EVENT_STATUSES as readonly string[])).not.toContain('published')
  })

  it('the held statuses agree with the ladder that decides refunds', () => {
    // One decision, two consumers. If these ever disagree, the platform is
    // refunding a buyer out of money it has already paid to the organiser.
    for (const status of NON_DISBURSABLE_EVENT_STATUSES) {
      if (status === 'cancelled') continue // cancelled is handled before the ladder
      const v = evaluatePostponement({
        eventStatus: status, postponedAt: days(1), rescheduledAt: null, now: NOW,
      })
      expect(v.payoutHeld).toBe(true)
    }
  })
})

describe('the rescheduled event tells Google the truth', () => {
  const base = {
    organisation: { name: 'Owambe Sydney', slug: 'owambe-sydney', description: null },
    ticketTiers: [{ id: 't1', name: 'General', price: 3000, currency: 'AUD' }],
    baseUrl: 'https://www.eventlinqs.com.au',
  }
  const event = (overrides: Record<string, unknown>) =>
    ({
      slug: 'night', title: 'Night', summary: 'A night.', created_at: '2026-07-01T09:00:00+10:00',
      start_date: '2026-11-01T21:00:00+11:00', end_date: '2026-11-02T02:00:00+11:00',
      event_type: 'physical', venue_name: 'The Night Cat', venue_address: '141 Johnston St',
      venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'AU',
      category: { slug: 'music', name: 'Music' }, ...overrides,
    }) as never

  it('emits previousStartDate AND EventRescheduled together', () => {
    // Google: "If you add previousStartDate, you must also add the eventStatus
    // property and set the eventStatus to EventRescheduled."
    const p = buildEventSchemaPayload({
      ...base,
      event: event({ previous_start_date: '2026-09-05T21:00:00+10:00' }),
      state: 'upcoming',
    } as never) as Record<string, unknown>
    expect(p.eventStatus).toBe('https://schema.org/EventRescheduled')
    expect(p.previousStartDate).toBe('2026-09-05T21:00:00+10:00')
    expect(p.startDate).toBe('2026-11-01T21:00:00+11:00')
  })

  it('a STILL-postponed event says EventPostponed and offers no previousStartDate', () => {
    // It has been moved off its old date but has no new one, so startDate is not
    // yet "the newly scheduled start date" the pairing requires.
    const p = buildEventSchemaPayload({
      ...base,
      event: event({ previous_start_date: '2026-09-05T21:00:00+10:00' }),
      state: 'postponed',
    } as never) as Record<string, unknown>
    expect(p.eventStatus).toBe('https://schema.org/EventPostponed')
    expect('previousStartDate' in p).toBe(false)
  })

  it('negative control: an ordinary event emits neither', () => {
    const p = buildEventSchemaPayload({
      ...base, event: event({}), state: 'upcoming',
    } as never) as Record<string, unknown>
    expect(p.eventStatus).toBe('https://schema.org/EventScheduled')
    expect('previousStartDate' in p).toBe(false)
  })
})
