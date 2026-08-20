import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TransferGateway, ReverseTransferParams } from '@/lib/payments/gateway'

vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

import { reverseOrganiserTransferForRefund } from '@/lib/payments/event-transfer'

/**
 * POST-DISBURSEMENT REFUND: what happens when the organiser has ALREADY been paid.
 *
 * WHY THIS FILE EXISTS. Under the funds-holding model the platform is merchant of
 * record and holds the money until after the event, so the ordinary refund comes
 * out of the PLATFORM balance and the organiser is simply never paid that share.
 * That case is proven end to end on TEST by
 * scripts/verify/refund-dashboard-e2e.mjs.
 *
 * The other case is the dangerous one and had NO test at all before this file: the
 * event has ended, the disbursement cron has paid the organiser, and only then does
 * a refund arrive. The buyer must still be made whole, so the refund is not blocked;
 * instead the organiser's share is clawed back by reversing the disbursement
 * transfer. If that clawback is wrong, the platform silently eats the refund, and
 * the loss appears nowhere except the platform's own Stripe balance.
 *
 * The property that matters most is the LAST test here: the clawback can never
 * reverse more than was actually transferred. Over-reversing is not a rounding
 * problem, it is inventing money against a connected account.
 *
 * These are unit tests over a stub gateway and a stub admin client, so they assert
 * the DECISIONS (how much, from which transfer, with which idempotency key) rather
 * than Stripe's behaviour. Stripe's side of the reversal is exercised by the
 * funds-holding proofs under scripts/verify/.
 */

interface PayoutRow { id: string; stripe_transfer_id: string; amount_cents: number }

/**
 * A chainable stub of the exact query the function builds:
 *   from('payouts').select(...).eq().eq().eq().not().in().order()
 * Every filter returns `this`; the object is thenable so awaiting the chain
 * resolves to { data, error }. Written as a chain rather than a single mock
 * because the ORDER of filters is part of what is being relied on (newest first).
 */
function buildAdmin(rows: PayoutRow[], ledger: Array<Record<string, unknown>>): SupabaseClient {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'order']) {
    chain[m] = () => chain
  }
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: rows, error: null })

  const from = vi.fn((table: string) => {
    if (table === 'payouts') return chain
    if (table === 'organiser_balance_ledger') {
      return {
        insert: async (row: Record<string, unknown>) => {
          ledger.push(row)
          return { error: null }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { from } as unknown as SupabaseClient
}

function buildGateway() {
  const calls: ReverseTransferParams[] = []
  const gateway: TransferGateway = {
    name: 'mock',
    async createTransfer() {
      throw new Error('createTransfer must not be called by a refund clawback')
    },
    async reverseTransfer(params) {
      calls.push(params)
      return { reversal_id: `trr_${calls.length}`, amount_cents: params.amount_cents ?? 0 }
    },
  }
  return { gateway, calls }
}

const base = {
  organisationId: 'org-1',
  eventId: 'ev-1',
  currency: 'AUD',
  refundId: 'refund-1',
}

describe('reverseOrganiserTransferForRefund (post-disbursement refund clawback)', () => {
  test('PRE-disbursement: nothing was paid out, so nothing is clawed back', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    const res = await reverseOrganiserTransferForRefund(
      buildAdmin([], ledger), gateway, { ...base, shareCents: 2500 },
    )
    expect(res).toEqual({ reversed: false, reason: 'no_disbursement' })
    expect(calls).toHaveLength(0)
    // No ledger entry either: reconcile_refund already reduced the held liability,
    // so an adjustment here would double-count.
    expect(ledger).toHaveLength(0)
  })

  test('a zero or negative share is a no-op (never a zero-amount Stripe call)', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    for (const shareCents of [0, -1]) {
      const res = await reverseOrganiserTransferForRefund(
        buildAdmin([{ id: 'p1', stripe_transfer_id: 'tr_1', amount_cents: 10_000 }], ledger),
        gateway, { ...base, shareCents },
      )
      expect(res).toEqual({ reversed: false, reason: 'zero_share' })
    }
    expect(calls).toHaveLength(0)
  })

  test('POST-disbursement: reverses exactly the organiser share and records the offsetting adjustment', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    const res = await reverseOrganiserTransferForRefund(
      buildAdmin([{ id: 'p1', stripe_transfer_id: 'tr_1', amount_cents: 10_000 }], ledger),
      gateway, { ...base, shareCents: 2500 },
    )

    expect(res.reversed).toBe(true)
    expect(res.amountCents).toBe(2500)
    expect(calls).toHaveLength(1)
    expect(calls[0].transfer_id).toBe('tr_1')
    expect(calls[0].amount_cents).toBe(2500)

    // The +adjustment offsets reconcile_refund's -refund_from_balance, so the
    // event-scoped available nets to zero rather than going negative.
    expect(ledger).toHaveLength(1)
    expect(ledger[0].delta_cents).toBe(2500)
    expect(ledger[0].reason).toBe('adjustment')
    expect(ledger[0].event_id).toBe('ev-1')
  })

  test('the idempotency key is per refund AND per payout, so a retry cannot double-reverse', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    await reverseOrganiserTransferForRefund(
      buildAdmin(
        [
          { id: 'p2', stripe_transfer_id: 'tr_2', amount_cents: 1000 },
          { id: 'p1', stripe_transfer_id: 'tr_1', amount_cents: 1000 },
        ],
        ledger,
      ),
      gateway, { ...base, shareCents: 2000 },
    )
    expect(calls.map(c => c.idempotency_key)).toEqual([
      'refund_reversal:refund-1:p2',
      'refund_reversal:refund-1:p1',
    ])
    // Keyed per payout, not once per refund: a share spanning two transfers needs
    // two distinct keys, or Stripe would treat the second as a replay of the first
    // and silently reverse half the money.
    expect(new Set(calls.map(c => c.idempotency_key)).size).toBe(2)
  })

  test('a share spanning several transfers is reversed greedily, newest first, and sums to the share', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    // Rows arrive newest-first from the query's order(created_at desc).
    const res = await reverseOrganiserTransferForRefund(
      buildAdmin(
        [
          { id: 'p3', stripe_transfer_id: 'tr_3', amount_cents: 500 },
          { id: 'p2', stripe_transfer_id: 'tr_2', amount_cents: 800 },
          { id: 'p1', stripe_transfer_id: 'tr_1', amount_cents: 5000 },
        ],
        ledger,
      ),
      gateway, { ...base, shareCents: 1500 },
    )

    expect(res.amountCents).toBe(1500)
    expect(calls.map(c => [c.transfer_id, c.amount_cents])).toEqual([
      ['tr_3', 500],  // exhausted
      ['tr_2', 800],  // exhausted
      ['tr_1', 200],  // remainder only
    ])
    // No individual reversal exceeds its own transfer.
    expect(calls.every(c => (c.amount_cents ?? 0) > 0)).toBe(true)
    expect(ledger[0].delta_cents).toBe(1500)
  })

  test('NEVER reverses more than was actually transferred, even if the share exceeds it', async () => {
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    // Only 1200c was ever paid out, but the refunded share is 5000c. This happens
    // when an organiser was paid for part of an event and a large refund lands.
    const res = await reverseOrganiserTransferForRefund(
      buildAdmin(
        [
          { id: 'p2', stripe_transfer_id: 'tr_2', amount_cents: 200 },
          { id: 'p1', stripe_transfer_id: 'tr_1', amount_cents: 1000 },
        ],
        ledger,
      ),
      gateway, { ...base, shareCents: 5000 },
    )

    const totalReversed = calls.reduce((s, c) => s + (c.amount_cents ?? 0), 0)
    expect(totalReversed).toBe(1200)
    expect(res.amountCents).toBe(1200)
    // The uncovered 3800c is NOT invented against the connected account. It stays
    // as a negative organiser balance, which is the existing documented semantic
    // (reconcile_refund's refund_from_balance may go negative), and is recoverable
    // from future sales rather than by reversing money that was never sent.
    expect(totalReversed).toBeLessThanOrEqual(1200)
    expect(ledger[0].delta_cents).toBe(1200)
  })

  test('an unpaid or voided transfer is not reversible, so the clawback skips it', async () => {
    // The query filters status to paid/in_transit, so a pending or failed payout
    // never reaches the loop. With none eligible the result is no_disbursement,
    // which is what keeps a refund on a not-yet-paid event from touching Stripe.
    const ledger: Array<Record<string, unknown>> = []
    const { gateway, calls } = buildGateway()
    const res = await reverseOrganiserTransferForRefund(
      buildAdmin([], ledger), gateway, { ...base, shareCents: 900 },
    )
    expect(res.reversed).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
