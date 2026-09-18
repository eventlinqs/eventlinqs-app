import type { PickerCityGroups } from './picker-cities'

/**
 * THE CITY CATALOGUE, FETCHED ONCE PER TAB WHEN A VISITOR REACHES FOR THE
 * LOCATION PICKER, INSTEAD OF SERIALISED INTO EVERY DOCUMENT.
 *
 * ============================================================================
 * WHY A MODULE AND NOT A `fetch` INSIDE THE COMPONENT
 * ============================================================================
 *
 * There are up to three location pickers on one page: the header renders one
 * for the desktop bar and one for the mobile sheet, and the homepage adds a
 * third in `LocationFilterBanner`. They arm independently, on whichever the
 * visitor's pointer, finger or focus reaches first.
 *
 * Three copies of the same `useEffect` would be three requests for one
 * catalogue the moment a pointer crosses two of them. The promise is held here
 * so the second and third callers join the first one's request, and the
 * resolved value is kept so every later open is synchronous. That is the same
 * bargain `useDeferredComponent` makes for the chunk: pay once, on intent.
 *
 * ============================================================================
 * WHY THE SHARED REQUEST CARRIES NO ABORT SIGNAL
 * ============================================================================
 *
 * Because it is shared. One caller unmounting would abort a request two others
 * are waiting on, and the failure would surface in components that are still on
 * screen and did nothing wrong. Callers drop the result instead: a `cancelled`
 * flag in the hook, exactly as `useDeferredComponent` already does for the
 * module it loads. The request is one small GET and it is cache-control
 * `public`, so letting an abandoned one finish costs the visitor nothing.
 *
 * ============================================================================
 * WHAT IS NOT CACHED
 * ============================================================================
 *
 * A FAILURE. `inflight` is cleared when the request rejects, so the dialog's
 * "Try again" is a real retry rather than a second look at the same rejected
 * promise. `loaded` is only ever written from a successful response.
 */

/**
 * What the dialog actually reads. `validSlugs` is not here on purpose: it is
 * for `/events/browse/[city]` validation and the sitemap, both server-side, and
 * shipping it would put bytes nobody reads back on the wire.
 */
export type PickerCatalogue = Pick<PickerCityGroups, 'australia' | 'internationalByCountry'>

export const PICKER_CITIES_ENDPOINT = '/api/location/cities'

let loaded: PickerCatalogue | null = null
let inflight: Promise<PickerCatalogue> | null = null

/** The catalogue if this tab already has it, otherwise null. Never fetches. */
export function loadedPickerCatalogue(): PickerCatalogue | null {
  return loaded
}

/**
 * Fetch the catalogue, joining a request already in flight. Rejects on a
 * non-200 or a malformed body rather than resolving to an empty catalogue: an
 * empty list rendered in the dialog reads as "this platform has no cities",
 * which is indistinguishable to a visitor from the city they want being
 * missing.
 */
export function fetchPickerCatalogue(): Promise<PickerCatalogue> {
  if (loaded) return Promise.resolve(loaded)
  if (inflight) return inflight

  inflight = (async () => {
    const res = await fetch(PICKER_CITIES_ENDPOINT, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`the city catalogue responded ${res.status}`)
    const body = (await res.json()) as Partial<PickerCatalogue>
    if (!Array.isArray(body.australia) || !Array.isArray(body.internationalByCountry)) {
      throw new Error('the city catalogue came back in a shape the dialog cannot read')
    }
    const catalogue: PickerCatalogue = {
      australia: body.australia,
      internationalByCountry: body.internationalByCountry,
    }
    loaded = catalogue
    return catalogue
  })()

  inflight.catch(() => {
    // Cleared so "Try again" issues a new request. The rejection itself is
    // handled by whichever caller awaited it; this handler exists only to stop
    // the shared promise counting as unhandled when every caller has gone.
  }).finally(() => {
    if (!loaded) inflight = null
  })

  return inflight
}

/** Test seam. Nothing in the application calls this. */
export function resetPickerCatalogueForTests(): void {
  loaded = null
  inflight = null
}
