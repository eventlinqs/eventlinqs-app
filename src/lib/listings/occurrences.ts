import { fromZonedInputValue } from '@/lib/dates/event-time'

/**
 * THE DATES A HOST'S NIGHT FALLS ON (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 7).
 *
 * A host's regular night is stored once, as a series with its rule. This works
 * out its next dates, and the instants they start and finish, so no person ever
 * types a row per date. Pure: the daily run and the import call it and write
 * what it returns.
 *
 * THE DATE ARITHMETIC IS ON CALENDAR DATES, "YYYY-MM-DD", never on instants.
 * "Every Wednesday at 7pm" is a wall clock in the host's own zone, so each date
 * is worked out first and only then turned into an instant in that zone, by the
 * same two-pass conversion the organiser form uses (fromZonedInputValue). A
 * series that steps across a Daylight Saving change therefore stays at 7pm
 * local and moves an hour in UTC, which is what a person standing at the door
 * sees.
 */

/** What the import writes and the schema checks (WI2-PLAN.md section 5). */
export const SERIES_RULES = [
  'once',
  'weekly',
  'fortnightly',
  'monthly-1',
  'monthly-2',
  'monthly-3',
  'monthly-4',
  'monthly-last',
] as const
export type SeriesRule = (typeof SERIES_RULES)[number]

export type Series = {
  rule: SeriesRule
  /** The first date the source confirms, in the host's zone, "YYYY-MM-DD". */
  anchorDate: string
  /** The local start, "HH:MM", 24-hour. */
  startsAt: string
  /**
   * The local finish, "HH:MM", or null when the source gives none. Earlier than
   * (or equal to) the start means the night runs past midnight.
   */
  endsAt: string | null
  /** The IANA zone the series carries, e.g. "Australia/Melbourne". */
  timezone: string
  /** Dates the host is not running, "YYYY-MM-DD". */
  skipDates?: readonly string[]
}

export type Occurrence = {
  /** The local calendar date the night starts on. */
  date: string
  startIso: string
  /** Null when the series has no finish time. */
  endIso: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
/** No series looks further than this for its dates, whatever its skips. */
const MAX_CANDIDATES = 400

const dayMs = 24 * 60 * 60 * 1000
const toUtcMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`)
const fromUtcMidnight = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (date: string, days: number) => fromUtcMidnight(toUtcMidnight(date) + days * dayMs)
/** 0 Sunday to 6 Saturday, of a calendar date (zone-free: a date has one weekday). */
export const weekdayOf = (date: string) => new Date(toUtcMidnight(date)).getUTCDay()

/** The nth (1 to 4) or the last given weekday of a month, as "YYYY-MM-DD". */
export function nthWeekdayOfMonth(year: number, month0: number, weekday: number, nth: number | 'last'): string {
  if (nth === 'last') {
    const lastDay = new Date(Date.UTC(year, month0 + 1, 0))
    const back = (lastDay.getUTCDay() - weekday + 7) % 7
    return fromUtcMidnight(lastDay.getTime() - back * dayMs)
  }
  const first = new Date(Date.UTC(year, month0, 1))
  const forward = (weekday - first.getUTCDay() + 7) % 7
  return fromUtcMidnight(first.getTime() + (forward + (nth - 1) * 7) * dayMs)
}

/** Every date the rule produces, from the anchor on, in order, skips not yet removed. */
function* ruleDates(series: Series): Generator<string> {
  const { rule, anchorDate } = series
  if (rule === 'once') {
    yield anchorDate
    return
  }
  if (rule === 'weekly' || rule === 'fortnightly') {
    const step = rule === 'weekly' ? 7 : 14
    for (let k = 0; ; k += 1) yield addDays(anchorDate, k * step)
  }
  const nth = rule === 'monthly-last' ? 'last' : Number(rule.slice('monthly-'.length))
  const weekday = weekdayOf(anchorDate)
  const anchor = new Date(toUtcMidnight(anchorDate))
  for (let m = 0; ; m += 1) {
    const date = nthWeekdayOfMonth(anchor.getUTCFullYear(), anchor.getUTCMonth() + m, weekday, nth)
    if (date >= anchorDate) yield date
  }
}

/** Why a series cannot produce dates, or null when it can. */
export function seriesProblem(series: Series): string | null {
  if (!SERIES_RULES.includes(series.rule)) return `the rule ${String(series.rule)} is not one of ${SERIES_RULES.join(', ')}`
  if (!DATE.test(series.anchorDate) || Number.isNaN(toUtcMidnight(series.anchorDate))) return `the first date ${series.anchorDate} is not a YYYY-MM-DD date`
  if (!CLOCK.test(series.startsAt)) return `the start ${series.startsAt} is not an HH:MM time`
  if (series.endsAt !== null && !CLOCK.test(series.endsAt)) return `the finish ${series.endsAt} is not an HH:MM time`
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: series.timezone })
  } catch {
    return `the zone ${series.timezone} is not an IANA zone`
  }
  if (series.rule.startsWith('monthly-') && series.rule !== 'monthly-last') {
    const nth = Number(series.rule.slice('monthly-'.length))
    const [y, m] = series.anchorDate.split('-').map(Number)
    if (nthWeekdayOfMonth(y, m - 1, weekdayOf(series.anchorDate), nth) !== series.anchorDate)
      return `${series.anchorDate} is not the ${series.rule.slice('monthly-'.length)} of its weekday in its month`
  }
  if (series.rule === 'monthly-last') {
    const [y, m] = series.anchorDate.split('-').map(Number)
    if (nthWeekdayOfMonth(y, m - 1, weekdayOf(series.anchorDate), 'last') !== series.anchorDate)
      return `${series.anchorDate} is not the last of its weekday in its month`
  }
  return null
}

/** One date's start and finish instants, in the series' own zone. */
export function occurrenceOn(series: Series, date: string): Occurrence {
  const startIso = fromZonedInputValue(`${date}T${series.startsAt}`, series.timezone)
  if (series.endsAt === null) return { date, startIso, endIso: null }
  const endDate = series.endsAt <= series.startsAt ? addDays(date, 1) : date
  return { date, startIso, endIso: fromZonedInputValue(`${endDate}T${series.endsAt}`, series.timezone) }
}

/**
 * The series' next `count` occurrences that start at or after `from`, skipped
 * dates left out. Throws on a series that cannot produce dates, rather than
 * returning a short list that would read as "nothing on".
 */
export function nextOccurrences(series: Series, from: Date, count = 8): Occurrence[] {
  const problem = seriesProblem(series)
  if (problem) throw new Error(`series cannot produce dates: ${problem}`)
  const skips = new Set(series.skipDates ?? [])
  const out: Occurrence[] = []
  let seen = 0
  for (const date of ruleDates(series)) {
    if (out.length >= count || seen >= MAX_CANDIDATES) break
    seen += 1
    if (skips.has(date)) continue
    const occurrence = occurrenceOn(series, date)
    if (Date.parse(occurrence.startIso) >= from.getTime()) out.push(occurrence)
  }
  return out
}
