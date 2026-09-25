/**
 * THE SEGMENTATION AXES OF THE AUDIENCE ASSET. Pure, client-safe, no database.
 *
 * GA1. The asset that makes the revenue channel defensible is an opted-in
 * audience of PROVEN BUYERS segmented by city, community, category, price band
 * and recency. Three of those five are values the database already holds. The
 * other two, the price band and the recency band, are DERIVED, and this module
 * is the one place either is derived.
 *
 * WHY THE PRICE BAND IS STORED AND THE RECENCY BAND IS NOT. A price band is a
 * fact about a purchase and it never changes. A recency band is a fact about
 * TODAY, and a stored one is wrong the morning after it is written. So the
 * price band is computed once by `public.audience_price_band` and written onto
 * the row, and the recency band is computed here, at read time, from the stored
 * `last_order_at`.
 *
 * THE BOUNDARIES ARE MEASURED, NOT CHOSEN. On TEST vkapkibzokmfaxqogypq on
 * 13 September 2026, across the ticket tiers of every published event: 177 free
 * tiers, 115 paid, the median paid tier 49.00 and the dearest 349.00. Every band
 * below is reachable by a ticket this platform actually lists, and none is empty
 * by construction.
 *
 * THIS FILE AND THE SQL ARE ONE DECISION IN TWO LANGUAGES. A trigger cannot call
 * TypeScript, so `public.audience_price_band` carries the same boundaries, and
 * `scripts/guards/audience-consent-is-the-title-deed.mjs` fails the build if the
 * two ever disagree by a single cent.
 */

/** The price bands, cheapest first, with the lower bound of each in cents. */
export const AUDIENCE_PRICE_BANDS = [
  { band: 'free', fromCents: 0, label: 'Free' },
  { band: 'under-30', fromCents: 1, label: 'Under 30' },
  { band: '30-to-59', fromCents: 3000, label: '30 to 59' },
  { band: '60-to-99', fromCents: 6000, label: '60 to 99' },
  { band: '100-to-199', fromCents: 10000, label: '100 to 199' },
  { band: '200-plus', fromCents: 20000, label: '200 and over' },
] as const

export type AudiencePriceBand = (typeof AUDIENCE_PRICE_BANDS)[number]['band'] | 'unknown'

/**
 * The band a per-ticket amount falls in. Mirrors `public.audience_price_band`
 * exactly, including the answer for an amount nobody could work out.
 */
export function priceBandOf(unitCents: number | null | undefined): AudiencePriceBand {
  if (unitCents === null || unitCents === undefined || Number.isNaN(unitCents)) return 'unknown'
  if (unitCents <= 0) return 'free'
  if (unitCents < 3000) return 'under-30'
  if (unitCents < 6000) return '30-to-59'
  if (unitCents < 10000) return '60-to-99'
  if (unitCents < 20000) return '100-to-199'
  return '200-plus'
}

/** Human label for a band, for the admin surface. Never invents a band. */
export function priceBandLabel(band: string): string {
  return AUDIENCE_PRICE_BANDS.find(b => b.band === band)?.label ?? 'Not recorded'
}

/**
 * The recency bands, in days since the last confirmed order.
 *
 * Ninety days is the boundary that matters, because it is roughly the interval
 * over which somebody who bought once is still recognisably in market for the
 * same kind of night. The rest divide that window and the tail.
 */
export const AUDIENCE_RECENCY_BANDS = [
  { band: 'last-30-days', maxDays: 30, label: 'Last 30 days' },
  { band: 'last-90-days', maxDays: 90, label: '31 to 90 days' },
  { band: 'last-year', maxDays: 365, label: '91 days to a year' },
  { band: 'over-a-year', maxDays: Number.POSITIVE_INFINITY, label: 'Over a year' },
] as const

export type AudienceRecencyBand = (typeof AUDIENCE_RECENCY_BANDS)[number]['band']

/**
 * The recency band of a last-order timestamp, as at `now`.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the behaviour is
 * testable at a boundary rather than only observable on the day it matters.
 * A future timestamp reads as the most recent band, which is the only honest
 * answer: a clock skew is not a reason to call a buyer stale.
 */
export function recencyBandOf(lastOrderAt: string | Date, now: Date = new Date()): AudienceRecencyBand {
  const at = lastOrderAt instanceof Date ? lastOrderAt : new Date(lastOrderAt)
  const days = (now.getTime() - at.getTime()) / 86_400_000
  if (days <= 30) return 'last-30-days'
  if (days <= 90) return 'last-90-days'
  if (days <= 365) return 'last-year'
  return 'over-a-year'
}

/** Human label for a recency band. */
export function recencyBandLabel(band: string): string {
  return AUDIENCE_RECENCY_BANDS.find(b => b.band === band)?.label ?? 'Not recorded'
}
