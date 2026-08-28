import { describe, it, expect } from 'vitest'
import { resolveDiscountCents, DISCOUNT_MALFORMED } from '@/lib/payments/discount-math'

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * Migration 20260520000001 (P1-4) dropped discount_codes.discount_value and
 * split it into discount_percentage + discount_amount_cents. The checkout path
 * kept reading the dropped column, so from 20 May 2026 a percentage code
 * returned NaN and a fixed code returned undefined, both marked `valid: true`.
 * Nothing threw, no type error fired (the row is untyped from select('*')),
 * and there was no test on this file at all.
 *
 * The first test below is that exact row shape. It must never pass as valid.
 */
describe('resolveDiscountCents', () => {
  describe('the dropped-column regression', () => {
    it('refuses a percentage row whose amount columns are absent, and never returns NaN', () => {
      // Exactly what select('*') returns after the column was dropped: the old
      // field simply is not there.
      const row = { discount_type: 'percentage', discount_value: 20 } as never
      const r = resolveDiscountCents(row, 10_000)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe(DISCOUNT_MALFORMED)
    })

    it('refuses a fixed_amount row whose amount columns are absent', () => {
      const row = { discount_type: 'fixed_amount', discount_value: 1500 } as never
      expect(resolveDiscountCents(row, 10_000).ok).toBe(false)
    })

    it('never returns a non-finite discount for any malformed row', () => {
      const malformed = [
        { discount_type: 'percentage', discount_percentage: null, discount_amount_cents: null },
        { discount_type: 'percentage', discount_percentage: undefined, discount_amount_cents: null },
        { discount_type: 'percentage', discount_percentage: NaN, discount_amount_cents: null },
        { discount_type: 'percentage', discount_percentage: 'abc', discount_amount_cents: null },
        { discount_type: 'percentage', discount_percentage: '', discount_amount_cents: null },
        { discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: null },
        { discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: NaN },
        { discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: 'x' },
        { discount_type: 'unknown_type', discount_percentage: 10, discount_amount_cents: 100 },
      ]
      for (const row of malformed) {
        const r = resolveDiscountCents(row, 10_000)
        expect(r.ok, `expected refusal for ${JSON.stringify(row)}`).toBe(false)
      }
    })
  })

  describe('percentage codes', () => {
    it('takes the percentage off the subtotal', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: 20, discount_amount_cents: null },
        10_000,
      )
      expect(r).toEqual({ ok: true, discount_cents: 2_000 })
    })

    it('accepts a fractional percentage, because the column is NUMERIC(5,2)', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: 12.5, discount_amount_cents: null },
        10_000,
      )
      expect(r).toEqual({ ok: true, discount_cents: 1_250 })
    })

    it('accepts a NUMERIC delivered as a string, which PostgREST does', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: '20.00', discount_amount_cents: null },
        10_000,
      )
      expect(r).toEqual({ ok: true, discount_cents: 2_000 })
    })

    it('rounds to whole cents', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: 33.33, discount_amount_cents: null },
        999,
      )
      expect(r.ok && Number.isInteger(r.discount_cents)).toBe(true)
    })

    it('allows a 100 percent code to zero the order but never reverse it', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: 100, discount_amount_cents: null },
        4_500,
      )
      expect(r).toEqual({ ok: true, discount_cents: 4_500 })
    })

    it('refuses a percentage outside the CHECK constraint range', () => {
      for (const p of [0, -5, 100.01, 101, 1000]) {
        expect(
          resolveDiscountCents({ discount_type: 'percentage', discount_percentage: p, discount_amount_cents: null }, 10_000).ok,
          `percentage ${p} must be refused`,
        ).toBe(false)
      }
    })
  })

  describe('fixed amount codes', () => {
    it('takes the stored cents off the subtotal', () => {
      const r = resolveDiscountCents(
        { discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: 1_500 },
        10_000,
      )
      expect(r).toEqual({ ok: true, discount_cents: 1_500 })
    })

    it('caps at the subtotal so a large code cannot pay the buyer', () => {
      const r = resolveDiscountCents(
        { discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: 50_000 },
        1_000,
      )
      expect(r).toEqual({ ok: true, discount_cents: 1_000 })
    })

    it('refuses a zero or negative amount', () => {
      for (const c of [0, -100]) {
        expect(
          resolveDiscountCents({ discount_type: 'fixed_amount', discount_percentage: null, discount_amount_cents: c }, 10_000).ok,
        ).toBe(false)
      }
    })
  })

  describe('the subtotal itself', () => {
    it('resolves to zero off a zero subtotal rather than failing', () => {
      const r = resolveDiscountCents(
        { discount_type: 'percentage', discount_percentage: 50, discount_amount_cents: null },
        0,
      )
      expect(r).toEqual({ ok: true, discount_cents: 0 })
    })

    it('refuses a non-finite or negative subtotal', () => {
      for (const s of [NaN, Infinity, -1]) {
        expect(
          resolveDiscountCents({ discount_type: 'percentage', discount_percentage: 50, discount_amount_cents: null }, s).ok,
        ).toBe(false)
      }
    })
  })

  it('never returns NaN, a negative, or more than the subtotal, for any input', () => {
    const types = ['percentage', 'fixed_amount', 'bogus']
    const values: unknown[] = [null, undefined, NaN, 0, -1, 1, 20, 100, 101, '20', '', 'x', 1e9]
    const subtotals = [0, 1, 999, 10_000]
    for (const t of types) {
      for (const p of values) {
        for (const a of values) {
          for (const s of subtotals) {
            const r = resolveDiscountCents(
              { discount_type: t, discount_percentage: p as never, discount_amount_cents: a as never },
              s,
            )
            if (r.ok) {
              expect(Number.isFinite(r.discount_cents)).toBe(true)
              expect(r.discount_cents).toBeGreaterThanOrEqual(0)
              expect(r.discount_cents).toBeLessThanOrEqual(s)
            }
          }
        }
      }
    }
  })
})
