import { getAllCities } from '@/lib/cities/data'

/**
 * THE CITY A VISITOR CHOSE, AND /events FOLLOWING IT (the CONTROLLER's 08:50 (7), from the 5 November audit: a visitor
 * who chose Melbourne on the guide and pressed 'Browse Events' was shown the whole country). The choice lives in the
 * el_city cookie, the one the header's location picker writes through /api/location/set, a functional cookie named on
 * /legal/cookies; the guide's city choice now writes it too, in the same shape. /events stays an edge-cached page that
 * reads no cookie on the server: the links that open it carry the city, and a bare visit follows the city once a session
 * in the browser. 'All of Australia' says so in its address, so it is never taken for a bare visit.
 */

export const EL_CITY_COOKIE = 'el_city'
/** The browser event the header listens for when el_city changes (cookies have no change event of their own). */
export const EL_CITY_UPDATED = 'el_city_updated'
/** The whole country, said in the address, so /events never follows a chosen city for it. */
export const ALL_OF_AUSTRALIA_HREF = '/events?all=1'
/** Once a session: a visitor who clears the city on /events is never sent back to it. */
export const FOLLOWED_THIS_SESSION = 'el_events_followed_city'

/** The el_city value for a guide city: the shape /api/location/set writes. Pure. */
export function cityCookieValue(city: { name: string }): string {
  return JSON.stringify({ city: city.name, country: 'Australia', countryCode: 'AU', latitude: null, longitude: null })
}

/** The guide slug of the city an el_city value names, or null for none, a malformed value or a city we do not list. Pure. */
export function chosenCitySlug(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    // a value that is not URI encoded is read as it stands
  }
  try {
    const parsed = JSON.parse(value) as { city?: unknown }
    if (typeof parsed?.city !== 'string') return null
    const name = parsed.city.trim().toLowerCase()
    return getAllCities().find((c) => c.name.toLowerCase() === name)?.slug ?? null
  } catch {
    return null
  }
}

/** Where 'Browse Events' opens: the chosen city's events, else every event. Pure. */
export function eventsHrefFor(slug: string | null): string {
  return slug ? `/events?city=${encodeURIComponent(slug)}` : '/events'
}

/** Whether an /events visit follows the chosen city: only a bare one, with no filter, search or 'all' in its address. Pure. */
export function followsChosenCity(search: string): boolean {
  return search.replace(/^\?/, '').trim() === ''
}

/** The el_city value in this browser, or null. */
export function readChosenCityCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)el_city=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Remember a city the visitor chose on the guide: el_city for a year, as /api/location/set sets it (path /, SameSite
 * Lax), then tell the header. Best effort: a browser that refuses the cookie still gets the city it pressed.
 */
export function rememberCity(city: { name: string }): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${EL_CITY_COOKIE}=${encodeURIComponent(cityCookieValue(city))}; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`
    window.dispatchEvent(new Event(EL_CITY_UPDATED))
  } catch {
    // the choice is still followed by the link the visitor pressed
  }
}
