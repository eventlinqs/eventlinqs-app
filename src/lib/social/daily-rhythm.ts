import { dayStart, planMoments, SOCIAL_ZONE, type CadenceRule, type SchedulePiece, type SocialFormat, type WeekPlan } from './cadence'
import type { PieceKind } from './campaign'

/**
 * THE OPERATING MODEL'S AMENDMENT 1, A1 AND A2 (Lawal, 19 November 2026, about 01:30; the PM's 01:39, item 2;
 * C:\dev\START-16OCT\OPERATING-MODEL-LOCKED-18NOV.md), placed in the scheduler as it stands, building no new system.
 *
 * A2, THE WEEKLY RHYTHM, a starting lean and never a fixed calendar: each family leans to its day of the week. Three things
 * move it, in this order:
 * - the relevance tiers of law 18 always win: a piece leans only where a day of its rhythm falls inside its own window, so
 *   a night's piece is never held past its night for a calendar; Tonight and a night's own poster keep their own day;
 * - car C's learning (section 8), once it has 14 days of results, passes its own days and they replace the rhythm's;
 * - a family not yet in the engine (F, the reel) is carried by the nearest approved family until it ships.
 *
 * A1, THE DAILY FLOOR AND THE CEILING: every day at least one feed post and one story. The ceiling is the cadence bands as
 * they stand (planMoments never puts two posts of a format inside its gap). A thin day takes an approved discovery family
 * piece built from verified listings (the week ahead, free this week, the venue's week) from a day that has two, never an
 * invented night, a passed one or a repost; a day nothing can fill is named, and nothing is faked.
 */

/** A2's table: the weekdays each family leans to, on Melbourne's clock (0 is Sunday, as planMoments counts). */
export const WEEKLY_RHYTHM: Readonly<Partial<Record<PieceKind, readonly number[]>>> = {
  // Monday: the week ahead, per city (A).
  week_ahead: [1],
  // Tuesday: nights worth booking now, 5 to 14 days out.
  coming_up: [2],
  // Wednesday: free this week, plus one spotlight; Sunday: free and family again.
  free_week: [3, 0],
  category_spotlight: [3],
  // Thursday: this weekend, the main planning moment.
  weekend_carousel: [4],
  // Thursday and Friday: F, the reel.
  discovery_reel: [4, 5],
  // Friday: tonight and the weekend reminder.
  tonight_tomorrow: [5],
  // Sunday: the venue's week (E).
  venue_spotlight: [0],
  // G, the organiser offer: business days only.
  organiser_campaign: [1, 2, 3, 4, 5],
}

/** A1's discovery families: built from verified listings, they may move to a thin day inside their own window. */
export const DISCOVERY_KINDS: readonly PieceKind[] = ['week_ahead', 'free_week', 'venue_spotlight']

const DAY_MS = 86_400_000
const HORIZON_DAYS = 7

function weekdayOf(at: Date, zone: string): number {
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short' }).format(at)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** The day a moment falls on, on the zone's clock, as YYYY-MM-DD. */
export function dayKey(at: Date, zone: string = SOCIAL_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function dayWords(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(at).replace(/,/g, '')
}

/** The midnights of the days from now's day on, on the zone's clock. */
function daysAhead(now: Date, zone: string, count: number): Date[] {
  const out: Date[] = []
  let at = dayStart(now, zone)
  for (let i = 0; i < count; i += 1) {
    out.push(at)
    // Noon of the next day, back to its midnight: a daylight saving change never skips or repeats a day.
    at = dayStart(new Date(at.getTime() + DAY_MS + 12 * 3_600_000), zone)
  }
  return out
}

/**
 * A2: the weekdays a piece leans to, or null for none. Car C's learned days win once given; otherwise the rhythm's,
 * but only when one of them falls inside the piece's own window (from now or its notBefore to its deadline, or the next
 * seven days when it has none), so the lean never makes a piece late (law 18 wins). Pure.
 */
export function rhythmDays(
  kind: string,
  window: { readonly notBefore?: Date | null; readonly deadline?: Date | null },
  now: Date,
  opts: { readonly learned?: readonly number[] | null; readonly zone?: string } = {},
): readonly number[] | null {
  if (opts.learned && opts.learned.length > 0) return opts.learned
  const days = WEEKLY_RHYTHM[kind as PieceKind]
  if (!days || days.length === 0) return null
  const zone = opts.zone ?? SOCIAL_ZONE
  const from = new Date(Math.max(now.getTime(), window.notBefore?.getTime() ?? 0))
  const until = window.deadline?.getTime() ?? from.getTime() + HORIZON_DAYS * DAY_MS
  for (const midnight of daysAhead(from, zone, HORIZON_DAYS + 1)) {
    // A day counts when some of it is still inside the window: from its midnight (or from now) to before the deadline.
    const opens = Math.max(midnight.getTime(), from.getTime())
    if (opens >= until) break
    if (days.includes(weekdayOf(midnight, zone))) return days
  }
  return null
}

export type FloorPiece = SchedulePiece & { readonly kind: string }

export type FloorPlan = {
  /** Every piece's moment after the floor: the plan's, with a discovery piece moved to a thin day where one could go. */
  readonly moments: ReadonlyMap<string, Date>
  readonly late: WeekPlan['late']
  /** The pieces moved to a thin day, each with the day it moved to. */
  readonly moved: readonly { readonly id: string; readonly day: string }[]
  /** A1's named lines: each day of the next seven with no feed post or no story, and why. For the 08:00 report. */
  readonly report: readonly string[]
}

/**
 * A1, THE DAILY FLOOR, over a plan from planMoments: for each of the next seven days on Melbourne's clock with no feed post
 * (counting every moment already taken), a discovery family piece placed on a day with two or more feed posts, or not
 * placed at all, is planned again on that day's own bands, inside its own window, where it lands on that day before its
 * deadline. No piece is made; a day nothing can fill is named. A story is never moved (each is its own night's), and a
 * day without one is named the same way. Pure.
 */
export function applyDailyFloor(input: {
  readonly pieces: readonly FloorPiece[]
  readonly plan: WeekPlan
  readonly rules: Readonly<Record<SocialFormat, CadenceRule>>
  readonly taken: Readonly<Record<SocialFormat, readonly Date[]>>
  readonly now: Date
  readonly zone?: string
}): FloorPlan {
  const zone = input.zone ?? SOCIAL_ZONE
  const moments = new Map(input.plan.moments)
  let late = [...input.plan.late]
  const moved: { id: string; day: string }[] = []
  const formatOf = new Map(input.pieces.map((p) => [p.id, p.format]))
  const onDay = (format: SocialFormat): Map<string, number> => {
    const count = new Map<string, number>()
    for (const t of input.taken[format]) count.set(dayKey(t, zone), (count.get(dayKey(t, zone)) ?? 0) + 1)
    for (const [id, at] of moments) if (formatOf.get(id) === format) count.set(dayKey(at, zone), (count.get(dayKey(at, zone)) ?? 0) + 1)
    return count
  }
  const report: string[] = []
  for (const midnight of daysAhead(input.now, zone, HORIZON_DAYS)) {
    const day = dayKey(midnight, zone)
    if ((onDay('feed').get(day) ?? 0) === 0) {
      const counts = onDay('feed')
      const candidates = input.pieces.filter((p) => {
        if (p.format !== 'feed' || !DISCOVERY_KINDS.includes(p.kind as PieceKind)) return false
        const at = moments.get(p.id)
        return at === undefined ? late.some((l) => l.id === p.id) : (counts.get(dayKey(at, zone)) ?? 0) >= 2
      })
      for (const p of candidates) {
        const own = moments.get(p.id)
        const busy = [...input.taken.feed, ...[...moments].filter(([id]) => id !== p.id && formatOf.get(id) === 'feed').map(([, at]) => at)]
        const notBefore = new Date(Math.max(midnight.getTime(), p.notBefore?.getTime() ?? 0))
        const again = planMoments([{ ...p, notBefore, days: [weekdayOf(midnight, zone)] }], input.rules, { feed: busy, story: input.taken.story }, input.now, zone)
        const at = again.moments.get(p.id)
        if (!at || dayKey(at, zone) !== day) continue
        moments.set(p.id, at)
        if (own === undefined) late = late.filter((l) => l.id !== p.id)
        moved.push({ id: p.id, day })
        break
      }
      if ((onDay('feed').get(day) ?? 0) === 0) {
        report.push(`No feed post on ${dayWords(midnight, zone)}: no approved piece from a verified listing can go that day, so none is made (A1).`)
      }
    }
    if ((onDay('story').get(day) ?? 0) === 0) {
      report.push(`No story on ${dayWords(midnight, zone)}: no approved story's night falls that day, so none is made (A1).`)
    }
  }
  return { moments, late, moved, report }
}
