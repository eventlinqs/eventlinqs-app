/**
 * THE MAPS JS STAND-IN MUST HAND CONTROL BACK THE WAY GOOGLE'S SCRIPT DOES.
 *
 * @googlemaps/js-api-loader v2 bootstraps by appending a script whose URL
 * carries `callback=google.maps.__ib__` and by storing the bootstrap promise's
 * resolve at google.maps.__ib__ (node_modules/@googlemaps/js-api-loader/dist/
 * index.js). Google's script resolves that dotted path and calls it. The first
 * cut of the stand-in looked the callback up as window[cb], which for a dotted
 * name is undefined, so the bootstrap promise never resolved, importLibrary
 * never returned, and the finder sat on "Searching venues." for the whole
 * desktop drive of 4 September 2026 (0 options, no sentence). This pins the
 * handshake so the stand-in cannot silently stop standing in.
 */
import { describe, it, expect } from 'vitest'
import { runInNewContext } from 'node:vm'
import { MAPS_JS_STUB } from '../../../scripts/journeys/stubs/maps-js-stub.mjs'

function boot(callbackName: string) {
  let calls = 0
  const window: Record<string, unknown> = {}
  const google = { maps: { __ib__: () => { calls += 1 } } }
  window.google = google
  const sandbox = {
    window,
    document: { currentScript: { src: `https://maps.googleapis.com/maps/api/js?key=k&v=weekly&callback=${encodeURIComponent(callbackName)}` } },
    URL,
    Object,
  }
  runInNewContext(MAPS_JS_STUB, sandbox)
  return { calls, google: window.google as { maps: Record<string, unknown> } }
}

/** The slice of the Places library the finder uses, as the stand-in shapes it. */
type StubPlace = {
  displayName: string
  location: { lat(): number; lng(): number }
  fetchFields(opts: { fields: string[] }): Promise<unknown>
}
type StubPlaces = {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(req: { input: string }): Promise<{ suggestions: Array<{ placePrediction: { toPlace(): StubPlace } }> }>
  }
}

describe('the Maps JS stand-in', () => {
  it("calls the loader's dotted callback, google.maps.__ib__, once the stand-in is installed", () => {
    const { calls, google } = boot('google.maps.__ib__')
    expect(calls).toBe(1)
    expect(typeof google.maps.importLibrary).toBe('function')
    expect(google.maps.__stub).toBe('STUBBED PLACES')
  })

  it('answers "Forum Melb" with the real Forum Melbourne answer Google gave from the allowed origin', async () => {
    const { google } = boot('google.maps.__ib__')
    const importLibrary = google.maps.importLibrary as (name: string) => Promise<StubPlaces>
    const places = await importLibrary('places')
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'Forum Melb' })
    expect(suggestions).toHaveLength(1)
    const place = suggestions[0].placePrediction.toPlace()
    await place.fetchFields({ fields: ['location'] })
    expect(place.displayName).toBe('Forum Melbourne')
    expect(place.location.lat()).toBeCloseTo(-37.8166268, 6)
    expect(place.location.lng()).toBeCloseTo(144.9695761, 6)
  })

  it('does nothing harmful when no callback is named', () => {
    const { calls } = boot('')
    expect(calls).toBe(0)
  })
})
