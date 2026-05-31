import { describe, it, expect } from 'vitest'
import { aggregateGmv } from '@/lib/admin/analytics'

describe('aggregateGmv', () => {
  const orders = [
    { total_cents: 10000, platform_fee_cents: 500, status: 'confirmed' },
    { total_cents: 5000, platform_fee_cents: 250, status: 'partially_refunded' },
    { total_cents: 3000, platform_fee_cents: 150, status: 'refunded' },
    { total_cents: 2000, platform_fee_cents: 100, status: 'pending' },     // excluded
    { total_cents: 1000, platform_fee_cents: 50, status: 'cancelled' },    // excluded
    { total_cents: 9000, platform_fee_cents: 450, status: 'expired' },     // excluded
  ]
  const refunds = [
    { amount_cents: 2000, status: 'completed' },
    { amount_cents: 500, status: 'processing' },   // excluded (not completed)
    { amount_cents: 800, status: 'failed' },        // excluded
  ]

  it('counts only paid statuses for gross GMV and platform revenue', () => {
    const s = aggregateGmv(orders, refunds)
    expect(s.grossGmvCents).toBe(18000) // 10000 + 5000 + 3000
    expect(s.platformRevenueCents).toBe(900) // 500 + 250 + 150
    expect(s.paidOrders).toBe(3)
  })

  it('nets only completed refunds', () => {
    const s = aggregateGmv(orders, refunds)
    expect(s.refundedCents).toBe(2000)
    expect(s.netGmvCents).toBe(16000) // 18000 - 2000
  })

  it('handles empty inputs', () => {
    expect(aggregateGmv([], [])).toEqual({
      grossGmvCents: 0, platformRevenueCents: 0, refundedCents: 0, netGmvCents: 0, paidOrders: 0,
    })
  })
})
