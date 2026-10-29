import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS, HORIZONS, daysAhead, horizonOf, horizonBounds, melbourneDayStart } from '@/lib/listings/horizon'

/*
 * The rolling 90 day horizon (the engine plan's parts A and E; the directive's section 17): 0 to 14 days publish,
 * 15 to 45 acquire, 46 to 90 relationships, counted in Melbourne calendar days, never in hours.
 */

/* 28 October 2026, 20:00 in Melbourne (AEDT, UTC+11). */
const NOW = new Date('2026-10-28T09:00:00Z')

/** Noon in Melbourne on the day n calendar days after 28 October 2026. */
function melbourneNoon(n: number): Date {
  const d = new Date(Date.UTC(2026, 9, 28 + n, 1, 0, 0))
  return d
}

describe('the horizon a night sits in', () => {
  it('is publish from today to 14 days ahead, acquire from 15 to 45, relationships from 46 to 90', () => {
    expect(horizonOf(melbourneNoon(0), NOW)).toBe('publish')
    expect(horizonOf(melbourneNoon(14), NOW)).toBe('publish')
    expect(horizonOf(melbourneNoon(15), NOW)).toBe('acquire')
    expect(horizonOf(melbourneNoon(45), NOW)).toBe('acquire')
    expect(horizonOf(melbourneNoon(46), NOW)).toBe('relationships')
    expect(horizonOf(melbourneNoon(90), NOW)).toBe('relationships')
  })

  it('is beyond after 90 days and past before today', () => {
    expect(horizonOf(melbourneNoon(91), NOW)).toBe('beyond')
    expect(horizonOf(melbourneNoon(-1), NOW)).toBe('past')
  })

  it('counts Melbourne calendar days: 23:30 tonight is today, 00:30 tomorrow is one day ahead', () => {
    expect(daysAhead(new Date('2026-10-28T12:30:00Z'), NOW)).toBe(0)
    expect(daysAhead(new Date('2026-10-28T13:30:00Z'), NOW)).toBe(1)
  })

  it('counts from the Melbourne date of now, not the UTC date, early in the morning', () => {
    /* 06:00 on 29 October in Melbourne is still 28 October in UTC. */
    const morning = new Date('2026-10-28T19:00:00Z')
    expect(daysAhead(new Date('2026-10-29T09:00:00Z'), morning)).toBe(0)
    expect(daysAhead(new Date('2026-11-12T09:00:00Z'), morning)).toBe(14)
    expect(horizonOf(new Date('2026-11-13T09:00:00Z'), morning)).toBe('acquire')
  })

  it('keeps whole days across the April change back to standard time', () => {
    /* Daylight saving ends 5 April 2027 at 03:00 (AEDT to AEST). */
    const before = new Date('2027-04-03T02:00:00Z')
    expect(daysAhead(new Date('2027-04-06T02:00:00Z'), before)).toBe(3)
  })

  it('names its bounds once, and every horizon a person sees', () => {
    expect(HORIZON_DAYS).toEqual({ publish: 14, acquire: 45, relationships: 90 })
    expect(HORIZONS).toEqual(['publish', 'acquire', 'relationships'])
  })
})

/*
 * The queue on /admin/collected counts each horizon in the database, so it needs the instant each Melbourne day
 * begins (29 October 2026: it counted its own 200 drawn rows and called TEST's 490 waiting "200").
 */
describe('the instant a Melbourne day begins', () => {
  it('is 13:00 UTC the day before while daylight saving runs (AEDT, UTC+11)', () => {
    expect(melbourneDayStart(NOW, 0).toISOString()).toBe('2026-10-27T13:00:00.000Z')
    expect(melbourneDayStart(NOW, 1).toISOString()).toBe('2026-10-28T13:00:00.000Z')
  })

  it('is 14:00 UTC the day before in standard time (AEST, UTC+10), across the April change', () => {
    // 5 April 2027 is the day after daylight saving ends (first Sunday in April, 4 April 2027).
    const april = new Date('2027-04-05T02:00:00Z')
    expect(melbourneDayStart(april, 0).toISOString()).toBe('2027-04-04T14:00:00.000Z')
    // 4 April 2027 itself began in daylight time.
    expect(melbourneDayStart(april, -1).toISOString()).toBe('2027-04-03T13:00:00.000Z')
  })

  it('crosses the October change: 4 October 2026 began in standard time, 5 October in daylight time', () => {
    const october = new Date('2026-10-05T02:00:00Z')
    expect(melbourneDayStart(october, -1).toISOString()).toBe('2026-10-03T14:00:00.000Z')
    expect(melbourneDayStart(october, 0).toISOString()).toBe('2026-10-04T13:00:00.000Z')
  })

  it('agrees with horizonOf at every bound: the start of each horizon is its first day, the minute before is the last day of the one before', () => {
    const b = horizonBounds(NOW)
    expect(horizonOf(b.publish, NOW)).toBe('publish')
    expect(horizonOf(new Date(b.publish.getTime() - 60_000), NOW)).toBe('past')
    expect(horizonOf(b.acquire, NOW)).toBe('acquire')
    expect(horizonOf(new Date(b.acquire.getTime() - 60_000), NOW)).toBe('publish')
    expect(horizonOf(b.relationships, NOW)).toBe('relationships')
    expect(horizonOf(new Date(b.relationships.getTime() - 60_000), NOW)).toBe('acquire')
    expect(horizonOf(b.beyond, NOW)).toBe('beyond')
    expect(horizonOf(new Date(b.beyond.getTime() - 60_000), NOW)).toBe('relationships')
  })
})
