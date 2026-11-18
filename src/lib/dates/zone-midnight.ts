/**
 * MIDNIGHT IN A ZONE, TRUE ON A DAYLIGHT SAVING DAY (car D, 19 November 2026; law 4, one defect is a class). Three helpers
 * found the day's start by taking the zone's clock time off the instant, which assumes every day has 24 hours: on the
 * day daylight saving ends (Sunday 5 April 2026 in Melbourne, 25 hours) that lands an hour late, and on the day it
 * starts (Sunday 4 October 2026, 23 hours) an hour early, in the day before. Here the first answer is read back on the
 * zone's clock and moved by what that clock still shows, so it is that day's own midnight. Pure.
 */

/** Milliseconds since midnight on the zone's clock, at an instant. */
function sinceMidnight(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return ((n('hour') % 24) * 3600 + n('minute') * 60 + n('second')) * 1000 + at.getUTCMilliseconds()
}

const HALF_DAY_MS = 12 * 3_600_000
const DAY_MS = 24 * 3_600_000

/** The instant the zone's clock reads midnight on the day `at` falls on. */
export function midnightIn(at: Date, zone: string): Date {
  let t = at.getTime() - sinceMidnight(at, zone)
  // Read the first answer back: on a day of 25 hours it shows 01:00 (an hour late), on a day of 23 hours 23:00 the day
  // before (an hour early). Move it by what the clock shows.
  const off = sinceMidnight(new Date(t), zone)
  if (off !== 0) t = off < HALF_DAY_MS ? t - off : t + (DAY_MS - off)
  return new Date(t)
}
