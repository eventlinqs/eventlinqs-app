/**
 * THE ROLLING 90 DAY HORIZON (the engine plan's parts A and E, 28 October 2026; the directive's section 17).
 *
 * "0 to 14 days: verification, final promotion and weekly publication. 15 to 45 days: organiser outreach, permissions,
 * asset acquisition and campaign preparation. 46 to 90 days: early discovery, relationship building and future
 * programme planning."
 *
 * A night's horizon is counted in Melbourne calendar days from today, so it moves every midnight on its own and is
 * never stored: a stored horizon would be wrong the next morning. The database computes the same answer in
 * public.listing_horizon (20261028204001), and tests/unit/listings/horizon.test.ts holds the bounds.
 */

export const HORIZON_ZONE = 'Australia/Melbourne'

/** The last day of each horizon, counted from today (day 0). */
export const HORIZON_DAYS = Object.freeze({ publish: 14, acquire: 45, relationships: 90 })

export type Horizon = keyof typeof HORIZON_DAYS
export type HorizonOrOutside = Horizon | 'past' | 'beyond'

/** The order a person works them in: what goes out soonest first. */
export const HORIZONS: readonly Horizon[] = ['publish', 'acquire', 'relationships']

export const HORIZON_LABELS: Readonly<Record<HorizonOrOutside, string>> = {
  publish: 'Publish (0 to 14 days)',
  acquire: 'Acquire (15 to 45 days)',
  relationships: 'Relationships (46 to 90 days)',
  past: 'Already happened',
  beyond: 'More than 90 days ahead',
}

const DAY_MS = 24 * 60 * 60 * 1000

const melbourneDay = new Intl.DateTimeFormat('en-CA', { timeZone: HORIZON_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The Melbourne calendar date of a moment, as a UTC midnight, so two dates subtract to whole days. */
function dayIndex(at: Date): number {
  const parts = melbourneDay.formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS
}

/** Melbourne calendar days from today to the night: 0 tonight, 1 tomorrow, negative once past. */
export function daysAhead(startsAt: Date, now: Date): number {
  return dayIndex(startsAt) - dayIndex(now)
}

export function horizonOf(startsAt: Date, now: Date): HorizonOrOutside {
  const d = daysAhead(startsAt, now)
  if (d < 0) return 'past'
  if (d <= HORIZON_DAYS.publish) return 'publish'
  if (d <= HORIZON_DAYS.acquire) return 'acquire'
  if (d <= HORIZON_DAYS.relationships) return 'relationships'
  return 'beyond'
}

const melbourneOffset = new Intl.DateTimeFormat('en-AU', { timeZone: HORIZON_ZONE, timeZoneName: 'longOffset' })

/** Melbourne's offset from UTC at a moment, in minutes ("GMT+11:00" is 660), from the platform's time zone data. */
function offsetMinutes(at: Date): number {
  const name = melbourneOffset.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
}

/**
 * The instant the Melbourne calendar day `days` after today begins (0 is today's midnight). Midnight is never inside a
 * daylight saving change in Melbourne (the clocks move at 2:00 and 3:00), so the offset read at a first guess and once
 * more at the answer settles it.
 */
export function melbourneDayStart(now: Date, days: number): Date {
  const utcMidnight = (dayIndex(now) + days) * DAY_MS
  let at = new Date(utcMidnight - offsetMinutes(new Date(utcMidnight)) * 60_000)
  at = new Date(utcMidnight - offsetMinutes(at) * 60_000)
  return at
}

/** Where each horizon begins, as instants a database filter can use; each matches horizonOf at its bound. */
export function horizonBounds(now: Date): Readonly<Record<Horizon | 'beyond', Date>> {
  return {
    publish: melbourneDayStart(now, 0),
    acquire: melbourneDayStart(now, HORIZON_DAYS.publish + 1),
    relationships: melbourneDayStart(now, HORIZON_DAYS.acquire + 1),
    beyond: melbourneDayStart(now, HORIZON_DAYS.relationships + 1),
  }
}
