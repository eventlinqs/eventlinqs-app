// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * WHEN GOOGLE REFUSES THE KEY, THE BUYER MUST NOT BE THE ONE WHO FINDS OUT
 * (close-out UX2.5).
 *
 * Found by READING the event page rather than sweeping it. Where the venue map
 * belongs, the page showed Google's own grey panel: "Sorry! Something went
 * wrong. This page didn't load Google Maps correctly. See the JavaScript
 * console for technical details." A third-party developer message, with an
 * exclamation mark, telling somebody buying a ticket to open a console.
 *
 * Every map component already had a designed fallback and it was being hidden,
 * because an authentication failure still resolves `importLibrary` and still
 * constructs a Map: the component saw a Map, called itself interactive, dropped
 * its own plate, and Google painted the panel underneath.
 *
 * The signal is Google's own documented global:
 * https://developers.google.com/maps/documentation/javascript/events#auth-errors
 * "If the following global function is defined it will be called when the
 * authentication fails. function gm_authFailure() { }" (fetched 2026-09-11).
 *
 * These tests hold the contract the four map surfaces depend on: the hook is
 * installed, it is installed ONCE, it flips the flag, and it tells every
 * subscriber. The loader is re-imported per test because it caches by design.
 */
const KEY = 'test-browser-key'

async function freshLoader() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', KEY)
  vi.doMock('@googlemaps/js-api-loader', () => ({
    setOptions: vi.fn(),
    importLibrary: vi.fn(),
  }))
  return import('@/lib/maps/google-maps-loader')
}

beforeEach(() => {
  delete window.gm_authFailure
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  delete window.gm_authFailure
})

describe('the Google Maps auth-failure hook', () => {
  test('is installed when the loader is created', async () => {
    const mod = await freshLoader()
    expect(window.gm_authFailure).toBeUndefined()
    mod.getGoogleMapsLoader()
    expect(typeof window.gm_authFailure).toBe('function')
  })

  test('reports no failure until Google actually refuses', async () => {
    const mod = await freshLoader()
    mod.getGoogleMapsLoader()
    expect(mod.googleMapsAuthFailed()).toBe(false)
  })

  test('flips the flag and tells every subscriber when Google refuses', async () => {
    const mod = await freshLoader()
    mod.getGoogleMapsLoader()
    const venue = vi.fn()
    const city = vi.fn()
    mod.onGoogleMapsAuthFailure(venue)
    mod.onGoogleMapsAuthFailure(city)

    window.gm_authFailure?.()

    expect(mod.googleMapsAuthFailed()).toBe(true)
    expect(venue).toHaveBeenCalledTimes(1)
    expect(city).toHaveBeenCalledTimes(1)
  })

  test('a surface that mounts AFTER the refusal still learns about it', async () => {
    // The four maps mount at different times; the cluster map on /events is
    // lazy. One that mounts late must not conclude the key is fine.
    const mod = await freshLoader()
    mod.getGoogleMapsLoader()
    window.gm_authFailure?.()
    expect(mod.googleMapsAuthFailed()).toBe(true)
  })

  test('unsubscribing stops the callbacks, so an unmounted map sets no state', async () => {
    const mod = await freshLoader()
    mod.getGoogleMapsLoader()
    const listener = vi.fn()
    const off = mod.onGoogleMapsAuthFailure(listener)
    off()
    window.gm_authFailure?.()
    expect(listener).not.toHaveBeenCalled()
    expect(mod.googleMapsAuthFailed()).toBe(true)
  })

  test('does not overwrite a hook something else already installed', async () => {
    const mod = await freshLoader()
    const theirs = vi.fn()
    window.gm_authFailure = theirs
    mod.getGoogleMapsLoader()
    expect(window.gm_authFailure).toBe(theirs)
  })

  test('no key means no loader and no hook, rather than a crash', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '')
    vi.doMock('@googlemaps/js-api-loader', () => ({ setOptions: vi.fn(), importLibrary: vi.fn() }))
    const mod = await import('@/lib/maps/google-maps-loader')
    expect(mod.getGoogleMapsLoader()).toBeNull()
    expect(window.gm_authFailure).toBeUndefined()
  })
})
