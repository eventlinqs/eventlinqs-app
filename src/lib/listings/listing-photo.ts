import { getSpineCategoryHero, getSpineCategoryTile, getSpineCity } from '@/lib/images/spine'

/**
 * A LISTING NIGHT'S PHOTOGRAPH UNTIL ITS HOST'S OWN SHOWS (Lawal's ruling of
 * 27 October 2026, 08:33: "every event on EventLinqs and every Instagram card
 * carries a real photograph, never text where a picture should be"; it replaces
 * ruling B's typographic cover for walk-in listings). The photograph is
 * EventLinqs' LICENSED library shot for the night's category (the spine,
 * src/lib/images/spine.ts), never a host's photo taken without permission and
 * never presented as the venue itself: every page that shows one says so
 * (LIBRARY_PHOTO_CREDIT).
 */

/**
 * The listing categories the import writes, to the spine shot that pictures
 * each: the category's landing HERO, or its TILE where that shot fits the
 * night better (a stage and seats for comedy, not the arts hero's gallery).
 */
const SPINE_FOR: Record<string, { key: string; shot: 'hero' | 'tile' }> = {
  family: { key: 'family', shot: 'hero' },
  community: { key: 'arts-community', shot: 'tile' },
  music: { key: 'music', shot: 'hero' },
  nightlife: { key: 'nightlife', shot: 'hero' },
  comedy: { key: 'arts-community', shot: 'tile' },
  'health-wellness': { key: 'family', shot: 'hero' },
  education: { key: 'arts-community', shot: 'hero' },
  'food-drink': { key: 'food-drink', shot: 'hero' },
  festival: { key: 'festival', shot: 'hero' },
  sports: { key: 'sports', shot: 'hero' },
  'business-networking': { key: 'business-networking', shot: 'hero' },
}

/** Where a category has no picture of its own, the community shot stands in. */
const DEFAULT_SPINE = { key: 'arts-community', shot: 'tile' } as const

/** The licensed library photograph for a listing night's category, or null when no store URL is configured. */
export function listingPhotoFor(categorySlug: string | null | undefined): string | null {
  const { key, shot } = SPINE_FOR[(categorySlug ?? '').toLowerCase()] ?? DEFAULT_SPINE
  const first = shot === 'tile' ? getSpineCategoryTile(key) : getSpineCategoryHero(key)
  return (first ?? getSpineCategoryHero(key) ?? getSpineCategoryTile(key))?.src ?? null
}

/**
 * The photograph behind a city's week card: the city's own licensed shot where
 * the library has one, else the library shot for the week's most common
 * category, so a card never goes out as text alone.
 */
export function cityWeekPhotoFor(citySlug: string, categorySlugs: Array<string | null | undefined>): string | null {
  const city = getSpineCity(citySlug)
  if (city) return city.src
  const counts = new Map<string, number>()
  for (const c of categorySlugs) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
  return listingPhotoFor(top)
}

/** A cover from EventLinqs' licensed library (the spine's own folder), not the organiser's or the host's. */
export function isLibraryPhoto(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/event-images/stock/')
}

/** The line shown with a library photograph, so it is never read as the venue. */
export const LIBRARY_PHOTO_CREDIT = 'Photo from the EventLinqs library, to give a feel for the night. It is not this venue.'
