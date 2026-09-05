/**
 * SERVER-SIDE GEOCODING (Scope v5, 3.1.1), the Geocoding API client.
 *
 * WHAT IT IS FOR. An organiser who picks their venue from Places gives us
 * coordinates directly (src/lib/maps/address-components.ts). An organiser who
 * types an address and never picks, and every event created before 4 September
 * 2026, has none, so the event never appears on its city map. This resolves a
 * typed address to coordinates on the server, at save time and in the backfill.
 *
 * ONE NAMED DECISION. `serverGeocodingAvailable()` is the only thing that
 * decides whether the live call is attempted, and it says why not. The reason
 * it exists: on 4 September 2026 GOOGLE_MAPS_API_KEY in production, preview and
 * local was THE SAME VALUE as the public browser key, which is referer
 * restricted, and Google answers such a key with REQUEST_DENIED ("API keys with
 * referer restrictions cannot be used with this API"). A server key that is
 * really the browser key can serve nothing here, so equality with the public
 * key is treated as absence. Pasting a real server key into
 * GOOGLE_MAPS_API_KEY is the only remaining step (BLOCKED ON FOUNDER, KEY ONLY).
 *
 * THE CONTRACT WITH GOOGLE, cited (Law 7). Geocoding API, "Geocoding request
 * and response", https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 * (fetched 2026-09-04): GET https://maps.googleapis.com/maps/api/geocode/json
 * with `address` and `key`, optional `region` (ccTLD) and `components`; the
 * response carries `status` in {OK, ZERO_RESULTS, OVER_DAILY_LIMIT,
 * OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR} and each
 * result carries formatted_address, geometry.location {lat, lng},
 * geometry.location_type in {ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER,
 * APPROXIMATE}, place_id and address_components.
 *
 * The transport is injectable so the whole decision tree is tested against a
 * stub without a key and without a bill. The key is never logged, never thrown
 * inside a message, and never part of a returned value.
 */

export type GeocodeStatus =
  | 'OK'
  | 'ZERO_RESULTS'
  | 'OVER_DAILY_LIMIT'
  | 'OVER_QUERY_LIMIT'
  | 'REQUEST_DENIED'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR'

export type GeocodeLocationType = 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE'

export interface GeocodeHit {
  latitude: number
  longitude: number
  placeId: string | null
  formattedAddress: string | null
  locationType: GeocodeLocationType | null
}

export type GeocodeResult =
  | { ok: true; hit: GeocodeHit; status: 'OK' }
  | { ok: false; status: GeocodeStatus | 'HTTP_ERROR' | 'MALFORMED'; reason: string }

/** Why the live call is not attempted. Each is a sentence a log can carry. */
export type GeocodingUnavailableReason =
  | 'GOOGLE_MAPS_API_KEY is not set'
  | 'GOOGLE_MAPS_API_KEY is the public browser key, which is referer restricted and cannot serve the Geocoding API'

export type GeocodingAvailability = { available: true } | { available: false; reason: GeocodingUnavailableReason }

/**
 * The one decision. Pure over its inputs so it can be tested against every
 * combination without touching process.env.
 */
export function decideServerGeocoding(
  serverKey: string | undefined | null,
  publicKey: string | undefined | null,
): GeocodingAvailability {
  const server = (serverKey ?? '').trim()
  if (server.length === 0) return { available: false, reason: 'GOOGLE_MAPS_API_KEY is not set' }
  const pub = (publicKey ?? '').trim()
  if (pub.length > 0 && pub === server) {
    return {
      available: false,
      reason: 'GOOGLE_MAPS_API_KEY is the public browser key, which is referer restricted and cannot serve the Geocoding API',
    }
  }
  return { available: true }
}

export function serverGeocodingAvailable(): GeocodingAvailability {
  return decideServerGeocoding(process.env.GOOGLE_MAPS_API_KEY, process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
}

export const GEOCODING_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'

/** The address string the platform geocodes: every part the organiser gave, in order, no blanks. */
export function composeGeocodeQuery(parts: {
  venueName?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}): string {
  return [parts.venueName, parts.address, parts.city, parts.state, parts.postalCode, parts.country]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

export type GeocodeFetch = (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>

const STATUSES: ReadonlySet<string> = new Set([
  'OK',
  'ZERO_RESULTS',
  'OVER_DAILY_LIMIT',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'INVALID_REQUEST',
  'UNKNOWN_ERROR',
])
const LOCATION_TYPES: ReadonlySet<string> = new Set(['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'])

/**
 * Geocode one address. Never throws for a Google-side outcome: every status
 * comes back as a value the caller can log by name. Throws only if the caller
 * passed no key, which is a programming error rather than an outcome.
 */
export async function geocodeAddress(
  query: string,
  options: { key: string; region?: string; fetchImpl?: GeocodeFetch },
): Promise<GeocodeResult> {
  const key = options.key.trim()
  if (!key) throw new Error('geocodeAddress needs a key; decide with serverGeocodingAvailable() first')
  const q = query.trim()
  if (!q) return { ok: false, status: 'INVALID_REQUEST', reason: 'empty address' }
  const params = new URLSearchParams({ address: q, key })
  params.set('region', options.region ?? 'au')
  const fetchImpl: GeocodeFetch = options.fetchImpl ?? ((url) => fetch(url))
  let response: { status: number; json: () => Promise<unknown> }
  try {
    response = await fetchImpl(GEOCODING_ENDPOINT + '?' + params.toString())
  } catch (err) {
    return {
      ok: false,
      status: 'HTTP_ERROR',
      reason: 'the Geocoding API could not be reached: ' + (err instanceof Error ? err.message : String(err)),
    }
  }
  if (response.status !== 200) {
    return { ok: false, status: 'HTTP_ERROR', reason: 'the Geocoding API answered HTTP ' + response.status }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, status: 'MALFORMED', reason: 'the Geocoding API answered with something that is not JSON' }
  }
  return interpretGeocodeBody(body)
}

/** Pure interpretation of a response body, so every status is testable without a transport. */
export function interpretGeocodeBody(body: unknown): GeocodeResult {
  if (!body || typeof body !== 'object') return { ok: false, status: 'MALFORMED', reason: 'no response object' }
  const b = body as { status?: unknown; error_message?: unknown; results?: unknown }
  const status = typeof b.status === 'string' && STATUSES.has(b.status) ? (b.status as GeocodeStatus) : null
  if (!status) return { ok: false, status: 'MALFORMED', reason: 'unknown status ' + JSON.stringify(b.status) }
  if (status !== 'OK') {
    const message = typeof b.error_message === 'string' ? b.error_message : ''
    return { ok: false, status, reason: message ? status + ': ' + message : status }
  }
  const first = Array.isArray(b.results) ? (b.results[0] as Record<string, unknown> | undefined) : undefined
  const geometry = first?.geometry as { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown } | undefined
  const lat = geometry?.location?.lat
  const lng = geometry?.location?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 'MALFORMED', reason: 'OK with no numeric location' }
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, status: 'MALFORMED', reason: 'OK with a location outside the globe' }
  }
  const locationType =
    typeof geometry?.location_type === 'string' && LOCATION_TYPES.has(geometry.location_type)
      ? (geometry.location_type as GeocodeLocationType)
      : null
  return {
    ok: true,
    status: 'OK',
    hit: {
      latitude: lat,
      longitude: lng,
      placeId: typeof first?.place_id === 'string' ? first.place_id : null,
      formattedAddress: typeof first?.formatted_address === 'string' ? first.formatted_address : null,
      locationType,
    },
  }
}
