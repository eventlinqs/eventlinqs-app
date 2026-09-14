import type { FeePassType } from '@/lib/payments/fee-math'

/**
 * READING A FORECAST OFF THE QUERY STRING.
 *
 * The result lives in the URL so it is shareable and survives a back button,
 * which means something has to turn a bag of possibly-repeated, possibly-absent
 * strings into the six values the arithmetic takes. That is this file, and it
 * exists as its own module for one reason: the PAGE must hold no arithmetic and
 * no parsing at all, so that the registered guard's scan of the rendering path
 * has nothing to argue about. A parse radix is not a fee, but a guard that has
 * to be told so is a guard with an allowance somebody will widen later.
 *
 * EVERY READ FAILS TO ZERO OR TO THE PLATFORM DEFAULT. A crafted URL cannot
 * produce a negative room, a negative price or a fee posture this platform does
 * not have; the worst it can do is render the empty form it started from.
 */

export type QueryValue = string | string[] | undefined

/** A repeated parameter is a form of tampering. Take the first and move on. */
export function one(value: QueryValue): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** A positive whole number, or zero for anything else. */
export function positiveInteger(value: QueryValue): number {
  const parsed = Number.parseInt(one(value) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** The platform's default is pass-on, so anything unrecognised is pass-on. */
export function feePassTypeFrom(value: QueryValue): FeePassType {
  return one(value) === 'absorb' ? 'absorb' : 'pass_to_buyer'
}

/** True only for the exact flag, so a stray parameter cannot light a banner. */
export function flagIsSet(value: QueryValue): boolean {
  return one(value) === '1'
}
