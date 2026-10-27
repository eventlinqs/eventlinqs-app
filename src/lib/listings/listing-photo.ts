import { getSpineCategoryHero, getSpineCategoryTile } from '@/lib/images/spine'

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

/** The listing categories the import writes, to the spine category that pictures each. */
const SPINE_FOR: Record<string, string> = {
  family: 'family',
  community: 'arts-community',
  music: 'music',
  nightlife: 'nightlife',
  comedy: 'arts-community',
  'food-drink': 'food-drink',
  festival: 'festival',
  sports: 'sports',
  'business-networking': 'business-networking',
}

/** Where a category has no picture of its own, the community shot stands in. */
const DEFAULT_SPINE = 'arts-community'

/** The licensed library photograph for a listing night's category, or null when no store URL is configured. */
export function listingPhotoFor(categorySlug: string | null | undefined): string | null {
  const key = SPINE_FOR[(categorySlug ?? '').toLowerCase()] ?? DEFAULT_SPINE
  return (getSpineCategoryHero(key) ?? getSpineCategoryTile(key))?.src ?? null
}

/** A cover from EventLinqs' licensed library (the spine's own folder), not the organiser's or the host's. */
export function isLibraryPhoto(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/event-images/stock/')
}

/** The line shown with a library photograph, so it is never read as the venue. */
export const LIBRARY_PHOTO_CREDIT = 'Photo from the EventLinqs library, to give a feel for the night. It is not this venue.'
