/**
 * THE REFERRAL COEFFICIENT, AND WHAT IT IS WORTH. THE ARITHMETIC.
 *
 * Close-out AQ2: "If each buyer brings 0.3 new buyers, two hundred seats
 * becomes two hundred and eighty six over the cascade." That sentence is the
 * specification, and it is a geometric series:
 *
 *     a buyer brings k buyers, each of whom brings k, and so on
 *     total = seeds * (1 + k + k^2 + ...) = seeds / (1 - k)   for k < 1
 *     200 / (1 - 0.3) = 285.7, which is the 286 in the item
 *
 * So the coefficient is NEW BUYERS PER BUYER, not a percentage of anything, and
 * the multiplier that matters is 1/(1-k). Pure, because the number decides
 * whether referral is worth building on and a number that cannot be tested at
 * its boundaries is an opinion.
 *
 * WHY k >= 1 RETURNS NULL RATHER THAN A HUGE NUMBER. At k = 1 the series does
 * not converge: every buyer replaces themselves for ever. A platform reporting
 * "infinite" has stopped measuring and started predicting, and in practice a k
 * at or above 1 on real data means the attribution is double counting rather
 * than that the event has gone viral. Null forces the caller to say so.
 */

/** New buyers per buyer. Null when there were no buyers to divide by. */
export function referralCoefficient(referredOrders: number, soldOrders: number): number | null {
  const referred = Math.max(0, Math.trunc(referredOrders))
  const sold = Math.max(0, Math.trunc(soldOrders))
  if (sold === 0) return null
  return referred / sold
}

/**
 * What a given number of seeds becomes over the whole cascade, at this
 * coefficient. Null when the coefficient is unknown or does not converge.
 */
export function cascadeTotal(seeds: number, coefficient: number | null): number | null {
  if (coefficient === null || coefficient < 0 || coefficient >= 1) return null
  return seeds / (1 - coefficient)
}

/** The multiplier alone: 1/(1-k). Null on the same conditions. */
export function cascadeMultiplier(coefficient: number | null): number | null {
  return cascadeTotal(1, coefficient)
}

export interface ReferralCounts {
  /** Sold orders for this event, straight from the order ledger. */
  soldOrders: number
  /** Of those, the ones that arrived through a tracked share link. */
  attributedToAShareLink: number
  /**
   * Of THOSE, the ones whose link was made by somebody who holds a ticket to
   * this event. This is the only number that provably means "a buyer brought
   * them", and it is the one the coefficient is computed from.
   */
  fromAKnownBuyer: number
}

export interface ReferralCoefficientReport extends ReferralCounts {
  /** Attributed, but the sharer cannot be shown to be a buyer. */
  fromAnUnknownSharer: number
  /** AQ2's coefficient, from what can be proved. */
  coefficient: number | null
  /**
   * The same with every unknown sharer counted as a buyer. It is an UPPER
   * BOUND, not a better estimate: a guest buyer's share link carries no user
   * id, and neither does the organiser's own, so the truth is somewhere
   * between the two and the platform does not pretend to know where.
   */
  coefficientUpperBound: number | null
  /** 1/(1-k) on the provable coefficient. */
  multiplier: number | null
  sentence: string
}

export function buildReferralCoefficient(counts: ReferralCounts): ReferralCoefficientReport {
  const soldOrders = Math.max(0, Math.trunc(counts.soldOrders))
  const attributed = Math.min(Math.max(0, Math.trunc(counts.attributedToAShareLink)), soldOrders)
  const fromAKnownBuyer = Math.min(Math.max(0, Math.trunc(counts.fromAKnownBuyer)), attributed)
  const fromAnUnknownSharer = attributed - fromAKnownBuyer

  const coefficient = referralCoefficient(fromAKnownBuyer, soldOrders)
  const coefficientUpperBound = referralCoefficient(attributed, soldOrders)
  const multiplier = cascadeMultiplier(coefficient)

  return {
    soldOrders,
    attributedToAShareLink: attributed,
    fromAKnownBuyer,
    fromAnUnknownSharer,
    coefficient,
    coefficientUpperBound,
    multiplier,
    sentence: referralSentence({
      soldOrders,
      attributed,
      fromAKnownBuyer,
      fromAnUnknownSharer,
      coefficient,
      multiplier,
    }),
  }
}

function referralSentence(r: {
  soldOrders: number
  attributed: number
  fromAKnownBuyer: number
  fromAnUnknownSharer: number
  coefficient: number | null
  multiplier: number | null
}): string {
  if (r.soldOrders === 0) return 'No tickets sold yet, so there is nothing to divide by.'
  if (r.fromAKnownBuyer === 0) {
    const tail =
      r.fromAnUnknownSharer > 0
        ? ` ${r.fromAnUnknownSharer} order${r.fromAnUnknownSharer === 1 ? '' : 's'} did arrive through a share link, but the sharer cannot be shown to hold a ticket, so none of it counts here.`
        : ''
    return `No buyer of this event has yet brought another one through their own link.${tail}`
  }
  const k = r.coefficient as number
  const per = k.toFixed(2)
  const multiplierText =
    r.multiplier === null
      ? ' At that rate the cascade does not converge, which on real data means the attribution is counting something twice.'
      : ` At that rate ${r.soldOrders} buyers become ${Math.round(r.soldOrders * r.multiplier)} over the whole cascade.`
  return (
    `${r.fromAKnownBuyer} of ${r.soldOrders} sales came through a link made by somebody holding a ticket: ` +
    `${per} new buyers per buyer.${multiplierText}`
  )
}
