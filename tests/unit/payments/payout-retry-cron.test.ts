import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/payments/pricing-rules', () => ({ getPayoutScheduleDays: vi.fn().mockResolvedValue(3) }))

import { runEventDisbursements } from '@/lib/payments/event-transfer'

/* The disbursement cron asks payout-retry before it claims: an event whose last two transfers failed within the
 * day is skipped without a claim, a payout row or a Stripe call (the MKLStudios case, 448 hourly failures). */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

function client(attempts: Array<{ status: string; created_at: string }>) {
  const rpc = vi.fn(async () => ({ data: { success: false, error: 'nothing_to_disburse' }, error: null }))
  const from = vi.fn((table: string) => {
    const rows =
      table === 'events'
        ? [{ id: 'ev_1', organisation_id: 'org_1', end_date: hoursAgo(24 * 30), status: 'published', organisations: { stripe_account_id: 'acct_1', stripe_account_country: 'AU', payout_status: 'active' } }]
        : table === 'payouts'
          ? attempts
          : []
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'lte', 'is', 'order', 'limit', 'in']) b[m] = () => b
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok)
    return b
  })
  return { client: { from, rpc } as never, rpc }
}

describe('the cron honours the retry cap', () => {
  test('two failures within the day: skipped, no claim made', async () => {
    const { client: c, rpc } = client([{ status: 'failed', created_at: hoursAgo(1) }, { status: 'failed', created_at: hoursAgo(2) }])
    const s = await runEventDisbursements(c, {} as never, { balance: { retrieve: vi.fn() } } as never)
    expect(s.skipped).toBe(1)
    expect(s.results[0].error).toMatch(/^held after 2 failed transfers; next attempt /)
    expect(rpc).not.toHaveBeenCalledWith('disburse_transfer', expect.anything())
  })

  test('no failures: the claim is made as before', async () => {
    const { client: c, rpc } = client([])
    await runEventDisbursements(c, {} as never, { balance: { retrieve: vi.fn(async () => ({ available: [] })) } } as never)
    expect(rpc).toHaveBeenCalledWith('disburse_transfer', expect.anything())
  })
})
