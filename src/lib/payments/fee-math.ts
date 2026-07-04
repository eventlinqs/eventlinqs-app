/**
 * Pure fee arithmetic - the SINGLE source of the per-order fee math.
 *
 * Both the server `PaymentCalculator` (the charge + payout authority) and the
 * client-side all-in display (ACCC drip-pricing compliance on the ticket
 * selector) call these functions, so the total shown to the buyer can never
 * diverge from the total charged. There is NO I/O here: the fee VALUES are
 * resolved upstream from `pricing_rules` (the one source of truth) and passed
 * in. This module owns the formula once so the law "do not fork or duplicate fee
 * logic" holds even across the server/client boundary.
 */

export type FeePassType = 'absorb' | 'pass_to_buyer'

/** The four fee values, resolved from pricing_rules for the order's scope. */
export interface FeeRates {
  /** Platform / service fee percent, e.g. 3.5 means 3.5%. */
  platformFeePercent: number
  /** Platform / service flat fee per ticket, in cents, e.g. 99 = AUD 0.99. */
  platformFeeFixedCents: number
  /** Payment processing percent, e.g. 2.5 means 2.5%. */
  processingFeePercent: number
  /** Payment processing flat component, in cents (0 under the locked model). */
  processingFeeFixedCents: number
}

export interface FeeLineCents {
  platform_fee_cents: number
  payment_processing_fee_cents: number
}

/**
 * The two fee lines, computed EXACTLY as the charge composes them.
 *
 * - The platform flat fee is multiplied per ticket (per-ticket service fee).
 * - The processing flat component is per ORDER, not per ticket.
 * - Both percentages apply to the post-discount merchandise subtotal.
 *
 * `Math.round` (half-up) matches the funds-holding charge rounding pinned by
 * tests/unit/payments/payment-calculator.test.ts.
 */
export function computeFeeLineCents(
  discountedSubtotalCents: number,
  ticketCount: number,
  rates: FeeRates,
): FeeLineCents {
  const platform_fee_cents = Math.round(
    (discountedSubtotalCents * rates.platformFeePercent) / 100 +
      ticketCount * rates.platformFeeFixedCents,
  )
  const payment_processing_fee_cents = Math.round(
    (discountedSubtotalCents * rates.processingFeePercent) / 100 +
      rates.processingFeeFixedCents,
  )
  return { platform_fee_cents, payment_processing_fee_cents }
}

/**
 * The all-in total the buyer pays, given who carries the fees.
 *
 * - PASS-ON (`pass_to_buyer`, the default): the fees are added on top of the
 *   subtotal, so the organiser keeps the full face value.
 * - ABSORB: the buyer pays the subtotal only; the fees come out of the
 *   organiser's payout (handled by the funds-holding payout math, unchanged).
 *
 * `taxCents` stays 0 under the GST-inclusive posture (the ticket and the fee are
 * GST-inclusive, so no separate GST line is ever added to the buyer total).
 */
export function computeAllInTotalCents(
  discountedSubtotalCents: number,
  fees: FeeLineCents,
  feePassType: FeePassType,
  taxCents = 0,
): number {
  if (feePassType === 'absorb') {
    return discountedSubtotalCents + taxCents
  }
  return (
    discountedSubtotalCents +
    fees.platform_fee_cents +
    fees.payment_processing_fee_cents +
    taxCents
  )
}
