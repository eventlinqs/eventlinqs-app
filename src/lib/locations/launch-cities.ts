/**
 * Curated AU-only launch list for the EventLinqs location picker and
 * /events/browse/{city-slug} path-based routing.
 *
 * Batch 11.0 Round 3 AU-first launch lock: international markets
 * (NZ, UK, Ireland, Canada, US, Nigeria, Ghana, Kenya, South Africa,
 * UAE) are deferred to a later regional expansion. Until then no
 * non-AU slug should be routable on the public surface. The previous
 * 32-city list leaked international slugs to Vercel runtime (`GET
 * 200 /events/browse/manchester`, `london`, `new-york`, `lagos`,
 * `dublin`, `accra` etc.) - those routes now return 404 because the
 * non-AU rows are removed from this list AND a `country = 'AU'`
 * check constraint hardens the `cities` table at the DB layer.
 *
 * These cities ALWAYS appear in the picker and sitemap regardless of
 * current event count, so they accumulate Google authority for when
 * events arrive. Cities with zero events remain clickable and land
 * on the empty-state page.
 *
 * To re-enable an international market, add the rows back here AND
 * relax the cities.country check constraint via a new migration.
 */

export type LaunchCity = {
  city: string
  slug: string
  country: string
  countryCode: string
  latitude: number
  longitude: number
  isAustralia: boolean
}

export const LAUNCH_TARGET_CITIES: readonly LaunchCity[] = [
  // Australia - 20 cities. MUST stay in sync with the public.cities
  // table in Supabase. picker-cities.ts ALSO queries the cities table
  // at runtime so any future DB addition auto-propagates without a
  // code change here; this hardcoded list is the fallback that runs
  // during CI / build when the DB query is unavailable. Batch 11.1
  // D1 root-cause expansion: previously this list had 13 cities, but
  // 7 cities in the cities table (albury, ballarat, bendigo,
  // launceston, sunshine-coast, toowoomba, townsville) were absent
  // from the picker. Founder reported Geelong missing as a symptom;
  // root cause was the entire DB-vs-code parity gap.
  { city: 'Melbourne',      slug: 'melbourne',      country: 'Australia', countryCode: 'AU', latitude: -37.8136, longitude: 144.9631, isAustralia: true },
  { city: 'Sydney',         slug: 'sydney',         country: 'Australia', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093, isAustralia: true },
  { city: 'Brisbane',       slug: 'brisbane',       country: 'Australia', countryCode: 'AU', latitude: -27.4698, longitude: 153.0251, isAustralia: true },
  { city: 'Perth',          slug: 'perth',          country: 'Australia', countryCode: 'AU', latitude: -31.9523, longitude: 115.8613, isAustralia: true },
  { city: 'Adelaide',       slug: 'adelaide',       country: 'Australia', countryCode: 'AU', latitude: -34.9285, longitude: 138.6007, isAustralia: true },
  { city: 'Gold Coast',     slug: 'gold-coast',     country: 'Australia', countryCode: 'AU', latitude: -28.0167, longitude: 153.4000, isAustralia: true },
  { city: 'Newcastle',      slug: 'newcastle',      country: 'Australia', countryCode: 'AU', latitude: -32.9283, longitude: 151.7817, isAustralia: true },
  { city: 'Wollongong',     slug: 'wollongong',     country: 'Australia', countryCode: 'AU', latitude: -34.4278, longitude: 150.8931, isAustralia: true },
  { city: 'Geelong',        slug: 'geelong',        country: 'Australia', countryCode: 'AU', latitude: -38.1499, longitude: 144.3617, isAustralia: true },
  { city: 'Hobart',         slug: 'hobart',         country: 'Australia', countryCode: 'AU', latitude: -42.8821, longitude: 147.3272, isAustralia: true },
  { city: 'Canberra',       slug: 'canberra',       country: 'Australia', countryCode: 'AU', latitude: -35.2809, longitude: 149.1300, isAustralia: true },
  { city: 'Darwin',         slug: 'darwin',         country: 'Australia', countryCode: 'AU', latitude: -12.4634, longitude: 130.8456, isAustralia: true },
  { city: 'Cairns',         slug: 'cairns',         country: 'Australia', countryCode: 'AU', latitude: -16.9186, longitude: 145.7781, isAustralia: true },
  { city: 'Sunshine Coast', slug: 'sunshine-coast', country: 'Australia', countryCode: 'AU', latitude: -26.6500, longitude: 153.0667, isAustralia: true },
  { city: 'Toowoomba',      slug: 'toowoomba',      country: 'Australia', countryCode: 'AU', latitude: -27.5598, longitude: 151.9507, isAustralia: true },
  { city: 'Townsville',     slug: 'townsville',     country: 'Australia', countryCode: 'AU', latitude: -19.2589, longitude: 146.8169, isAustralia: true },
  { city: 'Ballarat',       slug: 'ballarat',       country: 'Australia', countryCode: 'AU', latitude: -37.5622, longitude: 143.8503, isAustralia: true },
  { city: 'Bendigo',        slug: 'bendigo',        country: 'Australia', countryCode: 'AU', latitude: -36.7570, longitude: 144.2794, isAustralia: true },
  { city: 'Launceston',     slug: 'launceston',     country: 'Australia', countryCode: 'AU', latitude: -41.4332, longitude: 147.1441, isAustralia: true },
  { city: 'Albury',         slug: 'albury',         country: 'Australia', countryCode: 'AU', latitude: -36.0737, longitude: 146.9135, isAustralia: true },
]

export function toCitySlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
