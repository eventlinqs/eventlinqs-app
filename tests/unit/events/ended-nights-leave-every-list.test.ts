import { describe, expect, it, vi } from 'vitest'

/*
 * NO PUBLIC LIST SHOWS A NIGHT AFTER ITS END, EVEN FROM A CACHED RENDER (the CONTROLLER's 11:55 of 4 November 2026; the
 * health sentinel at 11:40 on 3 and 4 November read ended library sessions on /city/geelong and /city/bendigo, from edge
 * cached renders 'Age: 717, X-Vercel-Cache: STALE'). Half 1: a rendered list carries a night only while it has
 * LIST_END_LEAD_MS to run. Half 2: the five minute cron purges, before each end, every page listing a night whose end
 * falls inside that lead.
 */
const marked: string[] = []
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => { marked.push(p) },
  revalidateTag: () => {},
  updateTag: () => {},
}))
vi.mock('server-only', () => ({}))

import { LIST_END_LEAD_MS, isStillListed, listingWindowOrPredicate } from '@/lib/events/listing-window'
import { endingWithinLead } from '@/lib/events/ending-purge'
import { revalidateEventSurfacesFromRouteHandler } from '@/lib/events/revalidate-event'

const NOW = new Date('2026-11-04T00:40:00Z') // 11:40 in Melbourne, the sentinel's read
const MIN = 60 * 1000
const night = (endOffsetMin: number | null, startOffsetMin = -60) => ({
  id: `n${endOffsetMin}`,
  start_date: new Date(NOW.getTime() + startOffsetMin * MIN).toISOString(),
  end_date: endOffsetMin === null ? null : new Date(NOW.getTime() + endOffsetMin * MIN).toISOString(),
  timezone: 'Australia/Melbourne',
})

describe('half 1: a public list drops a night before its end; the true end still judges the sentinel', () => {
  it('a session that ended 10 minutes ago is in no list', () => {
    expect(isStillListed(night(-10), NOW)).toBe(false)
  })
  it('a session ending in 3 minutes has left the lists, but is not yet ended by the true rule', () => {
    expect(isStillListed(night(3), NOW)).toBe(false)
    expect(isStillListed(night(3), NOW, 0)).toBe(true)
  })
  it('a session with an hour to run is listed', () => {
    expect(isStillListed(night(60), NOW)).toBe(true)
  })
  it('the SQL every list reads judges the same instant, the lead ahead', () => {
    expect(listingWindowOrPredicate(NOW)).toContain(`end_date.gte.${new Date(NOW.getTime() + LIST_END_LEAD_MS).toISOString()}`)
  })
})

describe('half 2: the cron purges the pages of nights ending inside the lead, before they end', () => {
  it('picks the nights ending in the next lead, not those already ended or ending later', () => {
    const rows = [night(-1), night(0), night(2), night(5), night(7), night(60)]
    expect(endingWithinLead(rows, NOW).sort()).toEqual(['n0', 'n2', 'n5'].sort())
  })
  it("a night with no end time leaves at its own day's end, and is picked in the lead before it", () => {
    // 12:56 UTC is 23:56 in Melbourne: a night of that day with no end time ends at midnight, 4 minutes on.
    const late = new Date('2026-11-04T12:56:00Z')
    const row = { id: 'noend', start_date: '2026-11-04T08:00:00Z', end_date: null, timezone: 'Australia/Melbourne' }
    expect(endingWithinLead([row], late)).toEqual(['noend'])
  })
  it('every end has a five minute run inside its lead, so no cached copy outlives a night it lists', () => {
    for (let end = 0; end < 24 * 60; end += 1) {
      const runs = [...Array(24 * 12 + 2).keys()].map((k) => k * 5)
      const hit = runs.some((t) => end >= t && end < t + LIST_END_LEAD_MS / MIN)
      expect(hit, `an end at minute ${end}`).toBe(true)
    }
  })
  it("the purge reaches the city's guide, its suburb pages, its state page and the home", () => {
    marked.length = 0
    revalidateEventSurfacesFromRouteHandler({ slug: 'preschool-story-time-geelong-west-library-2026-11-04', venue_city: 'Geelong', tags: [], category_slug: null, organiser_handle: null })
    for (const p of ['/city/geelong', '/city/[slug]/[suburb]', '/state/victoria', '/', '/events']) expect(marked).toContain(p)
  })
})
