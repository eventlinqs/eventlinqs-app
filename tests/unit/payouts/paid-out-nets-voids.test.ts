import { describe, expect, test, vi } from 'vitest'

/**
 * V3 ITEM 8, A CLASS FOR THE LEDGER (WINDOW 4, 1 November 2026 06:40). A payout claim that fails is voided by a
 * compensating +adjustment (reference_type 'payout', void_payout and the venue twin), and a transfer pulled back for a
 * refund by a +adjustment marked reversal_of_transfer. Every reader that counted reason 'payout' as paid out and never
 * netted those showed MKLStudios' 448 failed claims as about A$22,019 paid out. Paid out is one rule now, here.
 */

vi.mock('@/lib/payments/pricing-rules', () => ({ getPayoutScheduleDays: vi.fn(async () => 3) }))

import { paidOutCents, SETTLED_OUTSIDE_PART } from '@/lib/payouts/paid-out'
import { summariseMoney, type MoneyLedgerRow } from '@/lib/payouts/money-summary'
import { aggregateVenueLedger } from '@/lib/admin/venues'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const ev = { id: 'ev_a', title: 'Afro-Fusion', end_date: '2026-10-10T12:00:00.000Z', status: 'published', timezone: 'Australia/Melbourne' }
const r = (over: Partial<MoneyLedgerRow>): MoneyLedgerRow => ({
  event_id: 'ev_a', delta_cents: 0, reason: 'adjustment', reference_id: null, ...over,
})

describe('paid out nets every row that undoes a payout', () => {
  test('a failed claim and its void cancel to nothing paid out', () => {
    expect(paidOutCents({ reason: 'payout', delta_cents: -4914 })).toBe(4914)
    expect(paidOutCents({ reason: 'adjustment', reference_type: 'payout', delta_cents: 4914 })).toBe(-4914)
  })
  test('a transfer pulled back for a refund takes it back out of paid out', () => {
    expect(paidOutCents({ reason: 'adjustment', reference_type: 'adjustment', reversal_of_transfer: 'true', delta_cents: 1000 })).toBe(-1000)
  })
  test('a settlement paid outside the platform is paid out', () => {
    expect(paidOutCents({ reason: 'adjustment', reference_type: 'adjustment', settlement_part: SETTLED_OUTSIDE_PART, delta_cents: -5400 })).toBe(5400)
  })
  test('any other adjustment, a sale or a refund is not a payout', () => {
    expect(paidOutCents({ reason: 'adjustment', reference_type: 'adjustment', settlement_part: 'law-24-fee-returned', delta_cents: 486 })).toBe(0)
    expect(paidOutCents({ reason: 'order_confirmed', delta_cents: 4914 })).toBe(0)
    expect(paidOutCents({ reason: 'refund_from_balance', delta_cents: -500 })).toBe(0)
  })
})

describe('the organiser money summary reads MKLStudios as it truly stands', () => {
  test('448 failed claims, each voided, then A$54.00 paid outside: A$54.00 paid out, nothing held', () => {
    const rows: MoneyLedgerRow[] = [r({ reason: 'order_confirmed', delta_cents: 4914, reference_id: 'ord_1' })]
    for (let i = 0; i < 448; i++) {
      rows.push(r({ reason: 'payout', reference_type: 'payout', delta_cents: -4914, reference_id: `po_${i}` }))
      rows.push(r({ reason: 'adjustment', reference_type: 'payout', delta_cents: 4914, reference_id: `po_${i}` }))
    }
    rows.push(r({ reference_type: 'adjustment', settlement_part: 'law-24-fee-returned', delta_cents: 486 }))
    rows.push(r({ reference_type: 'adjustment', settlement_part: SETTLED_OUTSIDE_PART, delta_cents: -5400 }))
    const s = summariseMoney({ rows, events: [ev], bufferDays: 3, canBePaid: true, now: NOW })
    expect(s.paidOutCents).toBe(5400)
    expect(s.heldCents).toBe(0)
    expect(s.salesCents).toBe(4914)
  })
  test('a claim still in flight counts as paid out until it is voided', () => {
    const s = summariseMoney({
      rows: [r({ reason: 'order_confirmed', delta_cents: 3000, reference_id: 'ord_1' }), r({ reason: 'payout', reference_type: 'payout', delta_cents: -3000 })],
      events: [ev], bufferDays: 3, canBePaid: true, now: NOW,
    })
    expect(s.paidOutCents).toBe(3000)
  })
})

describe('the admin venue ledger nets a failed venue transfer the same way', () => {
  test('a venue payout voided by its +adjustment reads nothing paid and the share payable again', () => {
    const agg = aggregateVenueLedger([
      { reason: 'accrual', reference_type: 'order', delta_cents: 700 },
      { reason: 'payout', reference_type: 'payout', delta_cents: -700 },
      { reason: 'adjustment', reference_type: 'payout', delta_cents: 700 },
    ])
    expect(agg).toEqual({ earnedNet: 700, paid: 0, payable: 700 })
  })
})
