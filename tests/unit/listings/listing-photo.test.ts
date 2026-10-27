import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLibraryPhoto, listingPhotoFor, LIBRARY_PHOTO_CREDIT } from '@/lib/listings/listing-photo'

/**
 * Lawal's ruling of 27 October 2026, 08:33: a listing night carries a real
 * photograph, EventLinqs' licensed library shot for its category until its
 * host's own shows, and says it is not the venue.
 */
describe("a listing night's photograph", () => {
  // The library lives in the project's own store, so its URL needs one configured.
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://vkapkibzokmfaxqogypq.supabase.co')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is a licensed library photograph for every category the import writes', () => {
    for (const slug of ['family', 'community', 'music', 'nightlife', 'comedy']) {
      const url = listingPhotoFor(slug)
      expect(url, slug).toMatch(/\/storage\/v1\/object\/public\/event-images\/stock\/categories\/.+\.avif$/)
      expect(isLibraryPhoto(url)).toBe(true)
    }
  })

  it('still has a photograph for a category with none of its own', () => {
    expect(listingPhotoFor('no-such-category')).toBe(listingPhotoFor('community'))
    expect(listingPhotoFor(null)).toBe(listingPhotoFor('community'))
  })

  it('tells a library photograph from a composed cover or an organiser upload', () => {
    expect(isLibraryPhoto('https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/e1.png')).toBe(false)
    expect(isLibraryPhoto('https://x.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif')).toBe(false)
    expect(isLibraryPhoto(null)).toBe(false)
  })

  it('says it is not the venue, in plain words', () => {
    expect(LIBRARY_PHOTO_CREDIT).toMatch(/not this venue/)
  })
})
