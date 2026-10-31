import { describe, expect, test } from 'vitest'
import { pickPhoto } from '@/lib/places/pick-photo'
import type { PhotoRef } from '@/lib/places/google-places'

/**
 * WHICH OF A VENUE's GOOGLE PHOTOS LEADS AN EVENT PAGE: the first, in Google's own order, that is wide enough for the
 * hero and landscape; a narrow or portrait photo is passed over rather than stretched; none fit, none shown.
 */

const p = (name: string, widthPx: number, heightPx: number, authors = [{ displayName: 'A Person', uri: 'https://maps.google.com/maps/contrib/1' }]): PhotoRef => ({ name, widthPx, heightPx, authors })

describe('the photo that leads', () => {
  test("the first landscape photo at least 1000 px wide, in Google's order", () => {
    expect(pickPhoto([p('places/x/photos/a', 600, 400), p('places/x/photos/b', 1200, 1600), p('places/x/photos/c', 2000, 1300), p('places/x/photos/d', 4000, 3000)])?.name).toBe('places/x/photos/c')
  })
  test('none fits: none is shown', () => {
    expect(pickPhoto([p('places/x/photos/a', 800, 600), p('places/x/photos/b', 1000, 1400)])).toBeNull()
    expect(pickPhoto([])).toBeNull()
  })
  test('a photo with no author to credit is never chosen (Google: credit the author wherever the photo is shown)', () => {
    expect(pickPhoto([p('places/x/photos/a', 2000, 1300, []), p('places/x/photos/b', 1600, 1000)])?.name).toBe('places/x/photos/b')
  })
})
