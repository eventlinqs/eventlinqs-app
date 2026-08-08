/**
 * Resolve a free-text locality (the organiser's typed venue city) to a
 * canonical city slug.
 *
 * Why this exists: `events.city_primary` is the ONE column every city-scoped
 * surface reads, including the weekly local digest, which filters
 * `city_primary = <slug>`. The organiser wizard only ever captured
 * `venue_city` as free text, so `city_primary` stayed null on every organiser
 * created event and those events could never reach a city audience. This is
 * the single source that fills it, at write time, from the canonical city
 * registry (`src/lib/cities/data.ts`), which is the same twenty slugs the
 * `public.cities` table holds, so the value can never violate the foreign key
 * and can never drift from the platform's city taxonomy.
 *
 * Matching is deliberately EXACT after normalisation. "North Melbourne" is a
 * suburb, not the city of Melbourne, and a fuzzy match would file events under
 * a locality the organiser never chose. An unresolved locality returns null,
 * which is the honest state: the event is still listed and still searchable,
 * it simply is not claimed by a city until the locality matches one.
 */
import { getAllCities, type CitySlug } from './data'

/**
 * Normalise a locality for comparison: strip diacritics and punctuation, fold
 * case, collapse whitespace. "Gold Coast" and "gold-coast" both become
 * "gold coast".
 */
export function normaliseLocality(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** slug and name, both normalised, mapped to the canonical slug. */
function buildIndex(): Map<string, CitySlug> {
  const index = new Map<string, CitySlug>()
  for (const city of getAllCities()) {
    index.set(normaliseLocality(city.slug), city.slug)
    index.set(normaliseLocality(city.name), city.slug)
  }
  return index
}

let cachedIndex: Map<string, CitySlug> | null = null

/**
 * Resolve free text to a canonical city slug, or null when it matches none.
 *
 * Accepts the shapes an organiser actually types: "Geelong", "geelong",
 * "GOLD COAST", "Gold-Coast", and a locality carrying its state
 * ("Melbourne, VIC"), where only the part before the first comma is the
 * locality. Anything else returns null rather than guessing.
 */
export function resolveCitySlug(value: string | null | undefined): CitySlug | null {
  if (!value) return null
  cachedIndex ??= buildIndex()

  const locality = normaliseLocality(value.split(',')[0] ?? '')
  if (!locality) return null
  return cachedIndex.get(locality) ?? null
}
