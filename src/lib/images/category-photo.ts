import { unstable_cache } from 'next/cache'

/**
 * Category-aware photo pipeline backed by Pexels.
 *
 * If PEXELS_API_KEY is missing or the request fails, every caller
 * receives the EventLinqs-branded fallback SVG. No throws, no broken images.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

const CATEGORY_QUERIES: Record<string, string> = {
  'afrobeats': 'afrobeats concert party crowd lights',
  'amapiano': 'south africa club dance party night',
  'gospel': 'gospel choir worship singing',
  'owambe': 'nigerian wedding celebration colourful party',
  'caribbean': 'caribbean carnival dance party tropical',
  'heritage-and-independence': 'african culture festival flag celebration',
  'networking': 'business conference networking professional event',
  'business-networking': 'business conference networking suits handshake',
  'music': 'concert crowd stage lights performance',
  'sports': 'stadium crowd sports event excited fans',
  'arts-culture': 'art exhibition gallery culture event',
  'food-drink': 'food festival outdoor restaurant tasting',
  'comedy': 'stand up comedy stage spotlight microphone',
  'family': 'family festival outdoor children fun',
  'fashion': 'fashion runway show models stylish',
  'film': 'cinema movie premiere red carpet',
  'health-wellness': 'yoga wellness meditation outdoor calm',
  'religion': 'church congregation worship community',
  'community': 'community gathering people diverse celebration',
  'charity': 'charity fundraiser people helping volunteers',
  'education': 'lecture seminar audience learning',
  'festival': 'music festival outdoor crowd lights stage',
  'nightlife': 'nightclub party dj dance lights',
  'technology': 'tech conference startup speakers innovation',
  'other': 'event celebration crowd people gathering',
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

export function getCityPhotoQuery(city: string): string {
  return `${city} skyline city night lights`
}

export async function getCityPhoto(city: string): Promise<PexelsPhoto> {
  return await fetchPexels(getCityPhotoQuery(city))
}
