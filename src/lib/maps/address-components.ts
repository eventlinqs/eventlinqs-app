/**
 * A PLACES PICK, MAPPED TO THE VENUE FIELDS (Scope v5, 3.1.1).
 *
 * When an organiser picks their venue from the Places suggestions, Google hands
 * back a Place with a display name, a formatted address, a location, an id and
 * a list of address components. This turns that into the six venue fields the
 * form already carries plus the three coordinate columns, so a pick fills the
 * form the way a person would have typed it, in Australian order.
 *
 * THE CONTRACT WITH GOOGLE, cited (Law 7). Maps JavaScript API, Place class,
 * https://developers.google.com/maps/documentation/javascript/reference/place
 * (fetched 2026-09-04): `addressComponents: Array<AddressComponent>` where each
 * carries `longText`, `shortText` and `types`; `formattedAddress`, `location`,
 * `id`, `displayName`. The component type names used here are Google's:
 * street_number, route, subpremise, locality, sublocality, postal_town,
 * administrative_area_level_1, postal_code, country.
 *
 * WHAT "CITY" MEANS HERE, and why the caller also gets the coordinates. For an
 * Australian address Google's `locality` is the SUBURB (Fitzroy, Newtown,
 * Fortitude Valley), and only for a CBD address is it the city itself. The
 * platform's venue_city is the locality, exactly what an organiser would type,
 * and the canonical city claim (city_primary) is resolved by the save action
 * from the locality first and from the coordinates second
 * (src/lib/cities/resolve.ts, resolveCitySlugFromCoordinates). This file makes
 * no guess about the city; it reports what Google said.
 *
 * Pure. No Google types imported, so it runs in a unit test without the Maps
 * library: the shapes below are the subset of the Place class this file reads.
 */

export interface PlaceAddressComponent {
  longText?: string | null
  shortText?: string | null
  types: string[]
}

export interface PlacePickInput {
  id?: string | null
  displayName?: string | null
  formattedAddress?: string | null
  latitude?: number | null
  longitude?: number | null
  addressComponents?: PlaceAddressComponent[] | null
}

export interface VenueFieldsFromPlace {
  venue_name: string
  venue_address: string
  venue_city: string
  venue_state: string
  venue_country: string
  venue_postal_code: string
  venue_latitude: number | null
  venue_longitude: number | null
  venue_place_id: string | null
}

function component(components: PlaceAddressComponent[], type: string, form: 'long' | 'short' = 'long'): string {
  const hit = components.find((c) => Array.isArray(c.types) && c.types.includes(type))
  if (!hit) return ''
  const value = form === 'short' ? (hit.shortText ?? hit.longText) : (hit.longText ?? hit.shortText)
  return (value ?? '').trim()
}

/**
 * Australian street line: "3/154 Flinders St" when a subpremise (unit, shop,
 * level) is present, "154 Flinders St" otherwise, and the route alone when the
 * place has no number (a park, a beach). Never the formatted address, which
 * repeats the suburb, state and postcode the other fields already carry.
 */
export function composeStreetLine(components: PlaceAddressComponent[]): string {
  const subpremise = component(components, 'subpremise')
  const number = component(components, 'street_number')
  const route = component(components, 'route')
  const numberPart = subpremise && number ? subpremise + '/' + number : subpremise || number
  return [numberPart, route].filter(Boolean).join(' ').trim()
}

/** The suburb or town, in Google's order of preference for an address. */
export function composeLocality(components: PlaceAddressComponent[]): string {
  return (
    component(components, 'locality') ||
    component(components, 'postal_town') ||
    component(components, 'sublocality') ||
    component(components, 'sublocality_level_1')
  )
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The mapping. Every field is a string the form can hold (empty when Google
 * gave nothing), the coordinates are numbers or null, and the place id is kept
 * so the same venue can be recognised later.
 */
export function venueFieldsFromPlace(place: PlacePickInput): VenueFieldsFromPlace {
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : []
  const lat = finiteOrNull(place.latitude)
  const lng = finiteOrNull(place.longitude)
  const bothOrNeither = lat !== null && lng !== null
  return {
    venue_name: (place.displayName ?? '').trim(),
    venue_address: composeStreetLine(components),
    venue_city: composeLocality(components),
    venue_state: component(components, 'administrative_area_level_1', 'short'),
    venue_country: component(components, 'country', 'long'),
    venue_postal_code: component(components, 'postal_code'),
    venue_latitude: bothOrNeither ? lat : null,
    venue_longitude: bothOrNeither ? lng : null,
    venue_place_id: (place.id ?? '').trim() || null,
  }
}
