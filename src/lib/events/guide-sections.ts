import type { DirectoryRow } from './whats-on-directory'
import { addDaysKey, addMonthsKey, dayNameOfKey } from '@/lib/dates/wall-day-keys'
import { HEADLINE_VENUES, byRelevance, tierOf, type Tier } from './relevance'

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

/** Law 18: a guide row's tier (src/lib/events/relevance.ts), from its own fields. */
export function rowTier(r: DirectoryRow): Tier {
  return tierOf({ title: r.title, venue: r.venue, categorySlug: r.categorySlug, ticketed: r.format === 'ticketed' && !r.free })
}

/** Tier, then the soonest (law 18): every rail but Big nights and the month list. */
export const relevanceFirst = byRelevance<DirectoryRow>(rowTier, (r) => r.ts)

export function isBigNight(r: DirectoryRow): boolean {
  // Law 18 (Lawal, 4 November 2026, 15:12): 'you can't be on the big night without images ... No matter how big you
  // are, you must supply your image'. No permitted photograph, no Big nights, whatever the size; never tier 4.
  if (!r.thumb || rowTier(r) === 4) return false
  const atBigVenue = BIG_VENUES.some((v) => v.test(r.venue ?? '')) || HEADLINE_VENUES.some((v) => v.test(r.venue ?? ''))
  if (atBigVenue && r.format === 'ticketed' && !r.free) return true
  // A FESTIVAL ITS ORGANISER LISTED WITH US, however it is entered (round 5 fault 2): the booking label alone left out
  // every free, walk in festival ('Free · Walk in' is not 'Book on EventLinqs'), AMCF at Fed Square among them.
  return r.categorySlug === 'festival' && (OUR_OWN.test(r.source) || r.own === true)
}
// Big nights ranks PHOTO FIRST, then date, and nothing else (Lawal, 3 November 2026, 12:29, through the CONTROLLER's
// 12:31: a show without a permitted photograph is not forced in; featuring is what an organiser gains by sending photos).

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
  // Law 18: Big nights by headline weight (the tier) then date; Just announced and This weekend by tier then date and
  // never tier 4; Free and community and Further ahead by tier then date, tier 4 last; the month list in date order with
  // tier 4 at the end of each month (monthOrder, byMonth).
  const big = take(rows.filter(isBigNight), 3, relevanceFirst)
  const announced = take(
    rows.filter((r) => rowTier(r) !== 4 && typeof r.listedAt === 'number' && nowMs - r.listedAt <= JUST_ANNOUNCED_DAYS * 24 * 60 * 60 * 1000),
    8,
    relevanceFirst,
  )
  const weekend = take(rows.filter((r) => rowTier(r) !== 4 && days.weekendKeys.includes(r.dayKey)), 8, relevanceFirst)
  const free = take(rows.filter((r) => r.free && r.dayKey <= threeEnd), 6, relevanceFirst)
  const soon = take(rows.filter((r) => r.dayKey > threeEnd), 6, relevanceFirst)
  const rest = monthOrder(foldListings(rows.filter((r) => r.dayKey <= threeEnd && !shown.has(listingKey(r))), rows))
  return { big, announced, weekend, free, soon, rest }
}

/**
 * THE MONTH LIST'S ORDER (law 18, the spec's rule 5): by month, and inside each month tiers 1 to 3 in date order, then
 * tier 4 in date order. The list pages 20 at a time in this order, so a month's tier 4 always follows its others.
 */
export function monthOrder(entries: readonly Entry[]): Entry[] {
  const last = (e: Entry) => (rowTier(e.row) === 4 ? 1 : 0)
  return [...entries].sort((a, b) => a.row.dayKey.slice(0, 7).localeCompare(b.row.dayKey.slice(0, 7)) || last(a) - last(b) || a.row.ts - b.row.ts)
}

/** The one fold that holds a month's tier 4 (the spec's rule 5, its words). */
export const LATER_FOLD = 'Also this month: family, library and community sessions'

/** Month headings for the browse list ('November 2026'), in date order; each month's tier 4 apart, under LATER_FOLD. */
export function byMonth(entries: readonly Entry[]): { key: string; label: string; entries: Entry[]; later: Entry[] }[] {
  const groups = new Map<string, { entries: Entry[]; later: Entry[] }>()
  for (const e of [...entries].sort((a, b) => a.row.ts - b.row.ts)) {
    const k = e.row.dayKey.slice(0, 7)
    const g = groups.get(k) ?? { entries: [], later: [] }
    ;(rowTier(e.row) === 4 ? g.later : g.entries).push(e)
    groups.set(k, g)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      entries: g.entries,
      later: g.later,
    }))
}

/** A row's 'when' line, read in gold caps: 'Fri 6 Nov · 7:30 pm', or 'Every Saturday · 9:00 am'. */
/**
 * '+N more dates' for a listing with further nights, the one wording every surface prints beside its first night: the browse
 * row, the section cards and Big nights (round 3's 'else +N more dates'). The cards once printed only the first night, so The
 * Little Mermaid read 'Fri 6 Nov · 7:00 pm' on /city/geelong with five more shows listed (the CONTROLLER's 20:28 of 6 November).
 */
export function moreDatesLine(e: Pick<Entry, 'more' | 'every'>): string | null {
  return e.more > 0 ? `+${e.more} more ${e.more === 1 ? 'date' : 'dates'}` : null
}

export function whenLine(e: Entry): string {
  const day =
    e.every ??
    new Date(`${e.row.dayKey}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  return e.row.time ? `${day} · ${e.row.time}` : day
}

/** The browse list shows 20 entries, then 'Show more' adds 20 (item 5: never an endless scroll that pretends to load). */
export const PAGE = 20
