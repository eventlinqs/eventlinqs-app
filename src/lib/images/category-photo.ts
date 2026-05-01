import { unstable_cache } from 'next/cache'

/**
 * Category-aware photo pipeline backed by Pexels.
 *
 * If PEXELS_API_KEY is missing or the request fails, every caller
 * receives the EventLinqs-branded fallback SVG. No throws, no broken images.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

// Queries bias toward multicultural, diverse crowds to reflect the communities
// EventLinqs serves. Avoid single-demographic stock imagery.
const CATEGORY_QUERIES: Record<string, string> = {
  'afrobeats': 'multicultural music festival diverse crowd',
  'amapiano': 'african diaspora dance floor celebration',
  'gospel': 'community gospel worship together',
  'owambe': 'african wedding celebration diverse families',
  'caribbean': 'caribbean carnival diverse crowd dance',
  'heritage-and-independence': 'cultural festival diverse families parade',
  'networking': 'diverse business conference professionals event',
  'business-networking': 'diverse business conference networking handshake',
  'music': 'diverse audience live music celebration',
  'sports': 'diverse fans stadium cheering sports',
  'arts-culture': 'diverse art exhibition gallery culture',
  'food-drink': 'diverse friends food festival tasting',
  'comedy': 'diverse audience laughing comedy show',
  'family': 'multicultural family festival outdoor children',
  'fashion': 'diverse models fashion runway show',
  'film': 'diverse cinema premiere audience event',
  'health-wellness': 'diverse yoga wellness meditation outdoor',
  'religion': 'diverse congregation worship community',
  'community': 'multicultural community gathering friends families',
  'charity': 'diverse volunteers charity fundraiser helping',
  'education': 'diverse audience lecture seminar learning',
  'festival': 'diverse crowd music festival outdoor',
  'nightlife': 'friends nightclub celebration diverse',
  'technology': 'diverse tech conference startup speakers',
  'other': 'diverse friends community celebration together',
}

export interface PexelsPhoto {
  src: string
  thumb: string
  alt: string
  photographer: string
}

const FALLBACK: PexelsPhoto = {
  src: '/images/event-fallback-hero.svg',
  thumb: '/images/event-fallback-thumb.svg',
  alt: 'EventLinqs',
  photographer: 'EventLinqs',
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; landscape?: string }
  alt: string | null
  photographer: string
}

async function fetchPexelsRaw(query: string): Promise<PexelsPhoto> {
  if (!PEXELS_API_KEY) return FALLBACK

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return FALLBACK

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return FALLBACK

    const hash = simpleHash(query)
    const photo = data.photos[hash % data.photos.length]

    return {
      src: photo.src.landscape ?? photo.src.large,
      thumb: photo.src.medium,
      alt: photo.alt ?? query,
      photographer: photo.photographer,
    }
  } catch {
    return FALLBACK
  }
}

const fetchPexels = unstable_cache(
  fetchPexelsRaw,
  ['pexels-category-photo'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels'] }
)

export async function getCategoryPhoto(
  categorySlug: string | null | undefined,
): Promise<PexelsPhoto> {
  const slug = (categorySlug || 'other').toLowerCase()
  const query = CATEGORY_QUERIES[slug] ?? CATEGORY_QUERIES.other
  return await fetchPexels(query)
}
