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

/**
 * THE FEE VALUES. ONE FEE, founder ruling 15 August 2026.
 *
 * ONE-FEE-ALLOW-BEGIN: this paragraph records WHAT WAS DELETED and why, which
 * requires naming it. Deleting the explanation would leave the next reader to
 * rediscover the reasoning from the migration history.
 *
 * There used to be two: a platform fee of 3.5% + AUD 0.99 per ticket, and a
 * SEPARATE payment processing fee of 2.5% of the order. The processing line is
 * DELETED. The buyer pays one all-in fee of 3.5% + AUD 0.99, the organiser keeps
 * 100 per cent of face value, free events stay free, and Stripe's cost now comes
 * out of the 3.5 rather than out of a line of its own.
 *
 * WHY THE DELETION ALSO REMOVES A LEGAL EXPOSURE, which is the part worth not
 * losing. Competition and Consumer Act 2010 s 55A(a) defines a payment surcharge
 * as "an amount charged, in addition to the price of goods or services, FOR
 * PROCESSING PAYMENT for the goods or services" - with NO requirement that it
 * vary by payment method. A buyer-facing line item named "payment processing
 * fee" answers that description on its face. The RBA's carve-out for booking and
 * service fees is worded as fees "unrelated to payment costs AND apply
 * regardless of the method of payment", which is a conjunctive test, so a
 * processing-named fee forfeits half of it even though it never varied by
 * method. One fee, not named after processing, sits inside the carve-out.
 * (RBA FAQ and RBA Q&A, both fetched 15 August 2026; CCA s 55A, compilation
 * 1 January 2026.)
 * ONE-FEE-ALLOW-END
 */
export interface FeeRates {
  /** Platform / service fee percent, e.g. 3.5 means 3.5%. */
  platformFeePercent: number
  /** Platform / service flat fee per ticket, in cents, e.g. 99 = AUD 0.99. */
  platformFeeFixedCents: number
}

export interface FeeLineCents {
  platform_fee_cents: number
  /**
   * ALWAYS 0 for any order priced after 15 August 2026.
   *
   * The field is KEPT rather than removed because `orders.processing_fee_cents`
   * is a real column holding real history: `connect-ledger.ts` reads it to
   * reconcile past payouts, and the organiser's own order view renders it. A
   * historical order must keep showing what it was actually charged. Removing
   * the field would either rewrite the past or crash the ledger.
   */
  payment_processing_fee_cents: number
}

/**
 * The fee line, computed EXACTLY as the charge composes it.
 *
 * - The flat fee is multiplied per ticket (a per-ticket service fee).
 * - The percentage applies to the post-discount merchandise subtotal.
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
  // One fee. Nothing computes a processing line any more; the historical column
  // keeps its old values and every new order records zero here.
  return { platform_fee_cents, payment_processing_fee_cents: 0 }
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
