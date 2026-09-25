/**
 * WHAT ONE TICKET ACTUALLY COSTS, AND THE LOWEST SUCH NUMBER ON AN EVENT.
 *
 * ============================================================================
 * WHY THIS EXISTS AND WHY IT IS FOUR LINES OF ARITHMETIC IT DOES NOT OWN
 * ============================================================================
 *
 * Close-out SEO4: "Never show a price that is not the price", and "where an
 * event has tiers, the from price is the lowest all in total, not the lowest
 * ticket price".
 *
 * A live audit on 13 September 2026 found the event page showing
 * `From AUD $18.00` and telling the buyer that the booking fee is not returned
 * without ever saying what the booking fee is. The ONLY place the fee appeared
 * was `/pricing`, an organiser-facing page.
 *
 * THE ARITHMETIC IS NOT HERE. Every function below composes `fee-math.ts`,
 * which is the single source of the per-order fee math and is already what the
 * server `PaymentCalculator` charges through. A second formula, however small
 * and however obviously correct, is a second formula: it can be right today and
 * wrong the day the flat fee stops being per-ticket, and nothing would notice
 * because both would still return a number. What this module owns is the
 * QUESTION, "what does one of these cost", asked in the one shape every display
 * surface needs.
 *
 * THE PER-TICKET SHAPE IS NOT OBVIOUS AND IS THE REASON FOR THE FILE. The fee
 * is a percentage of the subtotal PLUS a flat amount per ticket, so the all-in
 * price of one ticket is not the all-in price of two divided by two, and it is
 * not a fixed markup either: `Math.round` is applied once to the whole fee line,
 * so the single-ticket rounding is its own case. Writing that out at four call
 * sites is four chances to get it subtly wrong in a direction nobody can see.
 *
 * ABSORB IS NOT AN EXCEPTION THAT NEEDS HANDLING HERE, and that is deliberate:
 * `computeAllInTotalCents` already returns the subtotal unchanged when the
 * organiser absorbs the fee, so an absorb event's all-in price IS its face
 * value and every function below tells the truth about it without a branch.
 */
import {
  computeFeeLineCents,
  computeAllInTotalCents,
  type FeeRates,
  type FeePassType,
} from './fee-math'

/** What a buyer pays for exactly one ticket, and what it is made of. */
export interface AllInPrice {
  /** The organiser's own number, in cents. */
  faceCents: number
  /**
   * The EventLinqs fee on this one ticket, in cents. Zero when the organiser
   * absorbs it, because then the buyer is not paying it.
   */
  feeCents: number
  /** What the buyer pays. The prominent number on every surface. */
  totalCents: number
  /** True when the fee is added on top rather than absorbed into the face value. */
  feeIsAddedOnTop: boolean
}

/**
 * The all-in price of ONE ticket at this face value.
 *
 * A zero face value returns a zero total with a zero fee and is NOT a special
 * case handled here: `computeFeeLineCents` is simply never called for it,
 * because the platform's own rule is that a zero subtotal short-circuits before
 * any fee applies (docs/PRICING.md, "Free events are free"). Calling the fee
 * math on zero would return the flat per-ticket fee, which is the wrong answer
 * and the one a free event must never be shown.
 */
export function allInPriceForOneTicket(
  faceCents: number,
  rates: FeeRates,
  feePassType: FeePassType,
): AllInPrice {
  if (faceCents <= 0) {
    return { faceCents: 0, feeCents: 0, totalCents: 0, feeIsAddedOnTop: false }
  }
  const fees = computeFeeLineCents(faceCents, 1, rates)
  const totalCents = computeAllInTotalCents(faceCents, fees, feePassType)
  return {
    faceCents,
    feeCents: totalCents - faceCents,
    totalCents,
    feeIsAddedOnTop: totalCents > faceCents,
  }
}

/**
 * The lowest all-in total across an event's PAID tiers, or null when every tier
 * is free.
 *
 * IT IS THE LOWEST TOTAL, NOT THE TOTAL OF THE LOWEST FACE VALUE, and the two
 * can differ. They cannot differ under the fee shape in `pricing_rules` today,
 * because a percentage plus a per-ticket flat amount is monotonic in the face
 * value. They WOULD differ under a capped fee, a banded fee, or a per-tier
 * override, and every one of those is a change somebody could make in the admin
 * panel without touching this file. Taking the minimum of the computed totals
 * costs one pass over a handful of tiers and is correct under all of them;
 * assuming monotonicity saves nothing and is correct only by luck.
 *
 * Free tiers are excluded for the reason `price-label.ts` already records: an
 * event is free only when EVERY tier is free, and a $0 community pass sitting
 * beside paid tiers must not make the event advertise itself as free.
 */
export function lowestAllInCents(
  tiers: Array<{ price: number }>,
  rates: FeeRates,
  feePassType: FeePassType,
): number | null {
  const paid = (tiers ?? []).filter(t => t.price > 0)
  if (paid.length === 0) return null
  return paid.reduce((lowest, tier) => {
    const total = allInPriceForOneTicket(tier.price, rates, feePassType).totalCents
    return total < lowest ? total : lowest
  }, Number.POSITIVE_INFINITY)
}
