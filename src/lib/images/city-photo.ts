import { unstable_cache } from 'next/cache'

/**
 * City-aware photo pipeline backed by Pexels.
 *
 * Mirrors category-photo.ts but returns a portrait-oriented URL string.
 * Falls back to null when PEXELS_API_KEY is missing or the request fails —
 * callers are expected to substitute their own placeholder (e.g. /cities/<slug>.svg).
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

const CITY_QUERIES: Record<string, string> = {
  melbourne: 'Melbourne Australia skyline night',
  sydney: 'Sydney Australia harbour bridge',
  brisbane: 'Brisbane skyline Australia',
  perth: 'Perth Australia skyline',
  adelaide: 'Adelaide Australia city',
  'gold-coast': 'Gold Coast Queensland beach skyline',
  geelong: 'Geelong Victoria waterfront',
  hobart: 'Hobart Tasmania harbour',
  canberra: 'Canberra Australia capital city',
  darwin: 'Darwin Northern Territory',
  newcastle: 'Newcastle NSW harbour',
  wollongong: 'Wollongong NSW coast',
  auckland: 'Auckland New Zealand skyline',
  london: 'London England skyline Big Ben',
  manchester: 'Manchester England city',
  birmingham: 'Birmingham England city skyline',
  dublin: 'Dublin Ireland city',
  toronto: 'Toronto Canada skyline CN Tower',
  montreal: 'Montreal Canada skyline night',
  'new-york': 'New York Manhattan skyline',
  'washington-dc': 'Washington DC capitol skyline',
  houston: 'Houston Texas skyline',
  atlanta: 'Atlanta Georgia skyline',
  miami: 'Miami Florida skyline beach',
  'los-angeles': 'Los Angeles California skyline',
  lagos: 'Lagos Nigeria Victoria Island',
  accra: 'Accra Ghana city',
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; portrait?: string }
  alt: string | null
  photographer: string
}

async function fetchCityPhotoRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null

    const hash = simpleHash(query)
    const photo = data.photos[hash % data.photos.length]

    return photo.src.portrait ?? photo.src.large
  } catch {
    return null
  }
}

const fetchCityPhoto = unstable_cache(
  fetchCityPhotoRaw,
  ['pexels-city-photo'],
  { revalidate: 60 * 60 * 24, tags: ['pexels', 'pexels-city'] }
)

export async function getCityPhoto(slug: string): Promise<string | null> {
  const key = slug.toLowerCase()
  const query = CITY_QUERIES[key]
  if (!query) return null
  return await fetchCityPhoto(query)
}
