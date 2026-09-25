import { afterEach, describe, expect, test, vi } from 'vitest'

const { getPickerCitiesMock } = vi.hoisted(() => ({ getPickerCitiesMock: vi.fn() }))

vi.mock('@/lib/locations/picker-cities', () => ({ getPickerCities: getPickerCitiesMock }))

import { GET } from '@/app/api/location/cities/route'

/**
 * THE ENDPOINT THAT REPLACED A PROP, AND THE TWO DECISIONS IT HAD TO GET RIGHT.
 *
 * Close-out C8B.3. The city catalogue used to be handed to a client component as
 * a prop, which serialised it into the RSC payload of every page on the platform
 * whether the dialog reading it ever opened or not. It comes from here now.
 *
 * Two of the decisions in that route are ARGUABLE, which is exactly why they are
 * pinned by a test rather than by a comment. A comment records what somebody
 * meant; a test refuses the change that undoes it.
 *
 *   `validSlugs` IS WITHHELD. The dialog never reads it; it exists for
 *   /events/browse/[city] validation and the sitemap, both of which run on the
 *   server. Returning it would put the defect back in a smaller font, and the
 *   obvious "just return the whole object" edit is the one that does it.
 *
 *   THE RESPONSE IS `private` AND SHORT. The first version of this route said
 *   `public, max-age=3600` and reasoned that the origin is already an hour
 *   behind through `unstable_cache`. That reasoning was FALSE:
 *   src/lib/events/revalidate-event.ts calls
 *   `revalidateTag('picker-cities', { expire: 0 })` when an event is published,
 *   so the origin is invalidated at exactly the moment a city can become new.
 *   An hour in a shared cache would have meant an organiser publishing the first
 *   event in a town while visitors are told that town is not on the list, which
 *   is the Geelong report this repository calls a launch blocker.
 */

const CATALOGUE = {
  australia: [
    { city: 'Geelong', slug: 'geelong', country: 'Australia', countryCode: 'AU', latitude: -38.15, longitude: 144.36, isLaunchCity: true },
  ],
  internationalByCountry: [],
  validSlugs: ['geelong'],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/location/cities', () => {
  test('returns the catalogue the dialog reads', async () => {
    getPickerCitiesMock.mockResolvedValue(CATALOGUE)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.australia).toHaveLength(1)
    expect(body.australia[0].slug).toBe('geelong')
    expect(body.internationalByCountry).toEqual([])
  })

  test('withholds validSlugs, which the dialog never reads', async () => {
    getPickerCitiesMock.mockResolvedValue(CATALOGUE)
    const body = await (await GET()).json()
    expect(Object.keys(body).sort()).toEqual(['australia', 'internationalByCountry'])
  })

  test('is never stored in a shared cache, because a publish invalidates the origin at once', async () => {
    getPickerCitiesMock.mockResolvedValue(CATALOGUE)
    const cacheControl = (await GET()).headers.get('cache-control') ?? ''
    expect(cacheControl).toContain('private')
    expect(cacheControl).not.toContain('public')
    expect(cacheControl).not.toContain('s-maxage')
  })

  test('is cached for at most a minute, so an invalidation is effectively immediate', async () => {
    getPickerCitiesMock.mockResolvedValue(CATALOGUE)
    const cacheControl = (await GET()).headers.get('cache-control') ?? ''
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? Infinity)
    expect(maxAge).toBeLessThanOrEqual(60)
  })

  test('answers 503 rather than an empty catalogue when the read fails', async () => {
    // AN EMPTY LIST IS THE DANGEROUS ANSWER. Rendered in the dialog it reads as
    // "this platform has no cities", which a visitor cannot tell from their own
    // city being missing. A 503 reaches the dialog's failure state instead.
    getPickerCitiesMock.mockRejectedValue(new Error('database unreachable'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('unavailable')
    error.mockRestore()
  })
})
