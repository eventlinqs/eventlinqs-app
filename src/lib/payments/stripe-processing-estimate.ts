/**
 * WHAT STRIPE TAKES OUT OF THE PLATFORM BALANCE TO PUT A CARD THROUGH, AS AN
 * ESTIMATE, RECORDED ON THE ORDER AT CHARGE TIME (MONEY FIX A4).
 *
 * IT IS AN ESTIMATE AND THE NAME SAYS SO, because the true amount is on the
 * Stripe balance transaction and does not exist at the moment A4 asks for it.
 * The charge has not settled; an international card, a currency conversion or a
 * published rate change all move the number afterwards. So this figure is never
 * charged to anybody, never shown to a buyer, and never used to decide what an
 * organiser is owed. It exists so "what did this order leave us with" can be
 * answered from the order row rather than by hand out of Stripe, which is
 * exactly the question nobody could answer about the two Afro-Fusion charges.
 *
 * THE RATE, SOURCED, AND ONLY FOR AUSTRALIA. Stripe's Australian domestic card
 * rate is 1.7% + A$0.30, and Stripe states "Fees include GST", so nothing is
 * added on top of it (https://stripe.com/au/pricing, recorded with the date it
 * was last checked in docs/PRICING.md section 3). That page footnotes the 1.7%
 * with "Lower pricing from 1 Oct 2026" and does not publish the replacement,
 * so the rate after that date is UNSOURCED and this module must be re-derived
 * when Stripe publishes it.
 *
 * EVERY OTHER SETTLEMENT CURRENCY RETURNS null RATHER THAN THE AUSTRALIAN
 * ARITHMETIC. CONNECT_CURRENCY_MAP carries 32 countries and five currencies,
 * and Stripe publishes a different rate for each market. Applying the AU rate
 * to a GBP charge would produce a confident wrong number in a column whose
 * whole purpose is to be trusted later, which is worse than an empty one. null
 * means "no rate is recorded here for that currency", and the order row is
 * allowed to hold it.
 *
 * NO IMPORTS. This is reached from the charge creator, which is server-only,
 * but keeping it a leaf costs nothing and means it can never drag a dependency
 * anywhere (the reasoning written out in connect-currency.ts).
 */

/** Stripe AU domestic card, per cent. https://stripe.com/au/pricing */
export const STRIPE_AU_DOMESTIC_CARD_PERCENT = 1.7

/** Stripe AU domestic card, flat cents per transaction. https://stripe.com/au/pricing */
export const STRIPE_AU_DOMESTIC_CARD_FIXED_CENTS = 30

/** The settlement currencies this module has a published rate for. */
export const CURRENCIES_WITH_A_RECORDED_RATE = ['AUD'] as const

/**
 * What Stripe is expected to take out of a charge of `totalCents` in
 * `currency`, in cents. `null` when no rate is recorded for that currency.
 *
 * A zero or negative total returns 0 rather than the flat component: there is
 * no card to put through, so there is nothing to take. A free order never
 * reaches a charge at all, and this keeps the arithmetic honest if one ever
 * does.
 */
export function estimateStripeProcessingCents(
  totalCents: number,
  currency: string | null | undefined,
): number | null {
  const code = (currency ?? '').toUpperCase()
  if (!(CURRENCIES_WITH_A_RECORDED_RATE as readonly string[]).includes(code)) return null
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0
  return (
    Math.round((totalCents * STRIPE_AU_DOMESTIC_CARD_PERCENT) / 100) +
    STRIPE_AU_DOMESTIC_CARD_FIXED_CENTS
  )
}
