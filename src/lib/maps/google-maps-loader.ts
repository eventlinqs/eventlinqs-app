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

let cached: LoaderHandle | null = null

export function getGoogleMapsLoader(): LoaderHandle | null {
  if (cached) return cached
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) return null
  setOptions({ key: apiKey, v: 'weekly', libraries: ['maps', 'marker'] })
  cached = { importLibrary }
  return cached
}
