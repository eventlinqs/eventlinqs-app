import { describe, expect, it } from 'vitest'
import {
  nextOccurrences,
  nthWeekdayOfMonth,
  occurrenceOn,
  seriesProblem,
  weekdayOf,
  type Series,
} from '@/lib/listings/occurrences'

/**
 * WI2 Part 1: a host's regular night stored once and worked out into dates
 * (docs/walk-in/WI2-PLAN.md section 7). Every expected date and instant below
 * was checked against the platform's own Date and Intl, outside this module,
 * before it was written here.
 */

const MELB = 'Australia/Melbourne'
const BEFORE = new Date('2026-09-01T00:00:00Z')
const weekly = (over: Partial<Series> = {}): Series => ({
  rule: 'weekly',
  anchorDate: '2026-10-01',
  startsAt: '19:00',
  endsAt: '22:00',
  timezone: MELB,
  ...over,
})
const dates = (s: Series, from = BEFORE, count = 8) => nextOccurrences(s, from, count).map((o) => o.date)

describe('every rule', () => {
  it('weekly: the anchor, then every seven days', () => {
    expect(dates(weekly(), BEFORE, 4)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'])
  })

  it('fortnightly: every fourteen days', () => {
    expect(dates(weekly({ rule: 'fortnightly' }), BEFORE, 3)).toEqual(['2026-10-01', '2026-10-15', '2026-10-29'])
  })

  it('once: one night, and nothing once it has passed', () => {
    expect(dates(weekly({ rule: 'once' }))).toEqual(['2026-10-01'])
    expect(dates(weekly({ rule: 'once' }), new Date('2026-10-02T00:00:00Z'))).toEqual([])
  })

  it('monthly, the 1st and the 3rd of a weekday', () => {
    expect(dates(weekly({ rule: 'monthly-1', anchorDate: '2026-10-06' }), BEFORE, 3)).toEqual(['2026-10-06', '2026-11-03', '2026-12-01'])
    expect(dates(weekly({ rule: 'monthly-3', anchorDate: '2026-10-20' }), BEFORE, 3)).toEqual(['2026-10-20', '2026-11-17', '2026-12-15'])
  })

  it('monthly, the last of a weekday', () => {
    expect(dates(weekly({ rule: 'monthly-last', anchorDate: '2026-10-30' }), BEFORE, 3)).toEqual(['2026-10-30', '2026-11-27', '2026-12-25'])
  })

  it('eight dates by default, the count the daily run keeps', () => {
    expect(nextOccurrences(weekly(), BEFORE)).toHaveLength(8)
  })
})

describe('from a given moment', () => {
  it('starts at the next night, not the anchor', () => {
    expect(dates(weekly(), new Date('2026-10-09T00:00:00Z'), 2)).toEqual(['2026-10-15', '2026-10-22'])
  })

  it('a night that has already started tonight is not a next night', () => {
    // 1 October, 19:00 in Melbourne is 09:00 UTC.
    expect(dates(weekly(), new Date('2026-10-01T09:30:00Z'), 1)).toEqual(['2026-10-08'])
  })
})

describe('skipped dates', () => {
  it('a skipped date is left out and the next one fills its place', () => {
    expect(dates(weekly({ skipDates: ['2026-10-08'] }), BEFORE, 3)).toEqual(['2026-10-01', '2026-10-15', '2026-10-22'])
  })
})

describe('the wall clock holds across Daylight Saving, the instant moves', () => {
  it('as summer time starts (first Sunday of October)', () => {
    const [a, b] = nextOccurrences(weekly(), BEFORE, 2)
    expect(a.startIso).toBe('2026-10-01T09:00:00.000Z') // 19:00 at UTC+10
    expect(b.startIso).toBe('2026-10-08T08:00:00.000Z') // 19:00 at UTC+11
  })

  it('as summer time ends (first Sunday of April)', () => {
    const [a, b] = nextOccurrences(weekly({ anchorDate: '2027-04-01' }), new Date('2027-03-01T00:00:00Z'), 2)
    expect(a.startIso).toBe('2027-04-01T08:00:00.000Z') // 19:00 at UTC+11
    expect(b.startIso).toBe('2027-04-08T09:00:00.000Z') // 19:00 at UTC+10
  })

  it('a zone without summer time does not move', () => {
    const [a, b] = nextOccurrences(weekly({ timezone: 'Australia/Brisbane' }), BEFORE, 2)
    expect(a.startIso).toBe('2026-10-01T09:00:00.000Z')
    expect(b.startIso).toBe('2026-10-08T09:00:00.000Z')
  })
})

describe('the finish', () => {
  it('a night past midnight finishes on the next date', () => {
    const o = occurrenceOn(weekly({ startsAt: '22:00', endsAt: '02:00' }), '2026-10-08')
    expect(o.endIso).toBe('2026-10-08T15:00:00.000Z') // 02:00 on the 9th at UTC+11
    expect(Date.parse(o.endIso!)).toBeGreaterThan(Date.parse(o.startIso))
  })

  it('no finish given: no finish instant, never an invented one', () => {
    expect(occurrenceOn(weekly({ endsAt: null }), '2026-10-08').endIso).toBeNull()
  })
})

describe('a series that cannot produce dates is refused, never shortened', () => {
  it('names the fault', () => {
    expect(seriesProblem(weekly({ startsAt: '7pm' }))).toMatch(/start 7pm/)
    expect(seriesProblem(weekly({ anchorDate: '1 Oct' }))).toMatch(/first date/)
    expect(seriesProblem(weekly({ timezone: 'Mars/Olympus' }))).toMatch(/zone/)
    expect(seriesProblem(weekly({ rule: 'monthly-1', anchorDate: '2026-10-13' }))).toMatch(/not the 1 of its weekday/)
    expect(seriesProblem(weekly({ rule: 'monthly-last', anchorDate: '2026-10-23' }))).toMatch(/not the last/)
    expect(seriesProblem(weekly())).toBeNull()
  })

  it('throws rather than returning an empty list that would read as nothing on', () => {
    expect(() => nextOccurrences(weekly({ startsAt: '7pm' }), BEFORE)).toThrow(/cannot produce dates/)
  })
})

describe('the calendar helpers', () => {
  it('weekdays of a date, and the nth weekday of a month', () => {
    expect(weekdayOf('2026-10-01')).toBe(4) // Thursday
    expect(nthWeekdayOfMonth(2026, 9, 2, 1)).toBe('2026-10-06') // first Tuesday of October
    expect(nthWeekdayOfMonth(2026, 9, 5, 'last')).toBe('2026-10-30') // last Friday of October
  })
})
