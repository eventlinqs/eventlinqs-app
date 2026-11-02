import type { DirectoryRow } from './whats-on-directory'
import { addDaysKey, addMonthsKey, dayNameOfKey } from '@/lib/dates/wall-day-keys'

/**
 * ROUND 3, LOCKED BY LAWAL (2 November 2026, 17:00, 17:07 and 17:10; C:\dev\DESIGN\CITY-FIRST-1NOV\ROUND3-LOCKED\
 * ROUND3-DIRECTIVE-2NOV.md). The city guide's sections, chosen by stated rules from the city's own rows, never paid:
 *   Big nights (up to 3), Just announced, This weekend, Free and community, Further ahead, then the browse list.
 * NO EVENT APPEARS TWICE ON ONE PAGE: a listing (one title at one venue, eventKey) shown in a section is left out of every
 * section and of the list after it. A RECURRING LISTING IS ONE ENTRY: its first night, with 'Every <day>' where its
 * nights are weekly, else '+N more dates'. NO EVENT IS EVER HIDDEN BY DISTANCE (rule (a)): Big nights, Just announced
 * and Further ahead read every row whatever its date, and 'All dates' lists them all; only the default browse list opens
 * on the next 3 months (rule (b)).
 * Wall days are 'YYYY-MM-DD' keys in the city's zone, as the rows carry them.
 */

/** One listing: its title at its venue, trimmed, any case (round 2's one definition of an event). */
export function listingKey(r: Pick<DirectoryRow, 'title' | 'venue'>): string {
  return `${r.title.trim().toLowerCase()}|${(r.venue ?? '').trim().toLowerCase()}`
}

export { addDaysKey, addMonthsKey }

/** The browse list's ranges. 'three' is the default (Lawal 17:10, rule (b)). */
export type Range = 'today' | 'weekend' | 'week' | 'month' | 'three' | 'all' | 'date'
export type GuideDays = { todayKey: string; weekendKeys: readonly string[]; weekKeys: readonly string[] }

export function inRange(r: Pick<DirectoryRow, 'dayKey'>, range: Range, days: GuideDays, date = ''): boolean {
  switch (range) {
    case 'all':
      return true
    case 'today':
      return r.dayKey === days.todayKey
    case 'weekend':
      return days.weekendKeys.includes(r.dayKey)
    case 'week':
      return days.weekKeys.includes(r.dayKey)
    case 'month':
      return r.dayKey >= days.todayKey && r.dayKey <= addDaysKey(days.todayKey, 31)
    case 'three':
      return r.dayKey >= days.todayKey && r.dayKey <= addMonthsKey(days.todayKey, 3)
    case 'date':
      return r.dayKey === date
  }
}

/**
 * BIG NIGHTS, THE STATED RULE (item 1): a ticketed, paid night at one of the named big venues, or a festival its organiser
 * listed with us. Never paid placement; nothing here reads money.
 */
export const BIG_VENUES: readonly RegExp[] = [
  /\bcosta hall\b/i,
  /\bthe play ?house\b/i,
  /\bgmhba stadium\b/i,
  /\bmt\.? duneed\b|\bmount duneed\b/i,
  /\bgeelong arts centre\b/i,
  /\bher majesty'?s\b/i,
  /\bulumbarra\b/i,
  /\bthe capital\b/i,
  /\bforum melbourne\b/i,
  /\bcomedy republic\b/i,
  /\bthe comic'?s lounge\b/i,
]
const OUR_OWN = /^(Book|Register) on EventLinqs$/

export function isBigNight(r: DirectoryRow): boolean {
  const atBigVenue = BIG_VENUES.some((v) => v.test(r.venue ?? ''))
  if (atBigVenue && r.format === 'ticketed' && !r.free) return true
  return r.categorySlug === 'festival' && OUR_OWN.test(r.source)
}

/** Photo first, then the soonest (items 1 and 2: 'events with a permitted photograph rank first, then by date'). */
export function photoFirst(a: DirectoryRow, b: DirectoryRow): number {
  return Number(Boolean(b.thumb)) - Number(Boolean(a.thumb)) || a.ts - b.ts
}

/** One entry per listing: its first night, how many more it has, and 'Every <day>' where three or more fall a week apart. */
export type Entry = { readonly row: DirectoryRow; readonly more: number; readonly every: string | null }

export function foldListings(rows: readonly DirectoryRow[], all: readonly DirectoryRow[] = rows): Entry[] {
  const nights = new Map<string, DirectoryRow[]>()
  for (const r of all) nights.set(listingKey(r), [...(nights.get(listingKey(r)) ?? []), r])
  const firsts = new Map<string, DirectoryRow>()
  for (const r of [...rows].sort((a, b) => a.ts - b.ts)) if (!firsts.has(listingKey(r))) firsts.set(listingKey(r), r)
  return [...firsts.values()].map((row) => {
    const own = [...(nights.get(listingKey(row)) ?? [row])].sort((a, b) => a.ts - b.ts).filter((r) => r.ts >= row.ts)
    const keys = [...new Set(own.map((r) => r.dayKey))]
    const weekly =
      keys.length >= 3 &&
      keys.every((k, i) => i === 0 || addDaysKey(keys[i - 1], 7) === k)
    return {
      row,
      more: own.length - 1,
      every: weekly ? `Every ${dayNameOfKey(row.dayKey)}` : null,
    }
  })
}

export const JUST_ANNOUNCED_DAYS = 14

export type GuideSections = {
  readonly big: Entry[]
  readonly announced: Entry[]
  readonly weekend: Entry[]
  readonly free: Entry[]
  readonly soon: Entry[]
  /** The browse list under the sections: every listing in the next 3 months that no section above has shown. */
  readonly rest: Entry[]
}

/**
 * The sections in the order the page draws them, each taking from the listings no earlier section showed. `nowMs` is
 * read once per render by the caller.
 */
export function guideSections(rows: readonly DirectoryRow[], days: GuideDays, nowMs: number): GuideSections {
  const shown = new Set<string>()
  const take = (pick: readonly DirectoryRow[], cap: number, order: (a: DirectoryRow, b: DirectoryRow) => number = photoFirst) => {
    const entries = foldListings(pick.filter((r) => !shown.has(listingKey(r))), rows)
      .sort((a, b) => order(a.row, b.row))
      .slice(0, cap)
    for (const e of entries) shown.add(listingKey(e.row))
    return entries
  }
  const threeEnd = addMonthsKey(days.todayKey, 3)
  const big = take(rows.filter(isBigNight), 3)
  const announced = take(
    rows.filter((r) => typeof r.listedAt === 'number' && nowMs - r.listedAt <= JUST_ANNOUNCED_DAYS * 24 * 60 * 60 * 1000),
    8,
  )
  const weekend = take(rows.filter((r) => days.weekendKeys.includes(r.dayKey)), 8)
  const free = take(rows.filter((r) => r.free && r.dayKey <= threeEnd), 6)
  const soon = take(rows.filter((r) => r.dayKey > threeEnd), 6)
  const rest = foldListings(rows.filter((r) => r.dayKey <= threeEnd && !shown.has(listingKey(r))), rows)
  return { big, announced, weekend, free, soon, rest }
}

/** Month headings for the browse list ('November 2026'), in date order. */
export function byMonth(entries: readonly Entry[]): { key: string; label: string; entries: Entry[] }[] {
  const groups = new Map<string, Entry[]>()
  for (const e of [...entries].sort((a, b) => a.row.ts - b.row.ts)) {
    const k = e.row.dayKey.slice(0, 7)
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    entries: list,
  }))
}

/** A row's 'when' line, read in gold caps: 'Fri 6 Nov · 7:30 pm', or 'Every Saturday · 9:00 am'. */
export function whenLine(e: Entry): string {
  const day =
    e.every ??
    new Date(`${e.row.dayKey}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  return e.row.time ? `${day} · ${e.row.time}` : day
}

/** The browse list shows 20 entries, then 'Show more' adds 20 (item 5: never an endless scroll that pretends to load). */
export const PAGE = 20
