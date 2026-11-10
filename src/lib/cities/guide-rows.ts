import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/**
 * THE ROWS A CITY GUIDE CAN SHOW, AND ONLY THEM (WINDOW 5A, 10 November 2026; Lawal's law of 13:30, one second; the PM's
 * ruling of 15:05 (1)).
 *
 * Every guide was handed every upcoming night in Australia and filtered them in the browser: the Geelong guide's payload
 * carried 832 rows, 325 of them Geelong's, and 676,411 of its 850,015 bytes were that payload (measured on www, 10
 * November). On a city guide the state chip OPENS the state page (the CONTROLLER's 14:10 of 3 November 2026), so another
 * city's night can appear there only through the distance widening, and the widest distance is 50 km. So the server now
 * sends a city guide its own city's nights and the nights within that widest distance, and the state page its state's
 * nights: exactly the rows the guide's own filter (`here` in city-guide.tsx) can ever reach, so nothing a visitor finds
 * today becomes unfindable (law 16), and nothing loads later. The PM's ruling named a cached route for the rest; this
 * sends the same reachable set with no fetch and no loading moment, so the guide behaves exactly as before (the choice
 * is engineering, inside the laws: the PM's 15:05 (3)).
 *
 * One source for the guide's place rules, read by the server (city-guide-screen.tsx) and the browser (city-guide.tsx).
 */

/** The distances the guide offers, in km; 0 is the city alone. */
export const GUIDE_RADII = [0, 25, 50] as const
export type GuideRadius = (typeof GUIDE_RADII)[number]

/** The great circle distance in km. */
export function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(bLat - aLat)
  const dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export type GuidePlace = { readonly name: string; readonly lat: number; readonly lng: number }

/** A night of the city itself: its city key names the city. */
export function inGuideCity(r: Pick<DirectoryRow, 'cityKey'>, place: GuidePlace): boolean {
  return r.cityKey.includes(place.name.toLowerCase())
}

/** A night inside the widening, where its venue's point is held. */
export function withinGuideRadius(r: Pick<DirectoryRow, 'lat' | 'lng'>, place: GuidePlace, radius: number): boolean {
  return radius > 0 && r.lat !== null && r.lng !== null && km(place.lat, place.lng, r.lat, r.lng) <= radius
}

/** A night of one of the state's listed cities (the state page). */
export function inGuideState(r: Pick<DirectoryRow, 'cityKey'>, stateCityNames: readonly string[]): boolean {
  return stateCityNames.some((n) => r.cityKey.includes(n))
}

/**
 * Every row the guide's own filter can reach on this page, in the order given: on the state page the state's nights; on
 * a city guide the city's nights and those within the widest distance offered.
 */
export function rowsAGuideCanShow<R extends Pick<DirectoryRow, 'cityKey' | 'lat' | 'lng'>>(
  rows: readonly R[],
  place: GuidePlace,
  scope: 'city' | 'state',
  stateCityNames: readonly string[],
): R[] {
  if (scope === 'state') return rows.filter((r) => inGuideState(r, stateCityNames))
  const widest = Math.max(...GUIDE_RADII)
  return rows.filter((r) => inGuideCity(r, place) || withinGuideRadius(r, place, widest))
}
