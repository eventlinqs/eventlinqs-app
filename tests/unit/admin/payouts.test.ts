import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the service-role client the data lib creates internally. Each builder is
// a thenable that resolves to a per-table payload; chain methods return self.
const datasets: Record<string, unknown[]> = {}
const rpcBalances: Record<string, number> = {}

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'range', 'in', 'eq', 'is', 'ilike', 'maybeSingle']) {
    b[m] = () => b
  }
  // Thenable: awaiting the builder yields { data, error }.
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: datasets[table] ?? [], error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    rpc: (_fn: string, args: { p_organisation_id: string }) =>
      Promise.resolve({ data: rpcBalances[args.p_organisation_id] ?? 0, error: null }),
  }),
}))

import { listOrgsForPayouts } from '@/lib/admin/payouts'

beforeEach(() => {
  for (const k of Object.keys(datasets)) delete datasets[k]
  for (const k of Object.keys(rpcBalances)) delete rpcBalances[k]
})

describe('listOrgsForPayouts aggregation', () => {
  it('joins balance (RPC), holds, pending count, and last payout per org', async () => {
    datasets.organisations = [
      { id: 'org1', name: 'Alpha', slug: 'alpha', payout_status: 'active', stripe_account_id: 'acct_1' },
      { id: 'org2', name: 'Beta', slug: 'beta', payout_status: 'on_hold', stripe_account_id: null },
    ]
    datasets.payout_holds = [
      { organisation_id: 'org1', amount_cents: 1000 },
      { organisation_id: 'org1', amount_cents: 840 },
    ]
    // Ordered desc by created_at: first row per org is the latest.
    datasets.payouts = [
      { organisation_id: 'org1', status: 'paid', created_at: '2026-05-30T00:00:00Z' },
      { organisation_id: 'org1', status: 'pending', created_at: '2026-05-29T00:00:00Z' },
      { organisation_id: 'org2', status: 'in_transit', created_at: '2026-05-28T00:00:00Z' },
    ]
    rpcBalances.org1 = 7360
    rpcBalances.org2 = 0

    const { rows } = await listOrgsForPayouts({})
    const a = rows.find(r => r.id === 'org1')!
    const b = rows.find(r => r.id === 'org2')!

    expect(a.availableCents).toBe(7360)
    expect(a.onHoldCents).toBe(1840)
    expect(a.pendingCount).toBe(1) // the pending row; paid is not counted
    expect(a.lastPayoutStatus).toBe('paid') // latest (first in desc order)
    expect(a.stripeAccountConnected).toBe(true)

    expect(b.availableCents).toBe(0)
    expect(b.onHoldCents).toBe(0)
    expect(b.pendingCount).toBe(1) // in_transit counts as pending
    expect(b.stripeAccountConnected).toBe(false)
    expect(b.payoutStatus).toBe('on_hold')
  })
})
