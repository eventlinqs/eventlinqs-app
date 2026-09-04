/**
 * PLACES AUTOCOMPLETE FOR THE VENUE FINDER (Scope v5, 3.1.1), in the browser.
 *
 * Runs on the organiser's browser with the PUBLIC browser key through the Maps
 * JavaScript API, which is the one place that key is allowed to work: it is
 * referer restricted to the platform's own origins. The Geocoding API on the
 * server needs a different key (src/lib/geo/geocode.ts).
 *
 * THE CONTRACT WITH GOOGLE, cited (Law 7). Maps JavaScript API, "Place
 * Autocomplete Data API", last updated 2026-09-01,
 * https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
 * (fetched 2026-09-04):
 *   - AutocompleteSuggestion.fetchAutocompleteSuggestions(request) returns
 *     { suggestions }, each with a placePrediction; placePrediction.toPlace()
 *     gives a Place; Place.fetchFields({ fields }) loads the fields asked for.
 *   - sessionToken: "Generate a fresh token per user session"; "Calling
 *     fetchFields() ends the autocomplete session"; "Using the same token for
 *     more than one session will result in each request being billed
 *     individually."
 *   - includedRegionCodes filters by country.
 *
 * So: one session token from the first keystroke to the pick, a new token after
 * the pick, and the pick's fetchFields is the call that closes the session.
 */
import { getGoogleMapsLoader } from '@/lib/maps/google-maps-loader'
import { venueFieldsFromPlace, type VenueFieldsFromPlace } from '@/lib/maps/address-components'

export interface VenueSuggestion {
  /** Stable for the life of the suggestion list; the prediction's place id. */
  id: string
  /** The main line, the venue or street. */
  mainText: string
  /** The secondary line, the suburb, state and country. */
  secondaryText: string
  /** Kept so a pick can be turned into a Place without a second lookup. */
  prediction: google.maps.places.PlacePrediction
}

/** Australia only (Law 3), in the shape Google wants: ISO 3166-1 alpha-2, lower case. */
export const VENUE_REGION_CODES = ['au']

/** Fields the pick needs, and no more: each field is a billable data SKU. */
export const PLACE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents']

/** The shortest input worth a request. Below it Google returns little and every request costs. */
export const MIN_QUERY_LENGTH = 3

export type PlacesUnavailableReason =
  | 'no browser key in this build'
  | 'the Maps library could not be loaded'
  | 'this origin is not allowed by the browser key'

export class PlacesUnavailable extends Error {
  readonly reason: PlacesUnavailableReason
  constructor(reason: PlacesUnavailableReason) {
    super(reason)
    this.name = 'PlacesUnavailable'
    this.reason = reason
  }
}

let placesLibrary: Promise<google.maps.PlacesLibrary> | null = null

async function loadPlaces(): Promise<google.maps.PlacesLibrary> {
  const loader = getGoogleMapsLoader()
  if (!loader) throw new PlacesUnavailable('no browser key in this build')
  if (!placesLibrary) {
    placesLibrary = (loader.importLibrary('places') as Promise<google.maps.PlacesLibrary>).catch((err) => {
      placesLibrary = null
      throw err instanceof PlacesUnavailable ? err : new PlacesUnavailable('the Maps library could not be loaded')
    })
  }
  return placesLibrary
}

/** Google's answer for a referer the key does not allow, read off the error text. */
export function isRefererBlocked(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err)
  return /referer/i.test(text) && /block/i.test(text)
}

/**
 * One typing-to-pick session. `suggest` may be called on every keystroke; the
 * caller debounces. `pick` closes the session and returns the venue fields.
 */
export class VenueFinderSession {
  private token: google.maps.places.AutocompleteSessionToken | null = null

  private async tokenFor(places: google.maps.PlacesLibrary): Promise<google.maps.places.AutocompleteSessionToken> {
    if (!this.token) this.token = new places.AutocompleteSessionToken()
    return this.token
  }

  async suggest(input: string): Promise<VenueSuggestion[]> {
    const query = input.trim()
    if (query.length < MIN_QUERY_LENGTH) return []
    const places = await loadPlaces()
    const sessionToken = await this.tokenFor(places)
    let suggestions: google.maps.places.AutocompleteSuggestion[]
    try {
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: VENUE_REGION_CODES,
        sessionToken,
      })
      suggestions = response.suggestions
    } catch (err) {
      if (isRefererBlocked(err)) throw new PlacesUnavailable('this origin is not allowed by the browser key')
      throw err
    }
    const out: VenueSuggestion[] = []
    for (const s of suggestions) {
      const p = s.placePrediction
      if (!p) continue
      out.push({
        id: p.placeId,
        mainText: p.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.secondaryText?.text ?? '',
        prediction: p,
      })
    }
    return out
  }

  /**
   * Turn a suggestion into the venue fields. Ends the session (Google: calling
   * fetchFields ends the autocomplete session), so the next keystroke starts a
   * fresh token.
   */
  async pick(suggestion: VenueSuggestion): Promise<VenueFieldsFromPlace> {
    const place = suggestion.prediction.toPlace()
    await place.fetchFields({ fields: PLACE_FIELDS })
    this.token = null
    return venueFieldsFromPlace({
      id: place.id,
      displayName: place.displayName ?? null,
      formattedAddress: place.formattedAddress ?? null,
      latitude: place.location?.lat() ?? null,
      longitude: place.location?.lng() ?? null,
      addressComponents: (place.addressComponents ?? []).map((c) => ({
        longText: c.longText ?? null,
        shortText: c.shortText ?? null,
        types: c.types ?? [],
      })),
    })
  }
}
