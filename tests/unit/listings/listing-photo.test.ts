import { describe, expect, it } from 'vitest'
import * as listingPhoto from '@/lib/listings/listing-photo'
import { isLibraryPhoto, LIBRARY_PHOTO_CREDIT } from '@/lib/listings/listing-photo'

/**
 * The 27 October 2026 08:33 library shot for every listing night is retired (the project manager's 18:38 of
 * 29 October, under Lawal's 19:52 directive: authorised photographs, else premium typography). What stays is the test
 * for a library photograph and the line beside one; nothing here can pick one for a night any more.
 */
describe("a listing night's photograph", () => {
  it('can no longer be picked from the library: the helpers that chose a category or city shot are gone', () => {
    expect(Object.keys(listingPhoto).sort()).toEqual(['LIBRARY_PHOTO_CREDIT', 'isLibraryPhoto'])
  })

  it('tells a library photograph from a composed cover or an organiser upload', () => {
    expect(isLibraryPhoto('https://x.supabase.co/storage/v1/object/public/event-images/stock/categories/arts/gallery-day-1440.avif')).toBe(true)
    expect(isLibraryPhoto('https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/e1.png')).toBe(false)
    expect(isLibraryPhoto('https://x.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif')).toBe(false)
    expect(isLibraryPhoto(null)).toBe(false)
  })

  it('says it is not the venue, in plain words, for a night still wearing one', () => {
    expect(LIBRARY_PHOTO_CREDIT).toMatch(/not this venue/)
  })
})
