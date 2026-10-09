import { describe, expect, test, vi } from 'vitest'

/**
 * MONEY FIX B7. The organiser's sales, refunds, payouts and next payout date,
 * summed from the ledger. These pin the arithmetic and, more importantly, pin
 * the payout date to the rule the disbursement cron actually runs, so the date
 * an organiser is shown is the date their money moves.
 */

vi.mock('@/lib/payments/pricing-rules', () => ({
  getPayoutScheduleDays: vi.fn(async () => 3),
}))

import {
  disbursementDueAt,
  summariseMoney,
  type MoneyEvent,
  type MoneyLedgerRow,
} from '@/lib/payouts/money-summary'

const NOW = new Date('2026-10-01T00:00:00.000Z')
const DAY = 86_400_000

const event = (over: Partial<MoneyEvent> = {}): MoneyEvent => ({
  id: 'ev_a',
  title: 'Lane A Night',
  end_date: '2026-10-10T12:00:00.000Z',
  status: 'published',
  timezone: 'Australia/Melbourne',
  ...over,
})
const row = (
  reason: string,
  delta: number,
  event_id: string | null = 'ev_a',
  reference_id: string | null = 'ord_1',
  refund_id: string | null = null,
): MoneyLedgerRow => ({
  reason,
  delta_cents: delta,
  event_id,
  reference_id,
  refund_id,
})

describe('the four facts come from the ledger rows and nothing else', () => {
  test('sales are the organiser share credited per order, refunds and payouts are what left', () => {
    const s = summariseMoney({
      rows: [
        row('order_confirmed', 5000, 'ev_a', 'ord_1'),
        row('order_confirmed', 2500, 'ev_a', 'ord_2'),
        row('reserve_hold', -500),
        row('reserve_release', 250),
        // ONE refund writes two rows: from the reserve, then from the balance.
        row('refund_from_reserve', -250, 'ev_a', 'ord_1', 'rf_1'),
        row('refund_from_balance', -2250, 'ev_a', 'ord_1', 'rf_1'),
        row('payout', -1000),
      ],
      events: [event()],
      bufferDays: 3,
      canBePaid: true,
      now: NOW,
    })
    expect(s.salesCents).toBe(7500)
    expect(s.salesCount).toBe(2)
    expect(s.refundedCents).toBe(2500)
    // Counted by refund, not by ledger row: the drive showed "2 refunds" for one.
    expect(s.refundCount).toBe(1)
    expect(s.paidOutCents).toBe(1000)
    // Held is the plain sum, the same arithmetic organiser_event_available_balance uses.
    expect(s.heldCents).toBe(5000 + 2500 - 500 + 250 - 250 - 2250 - 1000)
  })

  test('an organiser with no ledger rows is owed nothing and has no payout due', () => {
    const s = summariseMoney({ rows: [], events: [], bufferDays: 3, canBePaid: true, now: NOW })
    expect(s).toMatchObject({ salesCents: 0, refundedCents: 0, paidOutCents: 0, heldCents: 0, nextPayout: null })
  })
})

describe('the next payout date is the cron rule, as a date', () => {
  test('end date plus the buffer, for the earliest event still owed money', () => {
    const s = summariseMoney({
      rows: [row('order_confirmed', 2500, 'ev_late'), row('order_confirmed', 4000, 'ev_soon')],
      events: [
        event({ id: 'ev_late', title: 'Later', end_date: '2026-11-01T10:00:00.000Z' }),
        event({ id: 'ev_soon', title: 'Sooner', end_date: '2026-10-10T12:00:00.000Z' }),
      ],
      bufferDays: 3,
      canBePaid: true,
      now: NOW,
    })
    expect(s.nextPayout).toEqual({
      state: 'scheduled',
      dueAt: '2026-10-13T12:00:00.000Z',
      amountCents: 4000,
      eventId: 'ev_soon',
      eventTitle: 'Sooner',
      timezone: 'Australia/Melbourne',
    })
  })

  test('an event whose money is all refunded or paid out is not a next payout', () => {
    const s = summariseMoney({
      rows: [row('order_confirmed', 2500), row('refund_from_balance', -2500)],
      events: [event()],
      bufferDays: 3,
      canBePaid: true,
      now: NOW,
    })
    expect(s.nextPayout).toBeNull()
  })

  test('past the due time it says due, because the hourly run has not reached it yet', () => {
    const s = summariseMoney({
      rows: [row('order_confirmed', 2500)],
      events: [event({ end_date: '2026-09-20T12:00:00.000Z' })],
      bufferDays: 3,
      canBePaid: true,
      now: NOW,
    })
    expect(s.nextPayout?.state).toBe('due')
  })

  test('a postponed or cancelled event is held, never given a date', () => {
    for (const status of ['postponed', 'cancelled']) {
      const s = summariseMoney({
        rows: [row('order_confirmed', 2500)],
        events: [event({ status })],
        bufferDays: 3,
        canBePaid: true,
        now: NOW,
      })
      expect(s.nextPayout).toMatchObject({ state: 'held_event', eventStatus: status, amountCents: 2500 })
    }
  })

  test('an organisation that cannot be paid is told its money is held for setup', () => {
    const s = summariseMoney({
      rows: [row('order_confirmed', 2500)],
      events: [event()],
      bufferDays: 3,
      canBePaid: false,
      now: NOW,
    })
    expect(s.nextPayout).toEqual({ state: 'held_setup', amountCents: 2500 })
  })

  test('an event with no end date is never given a date, because the cron never selects it', () => {
    expect(disbursementDueAt(null, 3)).toBeNull()
    const s = summariseMoney({
      rows: [row('order_confirmed', 2500)],
      events: [event({ end_date: null })],
      bufferDays: 3,
      canBePaid: true,
      now: NOW,
    })
    expect(s.nextPayout).toBeNull()
  })
})

describe('the date agrees with the query the disbursement cron runs', () => {
  test('disbursementDueAt(end) <= now exactly when the cron selects end_date <= its cutoff', async () => {
    // Run the real runEventDisbursements against a client that records the
    // cutoff it filters on, then ask the pure rule the same question either
    // side of it. If the cron's arithmetic ever changes, this fails.
    const recorded: { cutoff?: string } = {}
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    Object.assign(builder, {
      select: chain,
      not: chain,
      eq: chain,
      limit: chain,
      lte: (_col: string, value: string) => {
        recorded.cutoff = value
        return builder
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    })
    const { runEventDisbursements } = await import('@/lib/payments/event-transfer')
    const before = Date.now()
    await runEventDisbursements({ from: () => builder } as never, {} as never, {} as never)
    const after = Date.now()
    expect(recorded.cutoff).toBeTruthy()
    const cutoff = Date.parse(recorded.cutoff!)
    // The cron's cutoff is now minus the same 3 days this module adds to end_date.
    expect(before - 3 * DAY - cutoff).toBeLessThanOrEqual(0)
    expect(cutoff - (after - 3 * DAY)).toBeLessThanOrEqual(0)
    const endAtCutoff = new Date(cutoff).toISOString()
    const endAfterCutoff = new Date(cutoff + 1000).toISOString()
    const dueAtCutoff = disbursementDueAt(endAtCutoff, 3)!.getTime()
    const dueAfterCutoff = disbursementDueAt(endAfterCutoff, 3)!.getTime()
    // An event ending exactly at the cutoff is selected by the cron and due by now.
    expect(dueAtCutoff).toBeLessThanOrEqual(after)
    // An event ending a second later is not selected, and is not yet due.
    expect(dueAfterCutoff).toBeGreaterThan(before)
  })
})
