// The ONE price-label rule for event cards, tiles, map pins, and heroes.
//
// An event is FREE only when EVERY tier is $0 (the fee-system definition).
// When a $0 tier (e.g. a free community pass) coexists with paid tiers, the
// event is a PAID event and must advertise its lowest PAID price. Deriving
// free-ness from min(price) mislabelled paid events as "Free" on the cards
// while the event hero said "From AUD $15" for the same event (2026-07-04
// staging verification). Every surface imports this helper; no local copies.

import { lowestAllInCents } from '@/lib/payments/all-in-price'
import type { FeeRates, FeePassType } from '@/lib/payments/fee-math'

export type PriceLabelTier = { price: number; currency?: string | null }

/**
 * THE ALL-IN OPTION (close-out SEO4 step 3).
 *
 * "Where an event has tiers, the from price is the lowest all in total, not the
 * lowest ticket price."
 *
 * It is OPTIONAL, and the option is not a loophole. A surface can only tell the
 * truth about the all-in price if it has resolved THIS EVENT'S fee scope through
 * `getPricingRule`, because a per-event or per-organiser override changes the
 * answer. A surface that has not resolved it must not guess with the region
 * default: that would produce a confident wrong number, which is worse than the
 * face value, because the face value is at least an honestly labelled floor.
 *
 * So: supply the rates and get the real price; omit them and get the face value.
 * Which surfaces are allowed to omit them is not left to judgement,
 * `scripts/guards/all-in-pricing.mjs` holds the list and every entry carries a
 * reason.
 */
export interface PriceLabelAllIn {
  rates: FeeRates
  feePassType: FeePassType
}

function formatDollars(cents: number, currency: string | null | undefined): string {
  const dollars = cents / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${currency ?? 'AUD'} ${formatted}`
}

/**
 * @param tiers      tier prices in CENTS (pass effective/dynamic prices where
 *                   a surface has them)
 * @param freeLabel  surface wording for the all-free case ("Free" on cards,
 *                   "Free entry" on the event hero)
 * @param allIn      this event's resolved fee rates and who carries them. With
 *                   them the label is the lowest ALL-IN total the buyer will
 *                   actually pay; without them it is the lowest face value.
 */
export function priceLabel(
  tiers: PriceLabelTier[],
  freeLabel = 'Free',
  allIn?: PriceLabelAllIn,
): string {
  if (!tiers || tiers.length === 0) return freeLabel
  const paid = tiers.filter((t) => t.price > 0)
  if (paid.length === 0) return freeLabel
  const min = paid.reduce((m, t) => (t.price < m.price ? t : m), paid[0])

  if (allIn) {
    // The lowest TOTAL, which is not necessarily the total of the lowest face
    // value. See lowestAllInCents for why that distinction is kept.
    const lowest = lowestAllInCents(paid, allIn.rates, allIn.feePassType)
    if (lowest !== null) return formatDollars(lowest, min.currency)
  }

  return formatDollars(min.price, min.currency)
}

/** Lowest PAID price in cents, or null when every tier is $0 (a free event). */
export function lowestPaidCents(tiers: PriceLabelTier[]): number | null {
  const paid = (tiers ?? []).filter((t) => t.price > 0)
  if (paid.length === 0) return null
  return paid.reduce((m, t) => Math.min(m, t.price), paid[0].price)
}
