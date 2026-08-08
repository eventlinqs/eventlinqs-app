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

export function getGoogleMapsLoader(): LoaderHandle | null {
  if (cached) return cached
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) return null
  setOptions({ key: apiKey, v: 'weekly', libraries: ['maps', 'marker', 'geocoding'] })
  cached = { importLibrary }
  return cached
}
