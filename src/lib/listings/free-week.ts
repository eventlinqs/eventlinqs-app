import { FREE_ENTRY_NO_TICKET_NEEDED, isWalkIn } from '@/lib/events/entry-mode'
import { startOfLocalDayUtcOffset } from '@/lib/events/listing-window'

/**
 * THE CITY GUIDE'S "THIS WEEK" PAGE, ITS RULES IN ONE PLACE (WI2 Part 2,
 * docs/walk-in/WI2-PLAN.md section 8a). Pure: no framework and no database, so
 * the page, the sitemap, the guard and the tests read the same answers.
 *
 *   the path    /free/<city>/this-week, one per city the cities table marks
 *               free_guide (ruling a of 21 October 2026: a city is a row)
 *   the week    today and the next six days, in the CITY's own zone
 *   the label   "Free entry, no ticket needed" for a walk-in event (WI1), and
 *               "Free, ticket needed" for every other free event, the founder's
 *               answer 3 of 21 October; City of Melbourne's What's On draws the
 *               same line ("This is a free event" / "Booking not required",
 *               WI2-PLAN.md section 3)
 *   the days    one heading per day, in order, each event under the day it
 *               happens in its own zone, and an event already running under
 *               today rather than a day before the page begins
 */

/** Seven days: today and the next six. */
export const FREE_WEEK_DAYS = 7

/** At most this many events on one page; the count beside it is never capped. */
export const FREE_WEEK_LIMIT = 120

/** The label of a free event that still needs a (free) ticket. */
export const FREE_TICKET_NEEDED = 'Free, ticket needed'

export function freeWeekPath(citySlug: string): string {
  return `/free/${citySlug}/this-week`
}

/** Which of the two free labels an event carries. */
export function freeEntryLabel(entryMode: string | null | undefined): string {
  return isWalkIn({ entry_mode: entryMode ?? null }) ? FREE_ENTRY_NO_TICKET_NEEDED : FREE_TICKET_NEEDED
}

/** The start of today to the last instant of the sixth day after, in `zone`. */
export function freeWeekWindow(now: Date, zone: string): { from: Date; to: Date } {
  const from = startOfLocalDayUtcOffset(now, zone, 0)
  const to = new Date(startOfLocalDayUtcOffset(now, zone, FREE_WEEK_DAYS).getTime() - 1)
  return { from, to }
}

export interface FreeWeekDatedEvent {
  start_date: string
  timezone?: string | null
}

export interface FreeWeekDay<T extends FreeWeekDatedEvent = FreeWeekDatedEvent> {
  /** `YYYY-MM-DD`, the day in the event's own zone. The React key and the sort key. */
  key: string
  /** "Today, Saturday 24 October", "Tomorrow, Sunday 25 October", "Monday 26 October". */
  heading: string
  events: T[]
}

function dayKey(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

function dayName(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(instant)
}

/**
 * The events split into days, in order.
 *
 * The heading's day is the event's own zone, the rule every card on the
 * platform prints its date by (src/lib/events/weekend-days.ts says why). The
 * one difference from the weekend page: an event that began before today and is
 * still on (the second day of a festival) sits under TODAY, because a page about
 * this week never opens on a day that has already gone.
 */
export function groupFreeWeekByDay<T extends FreeWeekDatedEvent>(events: T[], cityZone: string, now: Date): FreeWeekDay<T>[] {
  const today = dayKey(now, cityZone)
  const tomorrow = dayKey(new Date(startOfLocalDayUtcOffset(now, cityZone, 1).getTime() + 12 * 3600 * 1000), cityZone)
  const byKey = new Map<string, FreeWeekDay<T>>()
  for (const event of events) {
    const zone = event.timezone && event.timezone.trim() ? event.timezone : cityZone
    const start = new Date(event.start_date)
    const own = dayKey(start, zone)
    const key = own < today ? today : own
    const instant = own < today ? now : start
    const name = dayName(instant, own < today ? cityZone : zone)
    const heading = key === today ? `Today, ${name}` : key === tomorrow ? `Tomorrow, ${name}` : name
    const existing = byKey.get(key)
    if (existing) existing.events.push(event)
    else byKey.set(key, { key, heading, events: [event] })
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** "Saturday 24 to Friday 30 October", or "Thursday 29 October to Wednesday 4 November" across a month. */
export function describeFreeWeek(from: Date, to: Date, zone: string): string {
  const month = (d: Date) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, month: 'long' }).format(d)
  const part = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', ...(withMonth ? { month: 'long' } : {}) }).format(d)
  return `${part(from, month(from) !== month(to))} to ${part(to, true)}`
}
