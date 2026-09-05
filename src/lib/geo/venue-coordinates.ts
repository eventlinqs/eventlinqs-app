/**
 * THE VENUE'S COORDINATES AT SAVE TIME (Scope v5, 3.1.1), one rule for the
 * create and the update actions.
 *
 * Three ways an event gets coordinates, in order of trust:
 *   1. A PLACES PICK in the organiser form: the form sends latitude, longitude,
 *      the place id and source 'places'. Kept exactly; never re-geocoded.
 *   2. Coordinates the form already held (an edit of an event that had them,
 *      or a value set by hand): kept, with the source the form reported, or
 *      'manual' when it reported none.
 *   3. A TYPED ADDRESS with no coordinates: geocoded on the server when the
 *      one named decision (src/lib/geo/geocode.ts) says the server key can
 *      serve the API. Every other outcome is a null pair and a named reason in
 *      the server log, never a silent catch: an organiser with a typed address
 *      still publishes, the event page still centres its map in the browser,
 *      and the backfill picks the row up later.
 *
 * A virtual event has no venue and gets nothing.
 */
import { composeGeocodeQuery, geocodeAddress, serverGeocodingAvailable, type GeocodeResult } from '@/lib/geo/geocode'
import type { VenueGeocodeSource } from '@/types/database'

// The three sources are a Postgres enum (public.venue_geocode_source, since
// 20260905000003) and the generated types carry them. This module used to
// declare the union itself, and the same union was hand-written into the
// generated types as well; the database owns it now and this is a re-export.
export type { VenueGeocodeSource }

export interface VenueCoordinateInput {
  event_type: 'in_person' | 'virtual' | 'hybrid'
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_postal_code: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  venue_place_id?: string | null
  venue_geocode_source?: VenueGeocodeSource | null
}

export interface VenueCoordinates {
  venue_latitude: number | null
  venue_longitude: number | null
  venue_place_id: string | null
  venue_geocode_source: VenueGeocodeSource | null
  venue_geocoded_at: string | null
  /** Why there are no coordinates, when there are none. For the log, by name. */
  reason: string | null
}

export interface VenueCoordinateDeps {
  /** The live geocoder; injected so the rule is tested without a key. */
  geocode: (query: string) => Promise<GeocodeResult>
  /** The one decision; injected for the same reason. */
  available: () => ReturnType<typeof serverGeocodingAvailable>
  now: () => Date
}

const liveDeps: VenueCoordinateDeps = {
  geocode: (query) => geocodeAddress(query, { key: (process.env.GOOGLE_MAPS_API_KEY ?? '').trim() }),
  available: serverGeocodingAvailable,
  now: () => new Date(),
}

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export async function resolveVenueCoordinates(
  input: VenueCoordinateInput,
  deps: VenueCoordinateDeps = liveDeps,
): Promise<VenueCoordinates> {
  const none = (reason: string | null): VenueCoordinates => ({
    venue_latitude: null,
    venue_longitude: null,
    venue_place_id: null,
    venue_geocode_source: null,
    venue_geocoded_at: null,
    reason,
  })

  if (input.event_type === 'virtual') return none(null)

  if (finite(input.venue_latitude) && finite(input.venue_longitude)) {
    return {
      venue_latitude: input.venue_latitude,
      venue_longitude: input.venue_longitude,
      venue_place_id: input.venue_place_id?.trim() || null,
      venue_geocode_source: input.venue_geocode_source ?? 'manual',
      venue_geocoded_at: deps.now().toISOString(),
      reason: null,
    }
  }

  const query = composeGeocodeQuery({
    venueName: input.venue_name,
    address: input.venue_address,
    city: input.venue_city,
    state: input.venue_state,
    postalCode: input.venue_postal_code,
    country: input.venue_country,
  })
  if (!(input.venue_address ?? '').trim()) return none('no address to geocode')

  const availability = deps.available()
  if (!availability.available) return none('server geocoding is off: ' + availability.reason)

  const result = await deps.geocode(query)
  if (!result.ok) return none('the Geocoding API answered ' + result.status + ': ' + result.reason)

  return {
    venue_latitude: result.hit.latitude,
    venue_longitude: result.hit.longitude,
    venue_place_id: input.venue_place_id?.trim() || result.hit.placeId,
    venue_geocode_source: 'geocoding',
    venue_geocoded_at: deps.now().toISOString(),
    reason: null,
  }
}
