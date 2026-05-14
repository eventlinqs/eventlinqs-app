import { unstable_cache } from 'next/cache'

/**
 * City-aware photo pipeline backed by Pexels.
 *
 * Mirrors category-photo.ts but returns a portrait-oriented URL string.
 * Falls back to null when PEXELS_API_KEY is missing or the request fails -
 * callers are expected to substitute their own placeholder (e.g. /cities/<slug>.svg).
 *
 * Query strategy (rebuilt batch 3 - landmark relevance):
 *   - Each city query includes the city name PLUS local landmarks so
 *     Pexels returns the visually-recognisable shot (Sydney harbour
 *     bridge, Melbourne laneway, Geelong waterfront pier).
 *   - Sample from the TOP 5 results to avoid stale repetition.
 *   - orientation=portrait + size=large for tile aspect ratios.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

// 20 launch AU cities + selected international markets.
const CITY_QUERIES: Record<string, string> = {
  // ---- 20 AU cities -------------------------------------------------
  sydney:           'sydney harbour bridge opera house skyline',
  melbourne:        'melbourne city laneway tram skyline',
  brisbane:         'brisbane river skyline story bridge',
  perth:            'perth swan river skyline sunset',
  adelaide:         'adelaide city park architecture',
  'gold-coast':     'gold coast beach surfers paradise skyline',
  newcastle:        'newcastle beach harbour city',
  canberra:         'canberra parliament lake architecture',
  wollongong:       'wollongong beach lighthouse coastline',
  hobart:           'hobart harbour mount wellington',
  geelong:          'geelong waterfront cunningham pier',
  townsville:       'townsville magnetic island tropical',
  cairns:           'cairns tropical beach palm trees',
  darwin:           'darwin tropical waterfront sunset',
  'sunshine-coast': 'sunshine coast beach hinterland',
  bendigo:          'bendigo heritage architecture city',
  ballarat:         'ballarat heritage gold rush architecture',
  albury:           'albury murray river city',
  launceston:       'launceston tasmania heritage city',
  toowoomba:        'toowoomba garden city heritage',

  // ---- international launch markets --------------------------------
  auckland:         'auckland new zealand harbour skyline',
  london:           'london england skyline big ben',
  manchester:       'manchester england city skyline',
  birmingham:       'birmingham england city skyline',
  dublin:           'dublin ireland city',
  toronto:          'toronto canada skyline cn tower',
  montreal:         'montreal canada skyline night',
  'new-york':       'new york manhattan skyline',
  'washington-dc':  'washington dc capitol skyline',
  houston:          'houston texas skyline',
  atlanta:          'atlanta georgia skyline',
  miami:            'miami florida skyline beach',
  'los-angeles':    'los angeles california skyline',
  lagos:            'lagos nigeria victoria island skyline',
  accra:            'accra ghana city',
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; portrait?: string }
  width?: number
  height?: number
  alt: string | null
  photographer: string
}

const TOP_N = 5

async function fetchCityPhotoRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null

    // Filter to min 800x1200 portrait + sample from top 5.
    const usable = data.photos.filter(p => (p.width ?? 0) >= 800 && (p.height ?? 0) >= 1200)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    const photo = pool[simpleHash(query) % pool.length]

    return photo.src.portrait ?? photo.src.large
  } catch {
    return null
  }
}

const fetchCityPhoto = unstable_cache(
  fetchCityPhotoRaw,
  ['pexels-city-photo-v2'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels', 'pexels-city'] }
)

export async function getCityPhoto(slug: string): Promise<string | null> {
  const key = slug.toLowerCase()
  const query = CITY_QUERIES[key]
  if (!query) return null
  return await fetchCityPhoto(query)
}

/**
 * Landscape city hero - Batch 4 /events/browse/[city] photographic hero band.
 *
 * Returns a horizontally-oriented Pexels photo so the hero crop reads
 * as a wide cinematic band, not a vertical portrait re-flowed against
 * a landscape container. The portrait helper above stays in place for
 * the city tile rail (CityTileImage) which is genuinely portrait.
 */
async function fetchCityHeroPhotoRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null

    const usable = data.photos.filter(p => (p.width ?? 0) >= 1600 && (p.height ?? 0) >= 900)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    const photo = pool[simpleHash(query + ':landscape') % pool.length]

    return photo.src.large
  } catch {
    return null
  }
}

const fetchCityHeroPhoto = unstable_cache(
  fetchCityHeroPhotoRaw,
  ['pexels-city-hero-photo-v1'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels', 'pexels-city'] }
)

export async function getCityHeroPhoto(slug: string): Promise<string | null> {
  const key = slug.toLowerCase()
  const query = CITY_QUERIES[key]
  if (!query) return null
  return await fetchCityHeroPhoto(query)
}
