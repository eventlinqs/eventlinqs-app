import type { PhotoRef } from './google-places'

/**
 * WHICH OF A VENUE's GOOGLE PHOTOS LEADS ITS EVENT PAGE. Google lists a place's photos in its own order and the list
 * changes (photo names expire), so the choice is made afresh each time from the list Google gives now: the first
 * landscape photo at least MIN_WIDTH_PX wide that names an author to credit (Google, place-photos and policies, read
 * 31 October 2026: 'You must always credit the author when displaying photos') and that Google links to on Google Maps
 * (the same page: end users 'must always have access to view the individual source photo'). None fits, none is shown: the page
 * keeps its honest fallback rather than stretching a small or portrait photo.
 *
 * Pure: src/lib/places/venue-google-photo.ts reads the list.
 */
export const MIN_WIDTH_PX = 1000

export function pickPhoto(photos: readonly PhotoRef[]): PhotoRef | null {
  return photos.find((p) => p.widthPx >= MIN_WIDTH_PX && p.widthPx > p.heightPx && p.authors.length > 0 && !!p.mapsUri) ?? null
}
