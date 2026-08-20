// THE DATE PRESETS, and the price filter's pagination decision.
//
// Exclusion audit items 1, 3 and 10, all three of which had SURVIVING copies
// after the pass that claimed to close them.
//
// Item 1: a window that includes today must START AT THE START OF TODAY. Starting
// it at `now` hides an event that began this morning and is on right now. That
// was fixed for the `today` preset on 16 August 2026 and left in `7d` and
// `month`, where it did exactly the same thing under a different name.
//
// Item 3: every boundary is computed in the PLATFORM zone. `setHours` is the
// SERVER zone, which on Vercel is UTC, so an Australian Saturday evening could
// fall outside the window called Weekend. Fixed for `today` alone and left in
// `tomorrow` and `weekend`.
//
// Item 10: a post-query filter is only safe when the query fetched the whole
// bounded set rather than one database page. `paginatesInMemory` is that single
// decision.

import { describe, it, expect } from 'vitest'

import { paginatesInMemory, presetWindow, slicePage } from '@/lib/events/fetchers'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { startOfLocalDayUtc } from '@/lib/events/listing-window'

// The platform zone is Australia/Melbourne. On 12 August 2026 that is AEST
// (UTC+10) and local midnight is 14:00Z the previous day.
const MIDWEEK_MORNING = new Date('2026-08-12T00:30:00Z') // 10:30 Wednesday, Melbourne
const startOfToday = (at: Date) => startOfLocalDayUtc(at, PLATFORM_TIME_ZONE).toISOString()

describe('preset windows start at the start of today, never at now', () => {
  it('today runs the whole local day, so this morning is still on', () => {
    const w = presetWindow('today', MIDWEEK_MORNING)!
    expect(w.from).toBe(startOfToday(MIDWEEK_MORNING))
    expect(w.from < MIDWEEK_MORNING.toISOString()).toBe(true)
  })

  it('7d starts at the start of today, not at now', () => {
    // THE DEFECT: `from: nowIso`. A 09:00 gig was outside "next 7 days" at 09:01.
    const w = presetWindow('7d', MIDWEEK_MORNING)!
    expect(w.from).toBe(startOfToday(MIDWEEK_MORNING))
    expect(w.from).not.toBe(MIDWEEK_MORNING.toISOString())
  })

  it('month starts at the start of today, not at now', () => {
    const w = presetWindow('month', MIDWEEK_MORNING)!
    expect(w.from).toBe(startOfToday(MIDWEEK_MORNING))
  })

  it('7d reaches to the end of the seventh day rather than to this time next week', () => {
    const w = presetWindow('7d', MIDWEEK_MORNING)!
    // End of 19 August in Melbourne is 20 Aug 00:00 AEST, one millisecond before.
    expect(w.to).toBe('2026-08-19T13:59:59.999Z')
  })
})

describe('preset windows are bounded in the platform zone, never the server zone', () => {
  it('tomorrow is the next LOCAL day', () => {
    const w = presetWindow('tomorrow', MIDWEEK_MORNING)!
    // 13 August 2026 in Melbourne: 12 Aug 14:00Z to 13 Aug 13:59:59.999Z.
    expect(w.from).toBe('2026-08-12T14:00:00.000Z')
    expect(w.to).toBe('2026-08-13T13:59:59.999Z')
  })

  it('weekend is the upcoming local Saturday and Sunday', () => {
    // Wednesday 12 August 2026 -> Saturday the 15th and Sunday the 16th.
    const w = presetWindow('weekend', MIDWEEK_MORNING)!
    expect(w.from).toBe('2026-08-14T14:00:00.000Z') // Sat 15 Aug 00:00 AEST
    expect(w.to).toBe('2026-08-16T13:59:59.999Z') // Sun 16 Aug 23:59:59.999 AEST
  })

  it('on a Sunday the weekend already under way is the one meant', () => {
    // Sunday 16 August 2026, 10:00 Melbourne.
    const sunday = new Date('2026-08-16T00:00:00Z')
    const w = presetWindow('weekend', sunday)!
    expect(w.from).toBe('2026-08-14T14:00:00.000Z') // still Saturday the 15th
    expect(w.to).toBe('2026-08-16T13:59:59.999Z')
  })

  it('on a Saturday evening the weekend has NOT already rolled to next week', () => {
    // 22:00 Saturday 15 August in Melbourne is 12:00Z, and in UTC it is still
    // Saturday, so this case passed before the fix. The one that did not:
    // 10:00 Sunday Melbourne is 00:00Z Sunday. Both are pinned, above and here.
    const saturdayNight = new Date('2026-08-15T12:00:00Z')
    const w = presetWindow('weekend', saturdayNight)!
    expect(w.from).toBe('2026-08-14T14:00:00.000Z')
  })

  it('returns nothing for the presets that are not date windows', () => {
    expect(presetWindow(undefined, MIDWEEK_MORNING)).toBeNull()
    expect(presetWindow('all', MIDWEEK_MORNING)).toBeNull()
    expect(presetWindow('free', MIDWEEK_MORNING)).toBeNull()
  })
})

describe('a price filter paginates in memory, or it drops rows', () => {
  it('is true for a price filter on the DEFAULT sort, which is the defect case', () => {
    // This is the whole finding. With the default sort the query used to fetch
    // one page of 24, filter it, and report the survivors as the total.
    expect(paginatesInMemory({ price_max: 50 })).toBe(true)
    expect(paginatesInMemory({ price_min: 10 })).toBe(true)
    expect(paginatesInMemory({ sort: 'date_asc', price_max: 50 })).toBe(true)
  })

  it('is true for the sorts that were already handled', () => {
    expect(paginatesInMemory({ sort: 'price_asc' })).toBe(true)
    expect(paginatesInMemory({ sort: 'popularity' })).toBe(true)
  })

  it('is false for an ordinary browse, which the database can paginate', () => {
    expect(paginatesInMemory({})).toBe(false)
    expect(paginatesInMemory({ sort: 'date_asc' })).toBe(false)
    expect(paginatesInMemory({ sort: 'relevance' })).toBe(false)
  })

  it('does not mistake a missing price filter for a zero one', () => {
    expect(paginatesInMemory({ price_min: undefined, price_max: undefined })).toBe(false)
    // Zero IS a filter: "free only" is a real question.
    expect(paginatesInMemory({ price_max: 0 })).toBe(true)
  })

  it('slices the requested page out of the whole matched set', () => {
    const rows = Array.from({ length: 60 }, (_, i) => i)
    expect(slicePage(rows, 1, 24)).toEqual(rows.slice(0, 24))
    expect(slicePage(rows, 2, 24)).toEqual(rows.slice(24, 48))
    expect(slicePage(rows, 3, 24)).toEqual(rows.slice(48, 60))
    // Page 3 is short and page 4 is empty; both are the honest answer, and both
    // are only reachable because the total counts the WHOLE matched set.
    expect(slicePage(rows, 4, 24)).toEqual([])
  })
})
