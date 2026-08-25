/**
 * HOW LONG A REFUND TAKES TO REACH THE BUYER. One sentence, one source.
 *
 * SOURCED, NOT ESTIMATED (Law 7). Stripe's own refunds documentation:
 *
 *   "After you initiate a refund, Stripe submits refund requests to your
 *    customer's bank or card issuer. Your customer sees the refund as a credit
 *    approximately 5-10 business days later, depending upon the bank."
 *   https://docs.stripe.com/refunds (fetched 2026-08-23)
 *
 * Stripe is the processor that actually moves the money, so this is not a
 * competitor's marketing figure or a comfortable guess: it is the documented
 * behaviour of the system we are using.
 *
 * WHY THIS MODULE EXISTS. Before 23 August 2026 the platform stated this
 * timeframe on EIGHT buyer-facing surfaces and got it wrong on two of them:
 *
 *   refund-confirmation.ts   "within 3 to 5 business days. Some banks may take
 *                             up to 10 days."          UNDERSTATED
 *   event-state-banner.tsx   "within 5 business days"   UNDERSTATED
 *
 * A buyer who was refused, then approved, then emailed was told 5-10, then
 * 5-10, then 3-5. The number they hold us to is the shortest one, and the
 * shortest one was in the email they keep. Under the Australian Consumer Law a
 * timeframe stated three ways in a refund flow is not sloppy copy, it is a
 * representation about the service, and the ACCC treats a representation that
 * cannot be met as misleading conduct rather than as a typo.
 *
 * WHAT THIS IS NOT, because these were deliberately left alone. Three other
 * "business days" figures on the platform measure different things and must not
 * be collapsed into this one:
 *
 *   - ORGANISER PAYOUT: money reaching the organiser 3 to 5 business days after
 *     their event ends. A different party, a different transfer.
 *   - OUR RESPONSE SLA: replying to a refund request within 2 business days,
 *     and deciding a disputed one within 10. That is our promise about US, not
 *     about a bank.
 *   - PRIVACY ACKNOWLEDGEMENT: 5 business days to acknowledge a data request.
 *
 * THE REVERSAL CASE is included in the long sentence because it is the single
 * most common reason a buyer reports "the refund never arrived". Stripe, same
 * page: a refund issued shortly after the charge "appear[s] in the form of a
 * reversal instead of a refund. In the case of a reversal, the original charge
 * drops off the customer's statement, and a separate credit isn't issued." A
 * buyer hunting for a credit that will never appear will contact support, and
 * the sentence is cheaper than the ticket.
 */

/** The floor of Stripe's documented range. */
export const REFUND_ARRIVAL_MIN_BUSINESS_DAYS = 5

/** The ceiling of Stripe's documented range. */
export const REFUND_ARRIVAL_MAX_BUSINESS_DAYS = 10

/**
 * The window as a phrase, for sentences that build their own wording.
 *
 * Every buyer-facing statement of refund arrival time must interpolate THIS
 * rather than typing the numbers, so the eight surfaces cannot drift again.
 */
export const REFUND_ARRIVAL_WINDOW =
  `${REFUND_ARRIVAL_MIN_BUSINESS_DAYS} to ${REFUND_ARRIVAL_MAX_BUSINESS_DAYS} business days` as const

/** The plain sentence, when the amount is not known or not being restated. */
export function refundArrivalSentence(): string {
  return `The money goes back to the card you paid with. Most banks show it within ${REFUND_ARRIVAL_WINDOW}.`
}

/** The sentence for a surface that is already naming the amount. */
export function refundArrivalSentenceWithAmount(formattedAmount: string): string {
  return `Your refund of ${formattedAmount} will appear on your statement within ${REFUND_ARRIVAL_WINDOW}, depending on your bank.`
}

/**
 * The longer sentence, including the reversal case.
 *
 * Use where the buyer has time to read it and is most likely to go looking for
 * the money: the confirmation email and the order page.
 */
export function refundArrivalSentenceWithReversal(formattedAmount: string): string {
  return (
    `Your refund of ${formattedAmount} will appear on your statement within ${REFUND_ARRIVAL_WINDOW}, ` +
    'depending on your bank. If you paid recently, your bank may simply remove the original charge ' +
    'instead of adding a separate refund line.'
  )
}
