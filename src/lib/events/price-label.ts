// The ONE price-label rule for event cards, tiles, map pins, and heroes.
//
// An event is FREE only when EVERY tier is $0 (the fee-system definition).
// When a $0 tier (e.g. a free community pass) coexists with paid tiers, the
// event is a PAID event and must advertise its lowest PAID price. Deriving
// free-ness from min(price) mislabelled paid events as "Free" on the cards
// while the event hero said "From AUD $15" for the same event (2026-07-04
// staging verification). Every surface imports this helper; no local copies.

export type PriceLabelTier = { price: number; currency?: string | null }

/**
 * @param tiers      tier prices in CENTS (pass effective/dynamic prices where
 *                   a surface has them)
 * @param freeLabel  surface wording for the all-free case ("Free" on cards,
 *                   "Free entry" on the event hero)
 */
export function priceLabel(
  tiers: PriceLabelTier[],
  freeLabel = 'Free',
): string {
  if (!tiers || tiers.length === 0) return freeLabel
  const paid = tiers.filter((t) => t.price > 0)
  if (paid.length === 0) return freeLabel
  const min = paid.reduce((m, t) => (t.price < m.price ? t : m), paid[0])
  const dollars = min.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${min.currency ?? 'AUD'} ${formatted}`
}

/** Lowest PAID price in cents, or null when every tier is $0 (a free event). */
export function lowestPaidCents(tiers: PriceLabelTier[]): number | null {
  const paid = (tiers ?? []).filter((t) => t.price > 0)
  if (paid.length === 0) return null
  return paid.reduce((m, t) => Math.min(m, t.price), paid[0].price)
}
