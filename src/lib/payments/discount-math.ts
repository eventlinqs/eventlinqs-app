/**
 * WHAT A DISCOUNT CODE IS WORTH, as a pure function.
 *
 * WHY THIS IS ITS OWN MODULE. Migration 20260520000001 (P1-4) dropped the
 * polymorphic `discount_value` column and split it into `discount_percentage`
 * and `discount_amount_cents`. The checkout path kept reading the dropped
 * column, so it read `undefined`, and a percentage code computed
 * `Math.round(subtotal * (undefined / 100))` = NaN while a fixed code returned
 * `undefined` - and both were handed back as `valid: true`. The row still
 * parsed, nothing threw, and no test existed, so a NaN discount sat on the
 * money path from 20 May 2026.
 *
 * TypeScript could not see it: the row arrives from `select('*')` untyped, so
 * the generated Database types, which carry only the two new columns, were
 * never consulted. The defence is therefore not the type system. It is this
 * function, which takes the columns explicitly, refuses anything that is not a
 * finite positive number, and is tested against every shape the table allows.
 */

export interface DiscountRow {
  discount_type: string
  /** Percent off, 0 < p <= 100. Set only when discount_type is 'percentage'. */
  discount_percentage: number | string | null | undefined
  /** Fixed amount in cents. Set only when discount_type is 'fixed_amount'. */
  discount_amount_cents: number | string | null | undefined
}

export type DiscountAmount =
  | { ok: true; discount_cents: number }
  | { ok: false; reason: string }

/** The one message a buyer sees when a code exists but its amount is unusable. */
export const DISCOUNT_MALFORMED = 'This code is not set up correctly and cannot be applied'

/**
 * Resolve what a code takes off an order, in cents.
 *
 * Never returns NaN, never returns a negative, and never returns more than the
 * subtotal. A row whose amount column is null, absent, non-numeric or
 * non-positive is refused rather than silently treated as zero, because a code
 * that quietly does nothing is the defect this module exists to end.
 */
export function resolveDiscountCents(row: DiscountRow, orderSubtotalCents: number): DiscountAmount {
  if (!Number.isFinite(orderSubtotalCents) || orderSubtotalCents < 0) {
    return { ok: false, reason: DISCOUNT_MALFORMED }
  }

  let cents: number

  if (row.discount_type === 'percentage') {
    const percentage = toFiniteNumber(row.discount_percentage)
    // The DB CHECK allows 0 < p <= 100; anything else is a corrupt row.
    if (percentage === null || percentage <= 0 || percentage > 100) {
      return { ok: false, reason: DISCOUNT_MALFORMED }
    }
    cents = Math.round(orderSubtotalCents * (percentage / 100))
  } else if (row.discount_type === 'fixed_amount') {
    const amount = toFiniteNumber(row.discount_amount_cents)
    if (amount === null || amount <= 0) {
      return { ok: false, reason: DISCOUNT_MALFORMED }
    }
    cents = Math.round(amount)
  } else {
    return { ok: false, reason: DISCOUNT_MALFORMED }
  }

  // Cap at the subtotal: a discount may zero an order, never reverse it.
  cents = Math.min(cents, orderSubtotalCents)

  if (!Number.isFinite(cents) || cents < 0) return { ok: false, reason: DISCOUNT_MALFORMED }
  return { ok: true, discount_cents: cents }
}

/**
 * Postgres NUMERIC arrives over PostgREST as a string often enough that a bare
 * typeof check would refuse a perfectly good row. `null`, `undefined`, `''` and
 * anything non-numeric all come back as null so one branch handles them.
 */
function toFiniteNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
