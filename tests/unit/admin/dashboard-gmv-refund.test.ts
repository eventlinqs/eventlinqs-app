import { describe, it, expect } from 'vitest'
import { aggregateGmv } from '@/lib/admin/analytics'

/**
 * PAY-02 proof.
 *
 * The admin dashboard GMV tiles must value refunded orders correctly, not count
 * them at full sale value. The old tile queried a non-existent
 * `total_amount_cents` column with `status = 'confirmed'` and never looked at
 * the refunds table; it is now wired to the audited `aggregateGmv` aggregator
 * on the real `total_cents` column, netting completed refunds.
 *
 * Scenario mirrors what the dashboard tile now pulls (paid statuses) plus the
 * completed refunds for those orders.
 */
describe('PAY-02: dashboard GMV nets refunds', () => {
  const orders = [
    // A clean confirmed sale, no refund.
    { total_cents: 10000, platform_fee_cents: 500, status: 'confirmed' },
    // Fully refunded: counted in gross, fully netted back out -> contributes 0.
    { total_cents: 3000, platform_fee_cents: 150, status: 'refunded' },
    // Partially refunded: counted in gross, partial netted -> contributes the retained 3000.
    { total_cents: 5000, platform_fee_cents: 250, status: 'partially_refunded' },
  ]
  const refunds = [
    { amount_cents: 3000, status: 'completed' }, // full refund of the 3000 order
    { amount_cents: 2000, status: 'completed' }, // partial refund of the 5000 order
  ]

  it('values a refunded order net, not at full sale value', () => {
    const s = aggregateGmv(orders, refunds)
    expect(s.grossGmvCents).toBe(18000) // 10000 + 3000 + 5000
    expect(s.refundedCents).toBe(5000) // 3000 + 2000
    // Net = 10000 (clean) + 0 (fully refunded) + 3000 (retained after partial) = 13000.
    expect(s.netGmvCents).toBe(13000)
  })

  it('a fully refunded order nets to zero', () => {
    const s = aggregateGmv(
      [{ total_cents: 4200, platform_fee_cents: 200, status: 'refunded' }],
      [{ amount_cents: 4200, status: 'completed' }],
    )
    expect(s.netGmvCents).toBe(0)
  })

  it('the old bug (gross, refunds ignored) would have overstated revenue', () => {
    // Documents the regression: counting gross while ignoring refunds = 18000,
    // which is 5000 too high versus the correct net of 13000.
    const s = aggregateGmv(orders, refunds)
    expect(s.grossGmvCents - s.netGmvCents).toBe(5000)
  })
})
