import { describe, it, expect } from 'vitest'
import { weekendWindowUtc, localDayOfWeek, localHourOfDay } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * THE WEEKEND, AND THE HOUR, READ IN THE RIGHT ZONE.
 *
 * Two shipped surfaces decided when the weekend was by reading a UTC clock on a
 * platform where every event happens between UTC+8 and UTC+11:
 *
 *   src/app/page.tsx         built a Saturday-to-Sunday window from getUTCDay()
 *                            and setUTCHours, so the rail called "On this
 *                            weekend" ran Saturday 10:00 to Monday 10:00
 *                            Melbourne time.
 *   /api/home/surprise       read now.getDay() and now.getHours(), which are the
 *                            SERVER's zone, and on Vercel that is UTC.
 *
 * The cases below are the arithmetic those two got wrong, written as the clock
 * times a reader in Australia would actually be looking at. The UTC-rule column
 * in each name is what the deleted code answered, so a regression reads as a
 * return to a named behaviour rather than as a number changing.
 */

/** The old homepage rule, kept here verbatim so the tests compare against the real thing. */
function utcWeekendWindow(nowIso: string): { from: number; to: number } {
  const d = new Date(nowIso)
  const day = d.getUTCDay()
  const daysToSat = (6 - day + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysToSat)
  d.setUTCHours(0, 0, 0, 0)
  const end = new Date(d)
  end.setUTCDate(end.getUTCDate() + 2)
  return { from: d.getTime(), to: end.getTime() }
}

const inShared = (startIso: string, nowIso: string) => {
  const w = weekendWindowUtc(new Date(nowIso), PLATFORM_TIME_ZONE)
  const t = Date.parse(startIso)
  return t >= w.from.getTime() && t <= w.to.getTime()
}
const inUtcRule = (startIso: string, nowIso: string) => {
  const w = utcWeekendWindow(nowIso)
  const t = Date.parse(startIso)
  return t >= w.from && t < w.to
}

describe('the homepage weekend rail, in the platform zone', () => {
  /*
   * MEASURED, NOT INVENTED. On 19 September 2026 the TEST catalogue held twelve
   * events on the following weekend and three of them started on Saturday
   * 26 September at 09:40 Melbourne time, which is Friday 23:40 UTC. A quarter
   * of the weekend was missing from the rail whose only job is to show it.
   */
  const SATURDAY_MORNING_MELBOURNE = '2026-09-25T23:40:00.000Z' // Sat 26 Sept, 09:40 AEST
  const MIDWEEK = '2026-09-23T04:00:00.000Z' // Wed 23 Sept, 14:00 AEST

  it('includes a Saturday morning Melbourne event that the UTC rule dropped', () => {
    expect(inShared(SATURDAY_MORNING_MELBOURNE, MIDWEEK)).toBe(true)
    expect(inUtcRule(SATURDAY_MORNING_MELBOURNE, MIDWEEK)).toBe(false)
  })

  it('excludes a Monday morning Melbourne event that the UTC rule admitted', () => {
    const MONDAY_MORNING = '2026-09-27T23:00:00.000Z' // Mon 28 Sept, 09:00 AEST
    expect(inShared(MONDAY_MORNING, MIDWEEK)).toBe(false)
    expect(inUtcRule(MONDAY_MORNING, MIDWEEK)).toBe(true)
  })

  it('keeps a Saturday night event, which both rules agreed on', () => {
    const SATURDAY_NIGHT = '2026-09-26T10:00:00.000Z' // Sat 26 Sept, 20:00 AEST
    expect(inShared(SATURDAY_NIGHT, MIDWEEK)).toBe(true)
    expect(inUtcRule(SATURDAY_NIGHT, MIDWEEK)).toBe(true)
  })

  it('keeps a Sunday night event, the far edge of the window', () => {
    const SUNDAY_NIGHT = '2026-09-27T12:30:00.000Z' // Sun 27 Sept, 22:30 AEST
    expect(inShared(SUNDAY_NIGHT, MIDWEEK)).toBe(true)
  })

  it('treats the Sunday it is already on as this weekend, not next weekend', () => {
    const ON_SUNDAY = '2026-09-27T04:00:00.000Z' // Sun 27 Sept, 14:00 AEST
    const SUNDAY_EVENING = '2026-09-27T09:00:00.000Z' // Sun 27 Sept, 19:00 AEST
    expect(inShared(SUNDAY_EVENING, ON_SUNDAY)).toBe(true)
  })

  it('covers a Perth event, the far side of the country, on the same weekend', () => {
    // Sat 26 Sept, 09:00 AWST (UTC+8) is Sat 01:00 UTC.
    expect(inShared('2026-09-26T01:00:00.000Z', MIDWEEK)).toBe(true)
  })

  it('is inclusive at the far end, which is why the caller compares with <=', () => {
    const w = weekendWindowUtc(new Date(MIDWEEK), PLATFORM_TIME_ZONE)
    expect(inShared(w.to.toISOString(), MIDWEEK)).toBe(true)
  })
})

describe('localHourOfDay', () => {
  /*
   * The /api/home/surprise label asked "is it after 17:00" of a UTC clock and
   * showed the answer to a reader in Australia.
   */
  it('reads a Melbourne Saturday night as evening, where the server clock read 10', () => {
    const SATURDAY_2000_MELBOURNE = new Date('2026-09-26T10:00:00.000Z')
    expect(localHourOfDay(SATURDAY_2000_MELBOURNE, PLATFORM_TIME_ZONE)).toBe(20)
    expect(SATURDAY_2000_MELBOURNE.getUTCHours()).toBe(10)
  })

  it('reads a Monday morning as Monday, where the server clock read Sunday 22:00', () => {
    const MONDAY_0900_MELBOURNE = new Date('2026-09-27T23:00:00.000Z')
    expect(localDayOfWeek(MONDAY_0900_MELBOURNE, PLATFORM_TIME_ZONE)).toBe(1)
    expect(localHourOfDay(MONDAY_0900_MELBOURNE, PLATFORM_TIME_ZONE)).toBe(9)
    // what the deleted code saw:
    expect(MONDAY_0900_MELBOURNE.getUTCDay()).toBe(0)
  })

  it('answers 0 at local midnight rather than 24, which an h12-derived cycle returns', () => {
    // Sun 27 Sept 00:00 AEST is Sat 26 Sept 14:00 UTC.
    expect(localHourOfDay(new Date('2026-09-26T14:00:00.000Z'), PLATFORM_TIME_ZONE)).toBe(0)
  })

  it('reads every hour of a local day as 0 to 23 and never 24', () => {
    const seen = new Set<number>()
    for (let h = 0; h < 24; h += 1) {
      // Walk a full local day from Sun 27 Sept 00:00 AEST.
      seen.add(localHourOfDay(new Date(Date.parse('2026-09-26T14:00:00.000Z') + h * 3600000), PLATFORM_TIME_ZONE))
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i))
  })

  it('answers for Perth independently of the platform zone', () => {
    // Sat 26 Sept 20:00 AWST is Sat 12:00 UTC.
    expect(localHourOfDay(new Date('2026-09-26T12:00:00.000Z'), 'Australia/Perth')).toBe(20)
  })
})
