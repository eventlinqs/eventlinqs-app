import { describe, expect, it } from 'vitest'
import { notAlreadyListed, oneCardPerEvent } from '@/lib/events/one-card-per-event'

/*
 * ONE CARD PER EVENT PER PAGE (Lawal's ruling of 31 October 2026, 00:14; the photo system's P5): an event never appears
 * twice on one page, whatever sections it qualifies for; the first section that shows it keeps it. Each later section
 * fills its places from the events not yet shown, so it is never left short by an event it lost (no-display-time-
 * exclusion's rule 4 in spirit: the superset is read, then the page is sliced).
 */

const ev = (id: string) => ({ id })
const ids = (rows: { id: string }[][]) => rows.map((r) => r.map((e) => e.id))

describe('one card per event per page', () => {
  it('the first section that shows an event keeps it', () => {
    const tonight = [ev('a'), ev('b')]
    const weekend = [ev('b'), ev('c')]
    const popular = [ev('a'), ev('c'), ev('d')]
    expect(ids(oneCardPerEvent([{ events: tonight, cap: 12 }, { events: weekend, cap: 12 }, { events: popular, cap: 12 }]))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
    ])
  })

  it('a later section fills its places from the events not yet shown', () => {
    const first = [ev('a'), ev('b')]
    const second = [ev('a'), ev('b'), ev('c'), ev('d'), ev('e')]
    expect(ids(oneCardPerEvent([{ events: first, cap: 2 }, { events: second, cap: 2 }]))).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('never loses an event the page showed nowhere else, and keeps each section in its own order', () => {
    const out = oneCardPerEvent([{ events: [ev('z'), ev('y')], cap: 12 }, { events: [ev('x'), ev('z'), ev('w')], cap: 12 }])
    expect(ids(out)).toEqual([['z', 'y'], ['x', 'w']])
    expect(new Set(out.flat().map((e) => e.id)).size).toBe(out.flat().length)
  })

  // P4: a recurring series is one event. Its first night shown is its one card on the page, and its later nights on
  // the page are named on that card, so no published night disappears from the page.
  it('shows a series once, at its first night shown, naming its later nights on that card', () => {
    const sat1 = { id: 's1', listing_series_id: 'market', start_date: '2026-10-31T22:00:00Z' }
    const sat2 = { id: 's2', listing_series_id: 'market', start_date: '2026-11-07T22:00:00Z' }
    const sat3 = { id: 's3', listing_series_id: 'market', start_date: '2026-11-14T22:00:00Z' }
    const gig = { id: 'g', listing_series_id: null, start_date: '2026-11-01T09:00:00Z' }
    const [weekend, all] = oneCardPerEvent([{ events: [sat1, gig], cap: 12 }, { events: [sat1, gig, sat2, sat3], cap: 12 }])
    expect(weekend.map((e) => e.id)).toEqual(['s1', 'g'])
    expect(weekend[0].also_on).toEqual(['2026-11-07T22:00:00Z', '2026-11-14T22:00:00Z'])
    expect(weekend[1].also_on).toBeUndefined()
    expect(all).toEqual([])
  })

  it('a section left with nothing comes back empty, so its rail does not draw', () => {
    expect(ids(oneCardPerEvent([{ events: [ev('a')], cap: 12 }, { events: [ev('a')], cap: 12 }]))).toEqual([['a'], []])
  })
})

/*
 * A RAIL ABOVE A RESULTS LIST (/events, /events/browse/<city>; WINDOW 1's 09:04 crawl of live found the same night in
 * the popular rail and in the results below it). The results list is the complete answer to the visitor's search and
 * keeps its count and its pages, so it is never thinned; the rail above it shows only what the list does not already
 * draw, a recurring series counting as one event (P4). With nothing left, the rail is not drawn. 
 */
describe('a rail never repeats an event the results list on the same page draws', () => {
  const e = (id: string, listing_series_id: string | null = null) => ({ id, listing_series_id })
  it('drops from the rail every event, and every night of a series, that the list already draws', () => {
    const rail = [e('a'), e('b'), e('c', 's1'), e('d', 's2')]
    const listed = [e('b'), e('x', 's1')]
    expect(notAlreadyListed(rail, listed).map((r) => r.id)).toEqual(['a', 'd'])
  })
  it("leaves the rail nothing of its own when the list already draws all of it (it then draws as the 26 August 2026 ruling says)", () => {
    expect(notAlreadyListed([e('a')], [e('a')])).toEqual([])
  })
})

/*
 * ONE LISTING, ONE CARD, HOWEVER IT WAS IMPORTED (the CONTROLLER's 20:58 of 31 October 2026, seen on live: 'The
 * Melbourne Book Market' twice in 'What's happening near you'). The import made a Saturday series and a Sunday series for
 * the same market (production: d04bee2c and dc8f08e4, 16 nights), and six listings were split so (Colours of Asia into
 * six). A card stands for the listing: the same title at the same venue is one card, whatever its series ids, and a
 * series stays one card even when its nights' titles differ.
 */
describe('the same title at the same venue is one card, across split series', () => {
  const night = (id: string, series: string | null, start: string, title = 'The Melbourne Book Market', venue_name = 'Queen Victoria Market') => ({
    id,
    listing_series_id: series,
    start_date: start,
    title,
    venue_name,
  })
  it('a Saturday series and a Sunday series of one market draw one card naming the other nights', () => {
    const sun = night('sun1', 'sunday', '2026-10-31T22:00:00Z')
    const sat = night('sat1', 'saturday', '2026-11-06T22:00:00Z')
    const sun2 = night('sun2', 'sunday', '2026-11-07T22:00:00Z')
    const [rail] = oneCardPerEvent([{ events: [sun, sat, sun2], cap: 10 }])
    expect(rail.map((e) => e.id)).toEqual(['sun1'])
    expect(rail[0].also_on).toEqual(['2026-11-06T22:00:00Z', '2026-11-07T22:00:00Z'])
  })
  it('one-off nights of one listing with no series are one card too (Colours of Asia, six series of one night each)', () => {
    const [rail] = oneCardPerEvent([{ events: [night('a', null, '2026-11-01T09:00:00Z', 'Colours of Asia', 'Asia Oasis'), night('b', null, '2026-11-02T09:00:00Z', 'Colours of Asia', 'Asia Oasis')], cap: 10 }])
    expect(rail.map((e) => e.id)).toEqual(['a'])
  })
  it('a series stays one card when its nights carry different titles', () => {
    const [rail] = oneCardPerEvent([{ events: [night('h', 's', '2026-10-31T09:00:00Z', 'Trivia: Halloween'), night('t', 's', '2026-11-07T09:00:00Z', 'Trivia')], cap: 10 }])
    expect(rail.map((e) => e.id)).toEqual(['h'])
  })
  it('the same title at another venue is another listing', () => {
    const [rail] = oneCardPerEvent([{ events: [night('m', null, '2026-11-01T09:00:00Z', 'Macbeth', 'Geelong Arts Centre'), night('n', null, '2026-11-02T09:00:00Z', 'Macbeth', 'Ballarat Civic Hall')], cap: 10 }])
    expect(rail.map((e) => e.id)).toEqual(['m', 'n'])
  })
  it('a rail above a list leaves out every night of a listing the list draws, across its series', () => {
    expect(notAlreadyListed([night('sat1', 'saturday', '2026-11-06T22:00:00Z')], [night('sun1', 'sunday', '2026-10-31T22:00:00Z')])).toEqual([])
  })
})
