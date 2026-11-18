import { midnightIn } from '@/lib/dates/zone-midnight'

/**
 * THE ENGINE PAGE'S RULES (the operating model's amendment 1, A4 and A5; the PM's 01:39 of 19 November 2026, item 3).
 * Pure, so each rule is driven by its own test (tests/unit/admin/engine-math.test.ts).
 *
 * A5, WHAT "RUNNING PERMANENTLY" MEANS: an automation is called permanent only after it has run on its own schedule in
 * production for three days in a row with no human prompt, read from its own records. Until then its row says
 * "proving, day N of 3".
 */

export const PERMANENT_DAYS = 3
/** Today and the days before it that A5 reads: enough to see three in a row ending yesterday. */
export const DAYS_READ = PERMANENT_DAYS + 1

export type Proving = { readonly permanent: boolean; readonly day: number; readonly line: string }

/** One Melbourne calendar day: its date and its bounds as instants. */
export type DayBounds = { readonly day: string; readonly from: string; readonly to: string }

/** The Melbourne date of an instant, as YYYY-MM-DD. */
export function melbourneDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Midnight in Melbourne of the day an instant falls on, true on a daylight saving day (zone-midnight.ts). */
function melbourneMidnight(at: Date): Date {
  return midnightIn(at, 'Australia/Melbourne')
}

/**
 * Today and the days before it, newest first, each with its Melbourne bounds. Each day is found from the noon of the
 * day after it, so a daylight saving change never skips or repeats a day.
 */
export function lastDays(now: Date, count: number = DAYS_READ): DayBounds[] {
  const out: DayBounds[] = []
  let start = melbourneMidnight(now)
  let end = new Date(now.getTime() + 1)
  for (let i = 0; i < count; i += 1) {
    out.push({ day: melbourneDay(start), from: start.toISOString(), to: end.toISOString() })
    end = start
    start = melbourneMidnight(new Date(start.getTime() - 12 * 3_600_000))
  }
  return out
}

/**
 * A5 over the days read, newest first: today counts only once it has run (its runs may still be ahead), then every day
 * before it in a row that ran by itself. Three or more is permanent.
 */
export function provingOf(days: readonly { readonly day: string; readonly ran: boolean }[]): Proving {
  const from = days[0]?.ran ? 0 : 1
  let n = 0
  for (let i = from; i < days.length && days[i].ran; i += 1) n += 1
  if (n >= PERMANENT_DAYS) return { permanent: true, day: n, line: `Running permanently: ${n} days in a row on its own schedule` }
  return { permanent: false, day: n, line: `Proving, day ${n} of ${PERMANENT_DAYS}` }
}

/** A failure has recovered when the automation's own records show a good run after it. */
export function recoveredAfter(failureAt: string | null, lastGoodAt: string | null): boolean | null {
  if (!failureAt) return null
  return lastGoodAt !== null && Date.parse(lastGoodAt) > Date.parse(failureAt)
}

/** The newest of several instants, or null. */
export function newestOf(...ats: readonly (string | null | undefined)[]): string | null {
  const known = ats.filter((a): a is string => typeof a === 'string' && Number.isFinite(Date.parse(a)))
  return known.length === 0 ? null : known.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
}
