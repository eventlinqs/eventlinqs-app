import { describe, it, expect } from 'vitest'
import { allocateRefundAmountCents } from '@/lib/payments/refund-amount'

describe('allocateRefundAmountCents', () => {
  it('full selection returns the whole total', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 8000, allFaceCents: 8000 })).toBe(10000)
  })
  it('half the face value returns half the gross (rounded)', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 4000, allFaceCents: 8000 })).toBe(5000)
  })
  it('rounds to nearest cent', () => {
    expect(allocateRefundAmountCents({ totalCents: 10000, selectedFaceCents: 3333, allFaceCents: 10000 })).toBe(3333)
  })
  it('captures fees and inclusive GST proportionally (gross > face)', () => {
    // total gross 11500 (subtotal 10000 + fees/GST), face 10000; refund half the face.
    expect(allocateRefundAmountCents({ totalCents: 11500, selectedFaceCents: 5000, allFaceCents: 10000 })).toBe(5750)
  })
  it('throws on zero all-face', () => {
    expect(() => allocateRefundAmountCents({ totalCents: 1, selectedFaceCents: 1, allFaceCents: 0 })).toThrow()
  })
})
