import { describe, expect, test } from 'vitest'
import { findVenuePlace, type PlaceAsker } from '@/lib/places/match-venue'
import type { GooglePlace, OurVenue } from '@/lib/places/venue-match'

/**
 * FINDING A VENUE's GOOGLE PLACE: Google's nearby candidates are checked one by one against src/lib/places/venue-match.ts;
 * the first that agrees on name, address and location is the venue's; none agrees, none is taken, every refusal kept.
 * A cost guard refusal stops the search at once, never treated as 'no match'.
 */

const corner: OurVenue = { name: 'Corner Hotel', address: '57 Swan Street, Richmond VIC 3121', lat: -37.8253, lng: 144.9907 }
const places: Record<string, GooglePlace> = {
  pizza: { id: 'pizza', displayName: 'Swan Street Pizza', formattedAddress: '57 Swan St, Richmond VIC 3121, Australia', lat: -37.8253, lng: 144.9907 },
  corner: { id: 'corner', displayName: 'The Corner Hotel', formattedAddress: '57 Swan St, Richmond VIC 3121, Australia', lat: -37.82535, lng: 144.99075 },
}
const asker = (ids: string[], over: Partial<PlaceAsker> = {}): PlaceAsker => ({
  candidates: async () => ({ ok: true, value: ids }),
  details: async (id) => ({ ok: true, value: places[id] ?? null }),
  ...over,
})

describe("a venue's Google place", () => {
  test('the first candidate that agrees is taken, the ones before it refused with their reasons', async () => {
    const r = await findVenuePlace(corner, asker(['pizza', 'corner']))
    expect(r.state).toBe('matched')
    if (r.state === 'matched') {
      expect(r.placeId).toBe('corner')
      expect(r.refused).toHaveLength(1)
      expect(r.refused[0]).toMatch(/name/)
    }
  })

  test('no candidate agrees: no place, with every reason', async () => {
    const r = await findVenuePlace(corner, asker(['pizza']))
    expect(r).toEqual({ state: 'no match', refused: [expect.stringMatching(/name/)] })
  })

  test('Google finds nothing: no place', async () => {
    expect(await findVenuePlace(corner, asker([]))).toEqual({ state: 'no match', refused: [] })
  })

  test('the cost guard says no: stopped, never read as no match', async () => {
    const r = await findVenuePlace(corner, asker(['corner'], { details: async () => ({ ok: false, reason: "Today's Google call quota is reached." }) }))
    expect(r).toEqual({ state: 'stopped', reason: "Today's Google call quota is reached." })
  })

  test('a venue with no address is not searched at all (no call spent)', async () => {
    let called = 0
    const r = await findVenuePlace({ ...corner, address: null }, asker(['corner'], { candidates: async () => { called += 1; return { ok: true, value: [] } } }))
    expect(called).toBe(0)
    expect(r.state).toBe('no match')
  })
})
