import { unstable_cache } from 'next/cache'

/**
 * Suburb-aware Pexels helper for /city/[slug]/[suburb] hero banners.
 * Mirrors the city-photo pipeline: landscape orientation, top-5 sample,
 * 7-day cache, brand-fallback (returns null) when PEXELS_API_KEY is
 * missing or the request fails. Each query is intentionally lifestyle-
 * led ("people, scene") rather than streetscape so the resulting hero
 * matches Airbnb's destination-banner aesthetic, not Google Street View.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

const SUBURB_QUERIES: Record<string, string> = {
  'sydney-inner-west':         'newtown sydney street art cafe culture people',
  'sydney-north-shore':        'north sydney harbour bridge skyline elegant',
  'sydney-eastern-suburbs':    'bondi beach sydney sunset surfers',
  'sydney-western-sydney':     'parramatta sydney diverse multicultural community',
  'sydney-northern-beaches':   'manly beach sydney boardwalk lifestyle',
  'sydney-sutherland-shire':   'cronulla beach sydney wave surfers',
  'melbourne-inner-melbourne': 'melbourne laneway street art cafe culture',
  'melbourne-eastern-suburbs': 'melbourne suburbs leafy residential lifestyle',
  'melbourne-western-suburbs': 'footscray melbourne diverse multicultural',
  'melbourne-northern-suburbs':'brunswick melbourne street culture creative',
  'melbourne-southern-suburbs':'south yarra melbourne cafe lifestyle',
  'melbourne-bayside':         'st kilda melbourne beach palm trees lifestyle',
  'brisbane-inner-city':       'south bank brisbane river lifestyle people',
  'brisbane-north-side':       'brisbane suburbs queensland sunny residential',
  'brisbane-south-side':       'brisbane south side queensland lifestyle',
  'brisbane-west-end':         'fortitude valley brisbane street culture nightlife',
  'perth-inner-perth':         'perth city kings park people lifestyle',
  'perth-northern-suburbs':    'perth coastal beach scarborough sunset',
  'perth-southern-suburbs':    'fremantle perth markets street culture people',
  'perth-coastal':             'perth scarborough beach sunset surfers',
  'gold-coast-surfers-paradise':'surfers paradise beach gold coast people lifestyle',
  'gold-coast-broadbeach':     'broadbeach gold coast beach lifestyle people',
  'canberra-civic':            'canberra civic centre people lifestyle',
  'hobart-inner-city':         'hobart salamanca markets people lifestyle',
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; portrait?: string }
  width?: number
  height?: number
  alt: string | null
  photographer: string
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const TOP_N = 5

async function fetchSuburbHeroRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null
  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null
    const usable = data.photos.filter(p => (p.width ?? 0) >= 1600 && (p.height ?? 0) >= 900)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    const photo = pool[simpleHash(query + ':suburb-hero') % pool.length]
    return photo.src.large
  } catch {
    return null
  }
}

const fetchSuburbHero = unstable_cache(
  fetchSuburbHeroRaw,
  ['pexels-suburb-hero-v1'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels', 'pexels-suburb'] },
)

export async function getSuburbHeroPhoto(slug: string): Promise<string | null> {
  const query = SUBURB_QUERIES[slug]
  if (!query) return null
  return await fetchSuburbHero(query)
}
