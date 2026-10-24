import { describe, expect, it } from 'vitest'
import {
  FREE_TICKET_NEEDED,
  FREE_WEEK_DAYS,
  describeFreeWeek,
  freeEntryLabel,
  freeWeekPath,
  freeWeekWindow,
  groupFreeWeekByDay,
} from '@/lib/listings/free-week'
import { FREE_ENTRY_NO_TICKET_NEEDED } from '@/lib/events/entry-mode'

/**
 * WI2 Part 2, the city guide's week (docs/walk-in/WI2-PLAN.md section 8a): the
 * path, the week in the CITY's own zone, the two free labels the founder ruled
 * (answer 3 of 21 October 2026), and the days in order with today first.
 */

const MELBOURNE = 'Australia/Melbourne'
// Saturday 24 October 2026, 11:00 in Melbourne (AEDT, UTC+11).
const NOW = new Date('2026-10-24T00:00:00Z')

describe('the path and the labels', () => {
  it('one page per guide city', () => {
    expect(freeWeekPath('geelong')).toBe('/free/geelong/this-week')
  })

  it('a walk-in event says no ticket is needed, every other free event says a ticket is', () => {
    expect(freeEntryLabel('walk_in')).toBe(FREE_ENTRY_NO_TICKET_NEEDED)
    expect(freeEntryLabel('walk_in')).toBe('Free entry, no ticket needed')
    expect(freeEntryLabel('tickets')).toBe(FREE_TICKET_NEEDED)
    expect(freeEntryLabel(null)).toBe('Free, ticket needed')
  })
})

describe('the week, in the city own zone', () => {
  it('runs from the start of today to the last instant of the sixth day after', () => {
    const { from, to } = freeWeekWindow(NOW, MELBOURNE)
    expect(FREE_WEEK_DAYS).toBe(7)
    expect(from.toISOString()).toBe('2026-10-23T13:00:00.000Z') // 00:00 Saturday 24 October, Melbourne
    expect(to.toISOString()).toBe('2026-10-30T12:59:59.999Z') // 23:59:59.999 Friday 30 October, Melbourne
  })

  it('is the city own week, not the server and not Sydney: Perth opens three hours later', () => {
    const { from } = freeWeekWindow(NOW, 'Australia/Perth')
    expect(from.toISOString()).toBe('2026-10-23T16:00:00.000Z') // 00:00 Saturday 24 October, Perth (UTC+8)
  })

  it('reads as a span of days, with the month once, or twice across a month', () => {
    const { from, to } = freeWeekWindow(NOW, MELBOURNE)
    expect(describeFreeWeek(from, to, MELBOURNE)).toBe('Saturday 24 to Friday 30 October')
    const late = freeWeekWindow(new Date('2026-10-28T00:00:00Z'), MELBOURNE)
    expect(describeFreeWeek(late.from, late.to, MELBOURNE)).toBe('Wednesday 28 October to Tuesday 3 November')
  })
})

describe('the days', () => {
  const at = (iso: string, id: string) => ({ id, start_date: iso, timezone: MELBOURNE })

  it('in order, today and tomorrow named, each event under the day it happens', () => {
    const days = groupFreeWeekByDay(
      [
        at('2026-10-26T08:00:00Z', 'monday'), // 19:00 Monday 26 October
        at('2026-10-24T08:00:00Z', 'today'), // 19:00 Saturday 24 October
        at('2026-10-24T23:30:00Z', 'tomorrow'), // 10:30 Sunday 25 October
      ],
      MELBOURNE,
      NOW,
    )
    expect(days.map((d) => d.key)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(days.map((d) => d.heading)).toEqual([
      'Today, Saturday 24 October',
      'Tomorrow, Sunday 25 October',
      'Monday 26 October',
    ])
    expect(days.map((d) => d.events.map((e) => e.id))).toEqual([['today'], ['tomorrow'], ['monday']])
  })

  it('an event already running since before today sits under today, never a day the page has passed', () => {
    const days = groupFreeWeekByDay([at('2026-10-22T23:00:00Z', 'festival')], MELBOURNE, NOW) // began Friday 23 October
    expect(days).toHaveLength(1)
    expect(days[0].key).toBe('2026-10-24')
    expect(days[0].heading).toBe('Today, Saturday 24 October')
  })

  it('an event at 23:30 local is under its own day, not the UTC one', () => {
    // 23:30 Saturday in Melbourne is 12:30 UTC the same day; 00:30 Sunday local is 13:30 UTC Saturday.
    const days = groupFreeWeekByDay([at('2026-10-24T13:30:00Z', 'after-midnight')], MELBOURNE, NOW)
    expect(days[0].key).toBe('2026-10-25')
  })
})
