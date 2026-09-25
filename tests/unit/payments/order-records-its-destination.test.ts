/**
 * MONEY FIX A4: THE ORDER RECORDS WHERE ITS MONEY IS OWED.
 *
 * `order_stores_destination_account_fee_and_amount_due` is named in acceptance
 * line 3 of the item, and it did not exist until this file. The two charges that
 * caused the item settled into the platform account with nothing anywhere saying
 * who they belonged to; these are the cases that make that impossible.
 */
import { describe, expect, it, vi } from 'vitest'
import { ChargePreconditionError } from '@/lib/payments/application-fee'
import {
  composeOrderDestination,
  recordOrderDestination,
} from '@/lib/payments/order-destination'

const FACTS = {
  orderId: 'order_1',
  connectedAccountId: 'acct_organiser',
  totalCents: 10_000,
  organiserAmountDueCents: 9_000,
  currency: 'AUD',
}

const NOW = new Date('2026-09-20T12:00:00.000Z')

/** A supabase double whose update().eq().select() returns what the test wants. */
function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { client: { from } as never, from, update, eq, select }
}

describe('composeOrderDestination', () => {
  it('order_stores_destination_account_fee_and_amount_due', () => {
    const row = composeOrderDestination(FACTS, NOW)
    expect(row.destination_account_id).toBe('acct_organiser')
    expect(row.organiser_amount_due_cents).toBe(9_000)
    // Derived, never passed: what is left of the charge after the organiser.
    expect(row.platform_fee_retained_cents).toBe(1_000)
    // 1.7% of 10,000c plus 30c, per the published Australian rate.
    expect(row.stripe_processing_estimate_cents).toBe(200)
    expect(row.destination_recorded_at).toBe(NOW.toISOString())
  })

  it('the three amounts reconcile: the charge is the organiser plus the platform', () => {
    for (const due of [0, 1, 4_999, 9_999, 10_000]) {
      const row = composeOrderDestination({ ...FACTS, organiserAmountDueCents: due }, NOW)
      expect(row.organiser_amount_due_cents + row.platform_fee_retained_cents).toBe(FACTS.totalCents)
    }
  })

  it('a waived fee records a destination and a retained amount of zero, not an absent one', () => {
    // The founding-organiser case. A zero fee must still name where the money
    // goes: a waiver is a decision about the platform's share, never about
    // whether the organiser is owed the money.
    const row = composeOrderDestination({ ...FACTS, organiserAmountDueCents: 10_000 }, NOW)
    expect(row.destination_account_id).toBe('acct_organiser')
    expect(row.platform_fee_retained_cents).toBe(0)
    expect(row.organiser_amount_due_cents).toBe(10_000)
  })

  it('refuses by name when the organiser would be owed more than the charge', () => {
    expect(() =>
      composeOrderDestination({ ...FACTS, organiserAmountDueCents: 10_001 }, NOW),
    ).toThrowError(ChargePreconditionError)
    try {
      composeOrderDestination({ ...FACTS, organiserAmountDueCents: 10_001 }, NOW)
    } catch (error) {
      expect((error as ChargePreconditionError).reason).toBe('destination_not_recorded')
    }
  })

  it('refuses by name when there is no destination account to record', () => {
    try {
      composeOrderDestination({ ...FACTS, connectedAccountId: '' }, NOW)
      throw new Error('it did not refuse')
    } catch (error) {
      expect((error as ChargePreconditionError).reason).toBe('destination_not_recorded')
    }
  })

  it('records a null estimate rather than the Australian arithmetic in another currency', () => {
    const row = composeOrderDestination({ ...FACTS, currency: 'GBP' }, NOW)
    expect(row.stripe_processing_estimate_cents).toBeNull()
    // The other three facts are unaffected: the destination is known regardless.
    expect(row.destination_account_id).toBe('acct_organiser')
    expect(row.platform_fee_retained_cents).toBe(1_000)
  })
})

describe('recordOrderDestination', () => {
  it('writes the five columns to the order it names', async () => {
    const { client, from, update, eq } = clientReturning({ data: [{ id: 'order_1' }], error: null })
    await recordOrderDestination(FACTS, client, NOW)
    expect(from).toHaveBeenCalledWith('orders')
    expect(eq).toHaveBeenCalledWith('id', 'order_1')
    expect(update).toHaveBeenCalledWith({
      destination_account_id: 'acct_organiser',
      platform_fee_retained_cents: 1_000,
      stripe_processing_estimate_cents: 200,
      organiser_amount_due_cents: 9_000,
      destination_recorded_at: NOW.toISOString(),
    })
  })

  it('refuses by name when the write errors', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'permission denied' } })
    await expect(recordOrderDestination(FACTS, client, NOW)).rejects.toThrowError(
      ChargePreconditionError,
    )
  })

  /*
   * THE CASE THAT IS THE WHOLE POINT OF ASKING FOR THE IDS BACK.
   *
   * An UPDATE that matches nothing SUCCEEDS. PostgREST returns no error and an
   * empty array, so a function that only checked `error` would report success
   * while the order carried no destination, and the charge would be created
   * anyway. That is the same silence the item exists to end.
   */
  it('refuses when the update matched no rows, which is not an error', async () => {
    const { client } = clientReturning({ data: [], error: null })
    await expect(recordOrderDestination(FACTS, client, NOW)).rejects.toThrowError(
      /matched 0 row\(s\), not 1/,
    )
  })

  it('refuses when the update matched more than one row', async () => {
    const { client } = clientReturning({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    await expect(recordOrderDestination(FACTS, client, NOW)).rejects.toThrowError(
      /matched 2 row\(s\), not 1/,
    )
  })
})
