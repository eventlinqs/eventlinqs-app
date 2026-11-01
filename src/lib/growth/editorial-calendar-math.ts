/**
 * ONE EDITORIAL CALENDAR PER CITY: THE WEEK'S DRAFT, FROM VERIFIED EVENTS ONLY.
 *
 * The order: C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md section 5 ("Create one editorial calendar per active city.
 * Generate draft weekly guides and social content from verified event records ... Require review before publication.
 * Do not fabricate events") and its rhythm table (section 3B); the accepted plan C:\dev\GROWTH\growth-30-day-schedule.md
 * (b) 3, owner WINDOW 2: "a slot never holds an ended, cancelled or other-city event; an empty slot says so (no
 * filler)". One verified event database powers the guide, the newsletter and the social calendar, so every channel
 * reads these slots.
 *
 * PURE. ./editorial-calendar.ts reads the events (published, public, their venue's relation to the city from
 * venue_city_relation, 20261101160001) and hands them in; nothing here reads a database, so every rule is tested
 * without one.
 *
 * THE RULES, each the directive's own words for its day:
 *   mon  This week's events: every verified night Monday to Sunday.
 *   tue  Live music, nightlife and comedy: those three guide categories, Tuesday to Sunday.
 *   wed  Weekend planning guide: the coming weekend, the platform's one definition (Saturday and Sunday).
 *   thu  Five worthwhile things happening this weekend: the same weekend; at most five, one of each kind first.
 *   fri  Tonight and tomorrow: Friday and Saturday, the platform's own today and tomorrow window.
 *   sat  Real event coverage and community highlights: community, festivals, markets and family, Saturday and Sunday; coverage only where a
 *        night carries authorised media, because coverage is never invented.
 *   sun  Next week's preview and organiser spotlight: next Monday to Sunday, and the organiser with the most verified
 *        nights in it.
 * Every window comes from src/lib/events/listing-window.ts (startOfLocalDayUtcOffset, weekendWindowUtc,
 * todayAndTomorrowWindow) on the city's own clock: one definition of a day and of a weekend, never a second.
 * A night counts only when it is published, public, at a venue IN the city (never surrounding, region, outside or
 * unplaced), not over by the time the week is drafted, and starts inside the slot's window on the city's own clock.
 * The only limit is Thursday's five, because the directive says five; every other slot holds every night it finds.
 * Every slot is a DRAFT until a person approves it (the directive: review before publication).
 */

import type { GuideCategory } from '@/lib/categories/classify'
import { formatEventDateShort } from '@/lib/dates/event-time'
import { localDayOfWeek, startOfLocalDayUtcOffset, todayAndTomorrowWindow, weekendWindowUtc } from '@/lib/events/listing-window'
import { localDate } from '@/lib/walk-in/dates'

export type CityRelation = 'city' | 'surrounding' | 'region' | 'outside' | 'unplaced'

export interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly status: string
  readonly visibility: string
  readonly cityRelation: CityRelation
  readonly category: string | null
  readonly venueName: string | null
  readonly suburb: string | null
  readonly organiserId: string | null
  readonly organiserName: string | null
  /** A photograph or artwork whose rights are recorded as authorised; never assumed. */
  readonly hasAuthorisedMedia: boolean
}

export type SlotDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface Rhythm {
  readonly day: SlotDay
  readonly theme: string
  /** The window, from the week's Monday on the city's clock: two instants, both inclusive. */
  readonly window: (monday: Date, zone: string) => { from: Date; to: Date }
  /** The guide categories it holds; null is every kind. */
  readonly categories: ReadonlySet<string> | null
  /** What an empty slot says it found none of. */
  readonly noun: string
}

// The 15 guide categories only (src/lib/categories/classify.ts; law 13: the new system supersedes the old). Typed, so a
// retired slug cannot come back into a slot without failing the compile.
const NIGHT_OUT: ReadonlySet<string> = new Set<GuideCategory>(['music', 'nightlife', 'comedy'])
const COMMUNITY: ReadonlySet<string> = new Set<GuideCategory>(['community', 'festival', 'markets', 'family'])

/** Whole local days from the week's Monday, first to last inclusive. */
const days = (first: number, last: number) => (monday: Date, zone: string) => ({
  from: startOfLocalDayUtcOffset(monday, zone, first),
  to: new Date(startOfLocalDayUtcOffset(monday, zone, last + 1).getTime() - 1),
})
/** The platform's one weekend, as seen from the slot's own day. */
const weekendFrom = (offset: number) => (monday: Date, zone: string) => weekendWindowUtc(startOfLocalDayUtcOffset(monday, zone, offset), zone)

export const RHYTHM: readonly Rhythm[] = [
  { day: 'mon', theme: "This week's events", window: days(0, 6), categories: null, noun: 'events' },
  { day: 'tue', theme: 'Live music, nightlife and comedy', window: days(1, 6), categories: NIGHT_OUT, noun: 'live music, nightlife or comedy' },
  { day: 'wed', theme: 'Weekend planning guide', window: weekendFrom(2), categories: null, noun: 'events' },
  { day: 'thu', theme: 'Five worthwhile things happening this weekend', window: weekendFrom(3), categories: null, noun: 'events' },
  { day: 'fri', theme: 'Tonight and tomorrow', window: (monday, zone) => todayAndTomorrowWindow(startOfLocalDayUtcOffset(monday, zone, 4), zone), categories: null, noun: 'events' },
  { day: 'sat', theme: 'Real event coverage and community highlights', window: weekendFrom(5), categories: COMMUNITY, noun: 'community events' },
  { day: 'sun', theme: "Next week's preview and organiser spotlight", window: days(7, 13), categories: null, noun: 'events' },
]

export const FIVE_THINGS = 5

export interface Spotlight {
  readonly organiserId: string
  readonly organiserName: string | null
  readonly nights: number
}

export interface Slot {
  readonly day: SlotDay
  /** The slot's own date, YYYY-MM-DD on the city's clock. */
  readonly date: string
  readonly theme: string
  readonly status: 'draft'
  readonly windowFrom: string
  readonly windowTo: string
  readonly picks: readonly CalendarEvent[]
  /** Every night the slot's rule found, before Thursday's five. */
  readonly total: number
  /** Said when the slot found nothing; never filled. */
  readonly empty: string | null
  /** Saturday: the picks that carry authorised media, the only nights coverage may show. */
  readonly coverageReady: readonly CalendarEvent[]
  /** Sunday: the organiser with the most verified nights next week. */
  readonly spotlight: Spotlight | null
}

export interface DraftInput {
  readonly city: string
  readonly cityName: string
  readonly zone: string
  /** The Monday the week begins, YYYY-MM-DD on the city's clock. */
  readonly weekStart: string
  readonly events: readonly CalendarEvent[]
  readonly now: Date
}

/** An instant's date on the city's clock, YYYY-MM-DD (the shared helper; it answers for any valid instant). */
function dayOf(at: Date, zone: string): string {
  return localDate(at.toISOString(), zone) ?? ''
}

function verified(e: CalendarEvent, now: Date): boolean {
  if (e.status !== 'published' || e.visibility !== 'public' || e.cityRelation !== 'city') return false
  const over = new Date(e.endsAt ?? e.startsAt).getTime()
  return Number.isFinite(over) && over >= now.getTime()
}

function fiveThings(found: readonly CalendarEvent[]): CalendarEvent[] {
  const picked: CalendarEvent[] = []
  const kinds = new Set<string>()
  for (const e of found) {
    if (picked.length === FIVE_THINGS) break
    const kind = e.category ?? ''
    if (!kinds.has(kind)) {
      kinds.add(kind)
      picked.push(e)
    }
  }
  for (const e of found) {
    if (picked.length === FIVE_THINGS) break
    if (!picked.includes(e)) picked.push(e)
  }
  return [...picked].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

function spotlightOf(found: readonly CalendarEvent[]): Spotlight | null {
  const by = new Map<string, { name: string | null; nights: number; first: number }>()
  for (const e of found) {
    if (!e.organiserId) continue
    const s = by.get(e.organiserId) ?? { name: e.organiserName, nights: 0, first: Date.parse(e.startsAt) }
    s.nights += 1
    by.set(e.organiserId, s)
  }
  let best: Spotlight | null = null
  let bestFirst = Infinity
  for (const [organiserId, s] of by) {
    if (!best || s.nights > best.nights || (s.nights === best.nights && s.first < bestFirst)) {
      best = { organiserId, organiserName: s.name, nights: s.nights }
      bestFirst = s.first
    }
  }
  return best
}

/** The week's seven draft slots for one city. */
export function draftWeek(input: DraftInput): Slot[] {
  // Noon UTC of the named date is that same date on every Australian clock (UTC+8 to UTC+11), so its local midnight is
  // the week's Monday.
  const named = new Date(`${input.weekStart}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart) || Number.isNaN(named.getTime()) || localDayOfWeek(named, input.zone) !== 1) {
    throw new Error(`weekStart must be a Monday (YYYY-MM-DD), got '${input.weekStart}'`)
  }
  const monday = startOfLocalDayUtcOffset(named, input.zone, 0)
  const nights = input.events
    .filter((e) => verified(e, input.now))
    .map((e) => ({ e, at: Date.parse(e.startsAt) }))
    .sort((a, b) => a.at - b.at)
  return RHYTHM.map((r, i) => {
    const { from, to } = r.window(monday, input.zone)
    const windowFrom = dayOf(from, input.zone)
    const windowTo = dayOf(to, input.zone)
    const found = nights
      .filter(({ e, at }) => at >= from.getTime() && at <= to.getTime() && (r.categories === null || (e.category !== null && r.categories.has(e.category))))
      .map(({ e }) => e)
    const picks = r.day === 'thu' ? fiveThings(found) : found
    return {
      day: r.day,
      date: dayOf(startOfLocalDayUtcOffset(monday, input.zone, i), input.zone),
      theme: r.theme,
      status: 'draft' as const,
      windowFrom,
      windowTo,
      picks,
      total: found.length,
      empty: found.length === 0 ? `No verified ${r.noun} in ${input.cityName} from ${formatEventDateShort(from.toISOString(), input.zone)} to ${formatEventDateShort(to.toISOString(), input.zone)}.` : null,
      coverageReady: r.day === 'sat' ? picks.filter((e) => e.hasAuthorisedMedia) : [],
      spotlight: r.day === 'sun' ? spotlightOf(found) : null,
    }
  })
}
