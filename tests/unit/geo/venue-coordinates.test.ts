import { describe, expect, test } from 'vitest'
import { resolveVenueCoordinates, type VenueCoordinateDeps, type VenueCoordinateInput } from '@/lib/geo/venue-coordinates'

/**
 * The save-time rule for coordinates, with the geocoder and the availability
 * decision stubbed. Nothing here touches a key or the network.
 */
const NOW = new Date('2026-09-04T06:00:00.000Z')

const base: VenueCoordinateInput = {
  event_type: 'in_person',
  venue_name: 'The Corner Hotel',
  venue_address: '57 Swan Street',
  venue_city: 'Richmond',
  venue_state: 'VIC',
  venue_country: 'Australia',
  venue_postal_code: '3121',
  venue_latitude: null,
  venue_longitude: null,
}

function deps(overrides: Partial<VenueCoordinateDeps> & { calls?: string[] } = {}): VenueCoordinateDeps {
  const calls = overrides.calls ?? []
  return {
    geocode: async (q) => {
      calls.push(q)
      return { ok: true, status: 'OK', hit: { latitude: -37.8236, longitude: 144.9954, placeId: 'ChIJ-corner', formattedAddress: '57 Swan St, Richmond VIC 3121', locationType: 'ROOFTOP' } }
    },
    available: () => ({ available: true }),
    now: () => NOW,
    ...overrides,
  }
}

describe('resolveVenueCoordinates', () => {
  test('a Places pick is kept exactly and never re-geocoded', async () => {
    const calls: string[] = []
    const out = await resolveVenueCoordinates(
      { ...base, venue_latitude: -37.8166, venue_longitude: 144.9696, venue_place_id: 'ChIJ-forum', venue_geocode_source: 'places' },
      deps({ calls }),
    )
    expect(out).toMatchObject({ venue_latitude: -37.8166, venue_longitude: 144.9696, venue_place_id: 'ChIJ-forum', venue_geocode_source: 'places', reason: null })
    expect(out.venue_geocoded_at).toBe(NOW.toISOString())
    expect(calls).toEqual([])
  })

  test('coordinates with no stated source are kept as manual', async () => {
    const out = await resolveVenueCoordinates({ ...base, venue_latitude: -37.8, venue_longitude: 144.9 }, deps())
    expect(out.venue_geocode_source).toBe('manual')
  })

  test('a typed address with the server key available is geocoded, source geocoding, place id from the hit', async () => {
    const calls: string[] = []
    const out = await resolveVenueCoordinates(base, deps({ calls }))
    expect(calls).toEqual(['The Corner Hotel, 57 Swan Street, Richmond, VIC, 3121, Australia'])
    expect(out).toMatchObject({ venue_latitude: -37.8236, venue_longitude: 144.9954, venue_place_id: 'ChIJ-corner', venue_geocode_source: 'geocoding', reason: null })
  })

  test('with server geocoding off (the browser key standing in), nothing is called and the reason is named', async () => {
    const calls: string[] = []
    const out = await resolveVenueCoordinates(
      base,
      deps({ calls, available: () => ({ available: false, reason: 'GOOGLE_MAPS_API_KEY is the public browser key, which is referer restricted and cannot serve the Geocoding API' }) }),
    )
    expect(calls).toEqual([])
    expect(out.venue_latitude).toBeNull()
    expect(out.venue_geocode_source).toBeNull()
    expect(out.reason).toMatch(/server geocoding is off: GOOGLE_MAPS_API_KEY is the public browser key/)
  })

  test('a Google refusal is a named reason, never a throw, and leaves the pair null', async () => {
    const out = await resolveVenueCoordinates(
      base,
      deps({ geocode: async () => ({ ok: false, status: 'ZERO_RESULTS', reason: 'ZERO_RESULTS' }) }),
    )
    expect(out.venue_latitude).toBeNull()
    expect(out.reason).toBe('the Geocoding API answered ZERO_RESULTS: ZERO_RESULTS')
  })

  test('no address means no call and the reason says so', async () => {
    const calls: string[] = []
    const out = await resolveVenueCoordinates({ ...base, venue_address: '  ' }, deps({ calls }))
    expect(calls).toEqual([])
    expect(out.reason).toBe('no address to geocode')
  })

  test('a virtual event has no venue and gets nothing, with no reason to log', async () => {
    const calls: string[] = []
    const out = await resolveVenueCoordinates({ ...base, event_type: 'virtual', venue_latitude: -37.8, venue_longitude: 144.9 }, deps({ calls }))
    expect(calls).toEqual([])
    expect(out).toMatchObject({ venue_latitude: null, venue_longitude: null, reason: null })
  })

  test('half a pair is no pair: it falls through to the geocode', async () => {
    const calls: string[] = []
    await resolveVenueCoordinates({ ...base, venue_latitude: -37.8, venue_longitude: null }, deps({ calls }))
    expect(calls).toHaveLength(1)
  })
})
