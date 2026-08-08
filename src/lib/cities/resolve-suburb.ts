import { getAllSuburbs, type CitySlug, type SuburbSlug } from './data'

/**
 * Resolve an event's location to a canonical suburb-district slug.
 *
 * WHY THIS IS NOT THE CITY FIX. `city_primary` is resolved from the locality
 * the organiser typed, because "Geelong" IS the city of Geelong. A suburb
 * cannot be derived that way and it must not be guessed from one: the entries
 * the platform ships are metropolitan DISTRICTS ("Inner West", "Eastern
 * Suburbs", "Inner Melbourne"), not literal suburb names, so no organiser ever
 * types one and no text field contains one. Deriving a suburb from a city name
 * would file events into a district nobody chose, which is worse than leaving
 * it null.
 *
 * WHAT IS HONEST. Every district in the `suburbs` table carries a real
 * centroid, and the organiser wizard already captures venue coordinates (346 of
 * the 362 published events on TEST have them, 95.6 percent). Assigning an event
 * to the nearest district centroid within a bounded radius, inside its own
 * city, is a deterministic reading of a real coordinate. It invents nothing: it
 * is the same class of operation as cropping an image to a published size, not
 * the class of making something up.
 *
 * THE BOUND MATTERS. Without a radius, nearest-centroid assigns every event in
 * the country to some district, however far away. With one, an event outside
 * every listed district resolves to null, which is the honest state: the event
 * is still listed, still searchable and still on its city page, it simply is
 * not claimed by a district.
 *
 * ONE RULE, TWO CALLERS. The suburb FILTER (/events?suburb=) applies the same
 * radius around the same centroid, so an event written into a district and an
 * event found by browsing that district are decided by the same rule. When the
 * write and the read disagree, the suburb page and the browse view show
 * different answers for the same question and neither is wrong on its own.
 */

/** The district radius. Shared with the suburb filter (lib/events/url-filters.ts). */
export const SUBURB_MATCH_RADIUS_KM = 12

/** Great-circle distance in kilometres. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type SuburbResolutionInput = {
  citySlug: CitySlug | string | null | undefined
  latitude: number | null | undefined
  longitude: number | null | undefined
}

/**
 * The nearest district centroid to these coordinates, within
 * SUBURB_MATCH_RADIUS_KM, restricted to districts of the given city.
 *
 * Returns null when there are no coordinates, no resolved city, the city has no
 * districts (only tier-1 cities do), or nothing is close enough.
 */
export function resolveSuburbSlug(input: SuburbResolutionInput): SuburbSlug | null {
  const { citySlug, latitude, longitude } = input
  if (!citySlug) return null
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  // Restricting to the event's own city is what stops a venue near a city
  // boundary being filed under a district of the city next door.
  const candidates = getAllSuburbs().filter((s) => s.citySlug === citySlug)
  if (candidates.length === 0) return null

  let best: { slug: SuburbSlug; km: number } | null = null
  for (const suburb of candidates) {
    const km = distanceKm(latitude, longitude, suburb.latitude, suburb.longitude)
    if (km <= SUBURB_MATCH_RADIUS_KM && (best === null || km < best.km)) {
      best = { slug: suburb.slug, km }
    }
  }
  return best?.slug ?? null
}
