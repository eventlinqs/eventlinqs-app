import { getSpineCity } from './spine'

/**
 * A city's photograph: its tile (portrait) and its hero band (landscape).
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:23 on 29 October 2026; the project manager's 22:24:
 * every slot tile on a stored image). Lawal's own licensed photograph answers first for the thirteen cities his spine
 * holds (src/lib/images/spine.ts). Every other city a page names is kept once in public/images/library:
 * city-<slug>.jpg for the tile and city-hero-<slug>.jpg for the band. Each is the photograph the live tile showed
 * before, fetched by scripts/ops/download-library-photos.mjs with its photographer, page and licence in
 * attribution.json. Three heroes were replaced by fitting ones after a look by eye on 30 October: Sunshine Coast,
 * Launceston and Accra showed another place or a poor face for the city.
 *
 * This used to ask Pexels on every render and cache the answer for a week, a refusal included, which is how
 * production's tiles went blank on 29 October. A city no table names answers null, and the caller draws its own
 * placeholder.
 */

/** The cities kept in public/images/library, as city-<slug>.jpg and city-hero-<slug>.jpg. */
const KEPT_CITIES = new Set([
  'townsville', 'sunshine-coast', 'bendigo', 'ballarat', 'albury', 'launceston', 'toowoomba',
  'auckland', 'london', 'manchester', 'birmingham', 'dublin', 'toronto', 'montreal',
  'new-york', 'washington-dc', 'houston', 'atlanta', 'miami', 'los-angeles', 'lagos', 'accra',
])

export async function getCityPhoto(slug: string): Promise<string | null> {
  const spine = getSpineCity(slug)
  if (spine) return spine.src
  const key = slug.toLowerCase()
  return KEPT_CITIES.has(key) ? `/images/library/city-${key}.jpg` : null
}

/** The landscape band for a city's hero (the /events/browse/<city> band and the community city pages). */
export async function getCityHeroPhoto(slug: string): Promise<string | null> {
  const spine = getSpineCity(slug)
  if (spine) return spine.src
  const key = slug.toLowerCase()
  return KEPT_CITIES.has(key) ? `/images/library/city-hero-${key}.jpg` : null
}
