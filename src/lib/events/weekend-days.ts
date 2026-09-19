import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { weekendWindowUtc } from './listing-window'

/**
 * THE WEEKEND SURFACE'S IDENTITY AND ITS DAY SPLIT, WITH NO FRAMEWORK IN IT.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE FILE FROM `weekend-surface.ts`
 * ============================================================================
 *
 * The same reason `discovery-matchers.ts` is separate from `discovery-counts.ts`
 * and says so in its own header: the READ needs `next/cache`, and a module that
 * imports `next/cache` cannot be loaded by a script outside a Next build.
 *
 * It was not a theory. The fixture seeder for this surface
 * (scripts/ops/seed-weekend-surface-fixture.mjs) verifies the rows it wrote by
 * asking `groupWeekendByDay` what it makes of them, because a fixture checked
 * with a second copy of the rule is a second opinion about the thing under test.
 * Its first run died on `Cannot find module next/cache`, which is the layering
 * telling the truth: the day split is a RULE and the read is a QUERY, and only
 * one of them belongs to the framework.
 *
 * `weekend-surface.ts` re-exports everything here, so every call site inside the
 * product gets the identity, the split and the read from one import.
 */

/** The route. Written once, imported by the page, the sitemap and the guard. */
export const WEEKEND_SURFACE_PATH = '/this-weekend'

/**
 * How many cards the page renders.
 *
 * Sixty is the display cap and never a substance judgement: whether the page is
 * offered to a search engine is decided on the full count the database reported,
 * exactly as `/categories/[slug]` decides on the full count behind its 24-card
 * grid. Sixty rather than 24 because this page is a WEEKEND, a set that closes
 * on Sunday night, so there is no "next page" worth paginating to and truncating
 * it would hide events nobody can see any other way.
 */
export const WEEKEND_SURFACE_LIMIT = 60

/**
 * The weekend this page is about: Saturday 00:00 to the last instant of Sunday,
 * in the PLATFORM zone.
 *
 * It delegates rather than deciding. `weekendWindowUtc` is the one definition on
 * this platform and `scripts/guards/one-weekend-definition.mjs` exists because
 * that rule has been written privately six times, four of them found by a
 * consolidation that could not see the other two.
 */
export function weekendSurfaceWindow(now: Date = new Date()): { from: Date; to: Date } {
  return weekendWindowUtc(now, PLATFORM_TIME_ZONE)
}

/** The shape the day split reads. Any row carrying a start and a zone will do. */
export interface WeekendDatedEvent {
  start_date: string
  timezone?: string | null
}

/** One day of the weekend, as it is rendered. */
export interface WeekendDay<T extends WeekendDatedEvent = WeekendDatedEvent> {
  /** `YYYY-MM-DD` in the events' own zone. The React key and the sort key. */
  key: string
  /** "Saturday 19 September", built from the first event's own zone. */
  heading: string
  events: T[]
}

/**
 * The calendar day of `iso` IN `zone`, as `YYYY-MM-DD`.
 *
 * `en-CA` is used rather than string surgery on a Date because it is the one
 * widely-available locale whose short date IS ISO order, so the key sorts
 * lexically and is the same string every runtime produces.
 */
function localDayKey(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function localDayHeading(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

/**
 * The events split into days, in order, each headed by its own date.
 *
 * ============================================================================
 * THE GROUPING IS BY THE EVENT'S OWN ZONE, AND THAT IS THE WHOLE POINT
 * ============================================================================
 *
 * Every card on this platform prints its date in the EVENT's zone, by the rule
 * closed on 19 September 2026 after eight components printed the UTC day and
 * every morning event in Australia showed the wrong one. A heading computed in
 * the platform zone over cards computed in their own would reproduce that defect
 * one level up: a Perth event at 22:00 on Saturday is Sunday 00:00 in Sydney, so
 * a platform-zone heading would file a card reading "SAT" under "Sunday".
 *
 * The window decides MEMBERSHIP, in the platform zone, because a national
 * surface needs one answer to "which weekend". The event's own zone decides
 * WHICH HEADING it sits under, because that is the day it happens and the day
 * its card already says.
 *
 * A CONSEQUENCE, written down rather than left to surprise somebody: the
 * platform-zone window opens at Saturday 00:00 AEST, which is Friday 22:00 in
 * Perth, so a late Friday event in Western Australia can legitimately appear
 * under a FRIDAY heading on a page about the weekend. That is honest, it is that
 * reader's weekend, and it is covered by a test rather than by a comment alone.
 */
export function groupWeekendByDay<T extends WeekendDatedEvent>(events: T[]): WeekendDay<T>[] {
  const byKey = new Map<string, WeekendDay<T>>()
  for (const event of events) {
    const zone = event.timezone && event.timezone.trim() ? event.timezone : PLATFORM_TIME_ZONE
    const key = localDayKey(event.start_date, zone)
    const existing = byKey.get(key)
    if (existing) {
      existing.events.push(event)
      continue
    }
    byKey.set(key, { key, heading: localDayHeading(event.start_date, zone), events: [event] })
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/**
 * "Saturday 19 and Sunday 20 September", the human form of the window.
 *
 * It is built from the window rather than from the events, so the page says
 * which weekend it is even when nothing is on. Both dates carry their month when
 * the weekend straddles one, which is the only case the short form would be
 * ambiguous in.
 */
export function describeWeekend(from: Date, to: Date): string {
  const zone = PLATFORM_TIME_ZONE
  const part = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat('en-AU', {
      timeZone: zone,
      weekday: 'long',
      day: 'numeric',
      ...(withMonth ? { month: 'long' } : {}),
    }).format(d)
  const month = (d: Date) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, month: 'long' }).format(d)
  const straddles = month(from) !== month(to)
  return `${part(from, straddles)} and ${part(to, true)}`
}
