import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

// v2 of the loader exposes a functional API (setOptions + importLibrary)
// rather than a Loader class. We call setOptions exactly once per page
// load with the public API key, then hand callers the typed
// importLibrary fn so they can lazy-load the 'maps' library. When the
// key is not set we return null and the map component shows a
// graceful-degradation notice instead of crashing.
type LoaderHandle = {
  importLibrary: typeof importLibrary
}

/**
 * The Map ID every map must be built with.
 *
 * AdvancedMarkerElement REQUIRES one (Google, "Advanced markers migration": a
 * map built without a Map ID renders no advanced markers at all), so this is
 * not a nicety. It is declared in src/lib/env/manifest.mjs and required on
 * production and preview.
 *
 * THE TRADE IT CARRIES, recorded here because it is invisible otherwise.
 * Google, MapOptions.styles reference: "This feature is not available when
 * using a map ID, or when using vector maps (use cloud-based maps styling
 * instead)." So EVENTLINQS_MAP_STYLE, the 18-rule muted style shared by the
 * venue map and the cluster map, STOPS APPLYING the moment a Map ID is set.
 * The identical rules must live on the Map ID as a cloud style, or every map
 * reverts to default Google colours: bright parks, POI pins and full road
 * labels, which is a Law 1 regression on every event and city page.
 */
export const GOOGLE_MAPS_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || undefined

let cached: LoaderHandle | null = null

/**
 * WHEN GOOGLE REFUSES THE KEY, THE BUYER MUST NOT BE THE ONE WHO FINDS OUT.
 *
 * Found on 11 September 2026 by reading the event page rather than sweeping it
 * (close-out UX2.5). Where the venue map should be, the page showed Google's
 * own grey panel:
 *
 *     "Sorry! Something went wrong.
 *      This page didn't load Google Maps correctly. See the JavaScript console
 *      for technical details."
 *
 * That is a third-party developer message, with an exclamation mark, telling a
 * person buying a ticket to open a developer console. It is generic by
 * definition (Law 1) and it sits on the highest-intent surface on the platform.
 *
 * Every map component already HAS a designed fallback - the gold-tinted plate
 * with the pin, the venue name and the address - and it was being hidden,
 * because an auth failure still resolves `importLibrary` and still constructs a
 * Map. The component saw a Map, called itself interactive, dropped its own
 * placeholder, and Google painted the grey panel into the container underneath.
 *
 * THE MECHANISM IS GOOGLE'S OWN, not a guess. Maps JavaScript API, "Handle
 * authentication errors": "If the following global function is defined it will
 * be called when the authentication fails. function gm_authFailure() { }"
 * (https://developers.google.com/maps/documentation/javascript/events#auth-errors,
 * fetched 2026-09-11).
 *
 * It is registered HERE rather than in a component because four surfaces load
 * maps - the venue map, its lazy wrapper, the city map and the events cluster
 * map - and an auth failure is a property of the KEY, not of any one of them.
 * One registration, one flag, every surface.
 *
 * This is also what a local run hits: the browser key is referrer-restricted
 * and localhost is not on the allowed list, so `RefererNotAllowedMapError` is
 * the everyday case here (close-out UX2.2b).
 */
declare global {
  interface Window {
    /**
     * Google's documented hook, declared here because this module is the one
     * that assigns it. Their own TypeScript example declares it exactly this
     * way (Maps JavaScript API, "Handle authentication errors").
     */
    gm_authFailure?: () => void
  }
}

let authFailed = false
const authListeners = new Set<() => void>()

/** Has Google refused this key? Read once on mount, then subscribe. */
export function googleMapsAuthFailed(): boolean {
  return authFailed
}

/** Tell me when Google refuses the key. Returns an unsubscribe. */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

function registerAuthFailureHook() {
  if (typeof window === 'undefined') return
  if (window.gm_authFailure) return
  window.gm_authFailure = () => {
    authFailed = true
    // Not console.error: this is an expected, handled state on any host whose
    // referrer is not on the key's allow list, and a red line in the console
    // for a handled case trains people to ignore the console.
    console.warn(
      '[maps] Google refused this API key for this referrer; every map is showing its designed fallback.',
    )
    for (const listener of authListeners) listener()
  }
}

export function getGoogleMapsLoader(): LoaderHandle | null {
  if (cached) return cached
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) return null
  registerAuthFailureHook()
  setOptions({ key: apiKey, v: 'weekly', libraries: ['maps', 'marker', 'geocoding'] })
  cached = { importLibrary }
  return cached
}
