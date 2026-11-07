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

/**
 * A CITY GUIDE'S BANNER (Lawal, 3 November 2026, 01:44: 'You don't need my permission for city banner photos for Geelong
 * and Ballarat ... that should be done'; the CONTROLLER picked each from contact sheets, 02:20 and 02:53). A licensed
 * photograph of the city itself, from Wikimedia Commons, kept in public/images/library with its author, page and licence
 * in attribution.json. CC BY-SA 4.0 asks for the author, the licence and the source wherever the photograph is shown, so
 * the guide that draws a banner draws its credit beside it (city-guide-screen.tsx), and only the guide draws it. A public
 * domain photograph asks for no credit (`credit: null`); its source stays on record all the same.
 * `position` is the focal point the CONTROLLER ruled at 04:29: the cover band keeps each subject readable at every width.
 */
export interface CityBanner {
  src: string
  page: string
  licence: 'CC BY-SA 4.0' | 'CC0 1.0' | 'Public domain'
  /** What the page draws: the author and the licence's link, or null where the licence asks for no credit. */
  credit: { author: string; licenceUrl: string } | null
  position: string
}

const BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0/'
const CC0_1 = 'https://creativecommons.org/publicdomain/zero/1.0/'

const CITY_BANNERS: Record<string, CityBanner> = {
  // Eastern Beach from the hill: the palms, the bathing enclosure and the bay.
  geelong: {
    src: '/images/library/city-banner-geelong.jpg', page: 'https://commons.wikimedia.org/wiki/File:Eastern_Beach_Geelong.jpg',
    licence: 'CC BY-SA 4.0', credit: { author: 'Mattplaysthedrums', licenceUrl: BY_SA_4 }, position: '50% 32%',
  },
  // The Robert Clark Conservatory in the Botanical Gardens, the whole glasshouse in the band.
  ballarat: {
    src: '/images/library/city-banner-ballarat.jpg',
    page: 'https://commons.wikimedia.org/wiki/File:Robert_Clark_Conservatory,_Ballarat_Botanic_Gardens.jpg',
    licence: 'CC BY-SA 4.0', credit: { author: 'Peter Stokes', licenceUrl: BY_SA_4 }, position: '50% 44%',
  },
  // Central Bendigo from the Botanic Gardens (the CONTROLLER's 07:12: a wide view that survives the band at every width):
  // both clock towers, the town hall's and the post office's, whole in the 1440 band at 44%; the whole photo at 390.
  bendigo: {
    src: '/images/library/city-banner-bendigo.jpg', page: 'https://commons.wikimedia.org/wiki/File:Central_bendigo_from_botanic_gardens.jpg',
    licence: 'Public domain', credit: null, position: '50% 44%',
  },
  // Canberra from the Mount Ainslie lookout (Lawal's ruling of 8 November 2026, 07:05 (1)): Anzac Parade from the
  // Australian War Memorial's dome to Lake Burley Griffin, both Parliament Houses on the axis and the Brindabellas
  // behind. CC0 asks for no credit; the ruling asks for one, so the author and the dedication are drawn all the same.
  canberra: {
    src: '/images/library/city-banner-canberra.jpg', page: 'https://commons.wikimedia.org/wiki/File:Canberra_from_Mount_Ainslie_Lookout.jpg',
    licence: 'CC0 1.0', credit: { author: 'Orion Kahza', licenceUrl: CC0_1 }, position: '50% 50%',
  },
}

export function getCityBanner(slug: string): CityBanner | null {
  return CITY_BANNERS[slug.toLowerCase()] ?? null
}

/** The landscape band for a city's hero (the /events/browse/<city> band and the community city pages). */
export async function getCityHeroPhoto(slug: string): Promise<string | null> {
  const spine = getSpineCity(slug)
  if (spine) return spine.src
  const key = slug.toLowerCase()
  return KEPT_CITIES.has(key) ? `/images/library/city-hero-${key}.jpg` : null
}
