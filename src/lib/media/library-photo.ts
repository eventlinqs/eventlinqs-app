/**
 * EventLinqs' licensed library photographs live under one path in the event-images store. A library photograph is
 * never a night's own cover (the project manager's 18:38 of 29 October 2026, under Lawal's 19:52 directive of
 * 28 October: authorised photographs, else premium typography); this one test says which images are library ones.
 * No imports, so the cover rules (fetchers, publish-gate, event-media) can ask it without carrying the photo spine.
 */
export const LIBRARY_PHOTO_PATH = '/storage/v1/object/public/event-images/stock/'

export function isLibraryPhoto(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes(LIBRARY_PHOTO_PATH)
}
