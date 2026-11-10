/**
 * A GUIDE IS SENT ONLY THE ROWS ITS OWN FILTER CAN REACH, AND EVERY ONE OF THEM (WINDOW 5A, 10 November 2026; the PM's
 * ruling of 15:05 (1): 'Nothing a visitor can find today becomes unfindable (law 16): prove it with a test that every
 * event reachable today is still reachable').
 *
 * The guide's filter (`here` in src/components/features/city-guide/city-guide.tsx) keeps, on a city guide, a city's own
 * nights plus those within the chosen distance, and on the state page the state's nights. These cases run that filter at
 * every distance the guide offers over ALL rows (what the page did before) and over rowsAGuideCanShow's rows (what it is
 * sent now), and require the two to be the same nights, in the same order.
 */
import { describe, expect, it } from 'vitest'
import {
  GUIDE_RADII,
  inGuideCity,
  inGuideState,
  km,
  rowsAGuideCanShow,
  withinGuideRadius,
  type GuidePlace,
} from '@/lib/cities/guide-rows'

type Row = { id: string; cityKey: string; lat: number | null; lng: number | null }
const row = (id: string, cityKey: string, lat: number | null, lng: number | null): Row => ({ id, cityKey, lat, lng })

const GEELONG: GuidePlace = { name: 'Geelong', lat: -38.1499, lng: 144.3617 }
const MELBOURNE: GuidePlace = { name: 'Melbourne', lat: -37.8136, lng: 144.9631 }
const BALLARAT: GuidePlace = { name: 'Ballarat', lat: -37.5622, lng: 143.8503 }
const STATE = ['melbourne', 'geelong', 'ballarat', 'bendigo', 'torquay']

const ROWS: Row[] = [
  row('g1', 'geelong', -38.1471, 144.3607),
  row('g2', 'geelong west', -38.1394, 144.3466), // the city named inside a longer key
  row('g3', 'geelong', null, null), // a Geelong night with no venue point
  row('t1', 'torquay', -38.3306, 144.3265), // about 20 km from Geelong
  row('a1', 'aireys inlet', -38.4604, 144.1031), // about 41 km from Geelong, outside the state's listed cities
  row('m1', 'melbourne', -37.8183, 144.9671), // about 64 km from Geelong
  row('m2', 'south melbourne', -37.8323, 144.9590),
  row('w1', 'werribee', -37.9002, 144.6618), // about 37 km from Geelong, 26 km from Melbourne
  row('b1', 'ballarat', -37.5602, 143.8590),
  row('d1', 'bendigo', -36.7570, 144.2794),
  row('c1', 'canberra', -35.2809, 149.1300), // another state
  row('x1', 'melbourne', null, null),
]

/** The guide's own filter, as city-guide.tsx runs it, at one distance. */
function reachable(rows: readonly Row[], place: GuidePlace, scope: 'city' | 'state', radius: number): string[] {
  return rows
    .filter((r) => (scope === 'state' ? inGuideState(r, STATE) : inGuideCity(r, place) || withinGuideRadius(r, place, radius)))
    .map((r) => r.id)
}

describe('rowsAGuideCanShow keeps every night the guide can reach', () => {
  for (const place of [GEELONG, MELBOURNE, BALLARAT]) {
    for (const radius of GUIDE_RADII) {
      it(`${place.name} at ${radius} km reaches the same nights as before`, () => {
        const sent = rowsAGuideCanShow(ROWS, place, 'city', STATE)
        expect(reachable(sent, place, 'city', radius)).toEqual(reachable(ROWS, place, 'city', radius))
      })
    }
  }

  it('the state page reaches the same nights as before', () => {
    const sent = rowsAGuideCanShow(ROWS, MELBOURNE, 'state', STATE)
    expect(reachable(sent, MELBOURNE, 'state', 0)).toEqual(reachable(ROWS, MELBOURNE, 'state', 0))
  })

  it('and sends fewer rows: Geelong gets its own, Torquay, Aireys Inlet and Werribee, never Melbourne, Ballarat, Bendigo or Canberra', () => {
    const sent = rowsAGuideCanShow(ROWS, GEELONG, 'city', STATE).map((r) => r.id)
    expect(sent).toEqual(['g1', 'g2', 'g3', 't1', 'a1', 'w1'])
  })

  it('the distances are the guide own and the widest bounds what is sent', () => {
    expect(GUIDE_RADII).toEqual([0, 25, 50])
    expect(km(GEELONG.lat, GEELONG.lng, MELBOURNE.lat, MELBOURNE.lng)).toBeGreaterThan(50)
    expect(km(GEELONG.lat, GEELONG.lng, -38.3306, 144.3265)).toBeLessThan(25)
  })

  it('the client guide reads its rules from this module, not a copy', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const guide = readFileSync(join(process.cwd(), 'src', 'components', 'features', 'city-guide', 'city-guide.tsx'), 'utf8')
    expect(guide).toContain("from '@/lib/cities/guide-rows'")
    expect(guide).not.toMatch(/function km\(/)
    const screen = readFileSync(join(process.cwd(), 'src', 'components', 'features', 'city-guide', 'city-guide-screen.tsx'), 'utf8')
    expect(screen).toMatch(/rows=\{rowsAGuideCanShow\(data\.rows,/)
  })
})
