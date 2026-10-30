import { describe, expect, it } from 'vitest'
import { oneCardPerEvent } from '@/lib/events/one-card-per-event'

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
