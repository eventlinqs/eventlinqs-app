import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * WHEN AN EVENT STOPS BEING LISTED. One definition, used by every discovery
 * surface.
 *
 * THE DEFECT THIS REPLACES. Every listing query filtered `start_date >= now`,
 * so an event dropped off the platform THE MOMENT IT STARTED. A gig at 09:00
 * was invisible by 09:01, on the day it was on, which is the single day it
 * matters most. The founder's own event on 16 August 2026 vanished exactly this
 * way, and the missing-cover filter was blamed for it for a while, which is why
 * the audit that produced this file went looking at every exclusion rather than
 * the first one somebody noticed.
 *
 * THE RULE (founder ruling, 16 August 2026). Discovery shows an event until it
 * has ACTUALLY ENDED, not until it has started.
 *
 *   - `end_date` present: listed while `end_date >= now`.
 *   - `end_date` null: listed until the end of the calendar day of `start_date`
 *     IN THE EVENT'S OWN TIME ZONE, never the server's. A 09:00 event stays
 *     listed all day and drops overnight.
 *
 * `end_date` is deliberately NOT made mandatory at publish: that would strand
 * every existing event that has none.
 *
 * WHY THE SQL PREDICATE IS SHAPED THE WAY IT IS. The obvious implementation is
 * to over-fetch and then filter precisely in JavaScript. That is wrong here, and
 * not for a subtle reason: these queries are PAGINATED. Dropping rows after the
 * database has already chosen the page leaves a ragged 21-row page and the three
 * dropped events are never pulled forward from page 2, so a filter meant to stop
 * events disappearing would itself make events disappear.
 *
 * So the whole rule is expressed in SQL. The trick that makes it expressible is
 * this equivalence: for an event with no `end_date`,
 *
 *     end-of-local-calendar-day(start_date) >= now
 *       <=>  start_date >= start-of-today-in-that-same-zone
 *
 * which is a plain column comparison once the boundary instant is computed per
 * zone in JavaScript. The zones are enumerated, one `or` branch each.
 *
 * AN UNKNOWN ZONE IS NEVER DROPPED. Enumerating zones would normally introduce
 * exactly the failure this work exists to close: add an eighth zone, and its
 * events vanish with nothing to say so. The final branch therefore catches every
 * row whose zone is null or is not in the list and judges it by the PLATFORM
 * zone instead. Every supported zone is Australian, spanning UTC+8 to UTC+11, so
 * the worst case for an unrecognised zone is a boundary at most three hours out,
 * and the error is always in the direction of showing the event for longer.
 * Nothing is ever hidden by a zone this file has not heard of.
 */

/**
 * The zones `events.timezone` actually carries. `src/lib/dates/event-time.ts`
 * records these as verified on TEST (363 of 363 published events, seven zones).
 * A zone missing from this list still lists correctly, via the fallback branch
 * below; the list only buys exactness, never visibility.
 */
export const SUPPORTED_EVENT_ZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Hobart',
] as const

/**
 * The UTC offset of `zone` at `date`, in milliseconds.
 *
 * Intl is the only timezone database in the runtime, so the offset is recovered
 * by formatting the instant in the target zone and reading the wall-clock back
 * as though it were UTC. The difference is the offset.
 */
function zoneOffsetMs(date: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const at: Record<string, string> = {}
  for (const p of parts) at[p.type] = p.value

  const asIfUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Intl emits hour 24 for midnight under hour12:false in some engines.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  )
  return asIfUtc - date.getTime()
}

/** The local calendar date in `zone` at `date`, as [year, month, day]. */
function localDateParts(date: Date, zone: string): [number, number, number] {
  // en-CA renders ISO-ordered YYYY-MM-DD, which needs no parsing guesswork.
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number)
  return [y, m, d]
}

/**
 * The UTC instant at which the given local wall-clock midnight occurs.
 *
 * The offset is resolved twice because the first guess is taken at the wrong
 * instant whenever the boundary sits across a DST transition: the offset that
 * applies at UTC midnight is not necessarily the one that applies at local
 * midnight. Re-reading the offset at the corrected instant settles it.
 */
function localMidnightUtc(year: number, month: number, day: number, zone: string): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  const firstGuess = naive - zoneOffsetMs(new Date(naive), zone)
  const settled = naive - zoneOffsetMs(new Date(firstGuess), zone)
  return new Date(settled)
}

/**
 * Start of the local calendar day `offsetDays` from the day containing `date`,
 * in `zone`, as a UTC instant.
 *
 * Every date window on the platform is built from this one function rather than
 * from `setHours`, which uses the SERVER's zone. On Vercel the server runs UTC,
 * so a `setHours(0,0,0,0)` boundary put an Australian evening event in the wrong
 * day. Each boundary is resolved through localMidnightUtc independently, so a
 * window that spans a daylight-saving change is still correct at both ends.
 */
export function startOfLocalDayUtcOffset(date: Date, zone: string, offsetDays: number): Date {
  const [y, m, d] = localDateParts(date, zone)
  // Date.UTC normalises a day overflow (32 January, day 0, etc), so month-end
  // and year-end need no special case.
  return localMidnightUtc(y, m, d + offsetDays, zone)
}

/** Start of the calendar day containing `now`, in `zone`, as a UTC instant. */
export function startOfLocalDayUtc(now: Date, zone: string): Date {
  return startOfLocalDayUtcOffset(now, zone, 0)
}

/** End of the calendar day containing `date`, in `zone`, as a UTC instant. */
export function endOfLocalDayUtc(date: Date, zone: string): Date {
  return startOfLocalDayUtcOffset(date, zone, 1)
}

/**
 * Day of the week (0 Sunday to 6 Saturday) of the calendar day containing
 * `date`, IN `zone`. `Date.prototype.getDay()` answers for the server's zone,
 * which is how a weekend window came to start on the wrong day.
 */
export function localDayOfWeek(date: Date, zone: string): number {
  const [y, m, d] = localDateParts(date, zone)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * The upcoming weekend, Saturday 00:00 to the last instant of Sunday, in
 * `zone`. On a Sunday the weekend already under way is the one meant, so it
 * steps back a day rather than jumping forward six.
 *
 * ONE DEFINITION, because there were FOUR: the /events weekend preset, the city
 * page, the suburb page and the community-by-city page each carried their own
 * copy built on `setHours`, so all four ran on the server's UTC day and all four
 * had to be found separately. `to` is inclusive, matching the `lte` comparisons
 * at the call sites.
 */
export function weekendWindowUtc(now: Date, zone: string): { from: Date; to: Date } {
  const day = localDayOfWeek(now, zone) // 0 Sun .. 6 Sat
  const toSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  return {
    from: startOfLocalDayUtcOffset(now, zone, toSaturday),
    to: new Date(startOfLocalDayUtcOffset(now, zone, toSaturday + 2).getTime() - 1),
  }
}

/** Resolve an event's zone, falling back to the platform zone, never the runtime's. */
export function eventZone(timezone: string | null | undefined): string {
  return timezone && timezone.trim() ? timezone : PLATFORM_TIME_ZONE
}

/**
 * The instant this event stops appearing on discovery surfaces.
 *
 * This is the single definition of the rule. The SQL predicate below and
 * `isStillListed` must agree with it, and the tests pin that they do.
 */
export function listingUntil(event: {
  start_date: string
  end_date?: string | null
  timezone?: string | null
}): Date {
  if (event.end_date) {
    const ends = new Date(event.end_date)
    if (!Number.isNaN(ends.getTime())) return ends
  }
  const starts = new Date(event.start_date)
  if (Number.isNaN(starts.getTime())) {
    // An unparseable start date must not silently remove the event from the
    // platform. Treat it as listed and let the data be fixed.
    return new Date(8640000000000000)
  }
  return endOfLocalDayUtc(starts, eventZone(event.timezone))
}

/** Is this event still listed at `now`? */
export function isStillListed(
  event: { start_date: string; end_date?: string | null; timezone?: string | null },
  now: Date = new Date(),
): boolean {
  return listingUntil(event).getTime() >= now.getTime()
}

/**
 * Build the PostgREST `or` predicate that keeps an event listed until it has
 * ended. Pass the result to `query.or(...)`.
 *
 * Shape, with one branch per zone:
 *
 *   end_date.gte.<now>,
 *   and(end_date.is.null,timezone.eq.<zone>,start_date.gte.<start of today there>),
 *   ...
 *   and(end_date.is.null,timezone.is.null,start_date.gte.<start of today, platform zone>),
 *   and(end_date.is.null,timezone.not.in.(<zones>),start_date.gte.<start of today, platform zone>)
 *
 * The last two branches are what make an unrecognised or absent zone list for
 * longer rather than vanish.
 */
export function listingWindowOrPredicate(now: Date = new Date()): string {
  const nowIso = now.toISOString()
  const branches: string[] = [`end_date.gte.${nowIso}`]

  for (const zone of SUPPORTED_EVENT_ZONES) {
    const boundary = startOfLocalDayUtc(now, zone).toISOString()
    branches.push(`and(end_date.is.null,timezone.eq.${zone},start_date.gte.${boundary})`)
  }

  const platformBoundary = startOfLocalDayUtc(now, PLATFORM_TIME_ZONE).toISOString()
  branches.push(`and(end_date.is.null,timezone.is.null,start_date.gte.${platformBoundary})`)
  branches.push(
    `and(end_date.is.null,timezone.not.in.(${SUPPORTED_EVENT_ZONES.join(',')}),start_date.gte.${platformBoundary})`,
  )

  return branches.join(',')
}
