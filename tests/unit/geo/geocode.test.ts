import { describe, expect, test } from 'vitest'
import {
  composeGeocodeQuery,
  decideServerGeocoding,
  geocodeAddress,
  interpretGeocodeBody,
  GEOCODING_ENDPOINT,
} from '@/lib/geo/geocode'

/**
 * The transport is a stub in every test here: no key, no bill. The statuses
 * are Google's own list (Geocoding request and response, fetched 2026-09-04).
 */
const OK_BODY = {
  status: 'OK',
  results: [
    {
      formatted_address: '154 Flinders St, Melbourne VIC 3000, Australia',
      geometry: { location: { lat: -37.8166268, lng: 144.9695761 }, location_type: 'ROOFTOP' },
      place_id: 'ChIJ-forum',
      address_components: [],
    },
  ],
}

const stub = (status: number, body: unknown) => async () => ({ status, json: async () => body })

describe('decideServerGeocoding, the one named decision', () => {
  test('no server key: unavailable, and says so', () => {
    expect(decideServerGeocoding(undefined, 'browser-key-fixture')).toEqual({ available: false, reason: 'GOOGLE_MAPS_API_KEY is not set' })
    expect(decideServerGeocoding('   ', 'browser-key-fixture').available).toBe(false)
  })

  test('the server key equal to the public browser key: unavailable, because a referer-restricted key cannot serve the API', () => {
    const d = decideServerGeocoding('same-key-fixture', 'same-key-fixture')
    expect(d.available).toBe(false)
    if (!d.available) expect(d.reason).toMatch(/public browser key/)
  })

  test('a distinct server key: available', () => {
    expect(decideServerGeocoding('server-key-fixture', 'browser-key-fixture')).toEqual({ available: true })
    expect(decideServerGeocoding('server-key-fixture', undefined)).toEqual({ available: true })
  })
})

describe('composeGeocodeQuery', () => {
  test('joins the parts the organiser gave, in order, skipping blanks', () => {
    expect(composeGeocodeQuery({ venueName: 'Forum Melbourne', address: ' 154 Flinders St ', city: '', state: 'VIC', postalCode: '3000', country: 'Australia' })).toBe(
      'Forum Melbourne, 154 Flinders St, VIC, 3000, Australia',
    )
    expect(composeGeocodeQuery({})).toBe('')
  })
})

describe('interpretGeocodeBody', () => {
  test('OK with a location becomes a hit with the place id and the location type', () => {
    const r = interpretGeocodeBody(OK_BODY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.hit).toEqual({
        latitude: -37.8166268,
        longitude: 144.9695761,
        placeId: 'ChIJ-forum',
        formattedAddress: '154 Flinders St, Melbourne VIC 3000, Australia',
        locationType: 'ROOFTOP',
      })
    }
  })

  test.each(['ZERO_RESULTS', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'])(
    '%s comes back as a named outcome, never a throw',
    (status) => {
      const r = interpretGeocodeBody({ status, error_message: 'because' })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.status).toBe(status)
        expect(r.reason).toBe(status + ': because')
      }
    },
  )

  test('REQUEST_DENIED carries the sentence Google gives for a referer-restricted key', () => {
    const r = interpretGeocodeBody({ status: 'REQUEST_DENIED', error_message: 'API keys with referer restrictions cannot be used with this API.' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/referer restrictions/)
  })

  test('an unknown status, a missing location, or a location off the globe is MALFORMED', () => {
    expect(interpretGeocodeBody({ status: 'SOMETHING' })).toMatchObject({ ok: false, status: 'MALFORMED' })
    expect(interpretGeocodeBody({ status: 'OK', results: [{ geometry: {} }] })).toMatchObject({ ok: false, status: 'MALFORMED' })
    expect(interpretGeocodeBody({ status: 'OK', results: [{ geometry: { location: { lat: 95, lng: 10 } } }] })).toMatchObject({ ok: false, status: 'MALFORMED' })
    expect(interpretGeocodeBody(null)).toMatchObject({ ok: false, status: 'MALFORMED' })
  })
})

describe('geocodeAddress', () => {
  test('sends address, region au and the key, and returns the hit', async () => {
    let seen = ''
    const r = await geocodeAddress('154 Flinders St, Melbourne', {
      key: 'server-key-fixture',
      fetchImpl: async (url) => {
        seen = url
        return { status: 200, json: async () => OK_BODY }
      },
    })
    expect(r.ok).toBe(true)
    expect(seen.startsWith(GEOCODING_ENDPOINT + '?')).toBe(true)
    const params = new URL(seen).searchParams
    expect(params.get('address')).toBe('154 Flinders St, Melbourne')
    expect(params.get('region')).toBe('au')
    expect(params.get('key')).toBe('server-key-fixture')
  })

  test('an HTTP failure and a non-JSON body are named outcomes; the key is in neither reason', async () => {
    const http = await geocodeAddress('x', { key: 'server-key-fixture', fetchImpl: stub(503, {}) })
    expect(http).toMatchObject({ ok: false, status: 'HTTP_ERROR' })
    const thrown = await geocodeAddress('x', {
      key: 'server-key-fixture',
      fetchImpl: async () => {
        throw new Error('ECONNRESET')
      },
    })
    expect(thrown).toMatchObject({ ok: false, status: 'HTTP_ERROR' })
    const bad = await geocodeAddress('x', {
      key: 'server-key-fixture',
      fetchImpl: async () => ({
        status: 200,
        json: async () => {
          throw new Error('not json')
        },
      }),
    })
    expect(bad).toMatchObject({ ok: false, status: 'MALFORMED' })
    for (const r of [http, thrown, bad]) if (!r.ok) expect(r.reason).not.toContain('server-key-fixture')
  })

  test('an empty address is INVALID_REQUEST without a call; a missing key throws, which is a programming error', async () => {
    let called = false
    const r = await geocodeAddress('   ', {
      key: 'server-key-fixture',
      fetchImpl: async () => {
        called = true
        return { status: 200, json: async () => OK_BODY }
      },
    })
    expect(r).toMatchObject({ ok: false, status: 'INVALID_REQUEST' })
    expect(called).toBe(false)
    await expect(geocodeAddress('x', { key: '' })).rejects.toThrow(/needs a key/)
  })
})
