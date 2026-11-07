/**
 * THE DAILY BIG EVENT HUNT'S LIST (car 44; Lawal's ruling of 4 November 2026, 15:12, through the CONTROLLER's 15:20,
 * 15:30 and 22:25b: 'every day ... it reads the What's on pages of each city's headline venues and promoters ... adds
 * any new public ticketed event with our own words and the seller's ticket link, never copying text or photos and never
 * reading Eventbrite pages'; Melbourne and Geelong first, together, then Ballarat and Bendigo; 05:00 and 15:00 Melbourne
 * time).
 *
 * A source on this list is a headline venue's OWN What's on page, registered in listing_sources like any other (its
 * robots.txt and terms quoted there, facts and links only). A night it states AT ITS OWN VENUE, found with high
 * confidence, is listed without a person, as Lawal ruled ('Make sure this is not something I'm doing daily', the
 * CONTROLLER's 15:50); a night it states anywhere else, or with any doubt, waits for a person as every other find does.
 *
 * Which venue a page speaks for is written here, by its host, because a page cannot be trusted to say so itself. The
 * category comes from the night's own words (src/lib/categories/classify.ts); a venue's usual category stands only when
 * its words give none, as a source's category does for a partner.
 */
import { classify, type GuideCategory } from '@/lib/categories/classify'
import { wallClockToIso } from './collect'

/**
 * A HUNTED NIGHT'S CATEGORY (class O, read from production on 7 November 2026). A title naming two sides ('A vs B', 'A v B')
 * is a match, so sport, whatever the venue: the hunt took the venue's usual category when the classifier could not read a
 * title, and listed seven Melbourne United and South East Melbourne Phoenix games at John Cain Arena as Music. Otherwise
 * the classifier's reading, then the venue's usual category, as before. Two sides are a match only at a sporting venue:
 * 'Grease vs Rocky Horror Show' is a musical (read from production, 7 November 2026, 11:16). Pure.
 */
const SPORTING_VENUE = /\b(arena|stadium|ground|oval|park|racecourse)\b/i
export function huntCategory(title: string, usual: GuideCategory, venue: string): GuideCategory {
  if (SPORTING_VENUE.test(venue) && /\s(?:vs\.?|v)\s/i.test(` ${title} `)) return 'sports' as GuideCategory
  return (classify({ title }).primary as GuideCategory | null) ?? usual
}

export type HuntSource = {
  /** The register's page, by host (without www) and path start. */
  readonly host: string
  readonly citySlug: 'melbourne' | 'geelong' | 'ballarat' | 'bendigo'
  /** The venue names this page speaks for, as EventLinqs holds them (public.venues.name). */
  readonly venues: readonly string[]
  readonly usualCategory: GuideCategory
}

export const HUNT_SOURCES: readonly HuntSource[] = [
  // Melbourne (the CONTROLLER's 15:30): the arenas and the stadium on one platform (page-rules-melbourne.ts).
  { host: 'rodlaverarena.com.au', citySlug: 'melbourne', venues: ['Rod Laver Arena'], usualCategory: 'music' },
  { host: 'johncainarena.com.au', citySlug: 'melbourne', venues: ['John Cain Arena'], usualCategory: 'music' },
  { host: 'margaretcourtarena.com.au', citySlug: 'melbourne', venues: ['Margaret Court Arena'], usualCategory: 'music' },
  { host: 'aamipark.com.au', citySlug: 'melbourne', venues: ['AAMI Park'], usualCategory: 'sports' },
  // Car 44b (the CONTROLLER's 01:05 of 5 November 2026): Forum Melbourne, its own list page (page-rules-melbourne.ts).
  { host: 'forummelbourne.com.au', citySlug: 'melbourne', venues: ['Forum Melbourne'], usualCategory: 'music' },
  // Geelong (the CONTROLLER's 15:20): the stadium and the estate, both already read sources.
  { host: 'kardiniapark.vic.gov.au', citySlug: 'geelong', venues: ['GMHBA Stadium', 'Kardinia Park Precinct'], usualCategory: 'sports' },
  { host: 'adayonthegreen.com.au', citySlug: 'geelong', venues: ['Mt Duneed Estate'], usualCategory: 'music' },
  // Car 44b: Geelong Arts Centre, its event sitemap (page-rules.ts), the venue from each show's own Venue block.
  { host: 'geelongartscentre.org.au', citySlug: 'geelong', venues: ['Costa Hall', 'The Play House', 'The Story House', 'Geelong Arts Centre'], usualCategory: 'theatre' },
  // Car 44b, the rest of the 01:05 list that reads cleanly (page-rules-melbourne.ts).
  { host: 'mcg.org.au', citySlug: 'melbourne', venues: ['Melbourne Cricket Ground'], usualCategory: 'sports' },
  { host: 'palaistheatre.com.au', citySlug: 'melbourne', venues: ['Palais Theatre'], usualCategory: 'music' },
  { host: 'festivalhall.com.au', citySlug: 'melbourne', venues: ['Festival Hall'], usualCategory: 'music' },
  { host: 'melbournerecital.com.au', citySlug: 'melbourne', venues: ['Melbourne Recital Centre'], usualCategory: 'music' },
  { host: 'fedsquare.com', citySlug: 'melbourne', venues: ['Federation Square'], usualCategory: 'community' },
  // Ballarat: Her Majesty's and the Civic Hall on one page (page-rules-ballarat.ts).
  { host: 'hermaj.com', citySlug: 'ballarat', venues: ["Her Majesty's Theatre Ballarat", 'Civic Hall Ballarat'], usualCategory: 'theatre' },
]

const MELBOURNE_HOUR = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' })

/**
 * A START THE HUNT MAY LIST BY ITS RULE (car 44c; the CONTROLLER's 14:55 of 5 November 2026: the arenas' nights showed on
 * live at 6:30 am, 'No concert or match starts at 6 am'). A headline venue's night that starts between midnight and 9 am
 * in Melbourne is almost always a time read wrong, so it waits for a person; it is never listed by the rule.
 */
export function plausibleHuntStart(startsAt: string): boolean {
  const t = new Date(startsAt)
  if (Number.isNaN(t.getTime())) return false
  return Number(MELBOURNE_HOUR.format(t)) >= 9
}

/** The kind of night, in our own words, by its guide category. */
const KIND_LINE: Readonly<Record<GuideCategory, string>> = {
  music: 'A live concert',
  sports: 'A live match',
  comedy: 'Live stand-up comedy',
  theatre: 'A stage show',
  festival: 'A festival day',
  family: 'A family show',
  'arts-community': 'An arts event',
  nightlife: 'A club night',
  markets: 'A market',
  'food-drink': 'A food and drink event',
  'classes-workshops': 'A class',
  'business-networking': 'A networking event',
  'health-wellness': 'A wellness session',
  education: 'A talk',
  community: 'A community event',
}
const MELBOURNE_WEEKDAY = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' })

/**
 * THE HUNTED NIGHT'S ONE LINE (car 44c; the CONTROLLER's 14:55 (4): 'a one line description in our own words like every
 * other row'). Composed only from the night's own facts, never the source's words: its kind (its guide category), its day
 * and part of the day in Melbourne, and where it is booked. It always leaves five words past the title, the venue and
 * the city, so the row shows it (rowTeaser, src/lib/events/whats-on-directory.ts).
 */
export function huntSummary(night: { categorySlug: string | null; startsAt: string; seller: string | null; free: boolean }): string {
  const t = new Date(night.startsAt)
  const hour = Number(MELBOURNE_HOUR.format(t))
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  /* The kind only when the night's OWN words give it (classify on its title): a venue's usual category is a guess, and a
     guess made 'A live concert' of WWE and of a stand-up comedian (5 November 2026). Otherwise 'An event', which is true. */
  const kind = (night.categorySlug ? KIND_LINE[night.categorySlug as GuideCategory] : null) ?? 'An event'
  const where = night.free ? ', free entry' : night.seller ? `, tickets through ${night.seller}` : ''
  return `${kind} on a ${MELBOURNE_WEEKDAY.format(t)} ${part}${where}.`
}

/** Pages a hunt run reads per site (car 44b): every site on the list fits its two daily runs; the daily collection run
 * still reads each site up to PAGE_READ_CAP. */
export const HUNT_PAGE_CAP = 40

/**
 * THE HUNT'S ORDER (car 44b): every hunt source is due at each hunt run, the one read longest ago first, so a source a
 * run's time ran out before is read first by the next instead of never (the run reads its sources one after another).
 */
export function huntOrder<S extends { hunt?: HuntSource | null; lastCheckedAt: string | null }>(sources: readonly S[]): S[] {
  const at = (s: S) => (s.lastCheckedAt === null ? -Infinity : new Date(s.lastCheckedAt).getTime())
  return sources
    .filter((s) => s.hunt)
    .sort((a, b) => at(a) - at(b))
    .map((s) => ({ ...s, lastCheckedAt: null }))
}

/** The hunt entry a registered page belongs to, by its host; null for every other source. */
export function huntFor(pageUrl: string): HuntSource | null {
  let host: string
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  return HUNT_SOURCES.find((h) => h.host === host) ?? null
}

/** Folded for matching: case, accents and punctuation aside, and 'Mount' read as 'Mt' (the CONTROLLER's 01:05 of 5 November
 * 2026: Mt Duneed Estate is held as 'Mt', its page states 'Mount'). */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bmount\b/g, 'mt')

/** The reasons that still hold a hunt night for a person: a likely duplicate, a called off show, a time likely not stated,
 * and a page the register has not verified. */
export const HUNT_HOLDS = [
  'similar_listing', 'called_off_words', 'midnight_start', 'source_unverified',
  // ENGINE P0, the publication gate (LAW 19 section 4): a time not to be trusted is never published by the rule.
  'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span',
] as const

/**
 * THE CORRECTION RUN'S VERDICT ON ONE STORED NIGHT (car 46; the independent review's test 7). Against the starts the
 * night's own page states now (read by the fixed readers): 'right' when it states the stored start; 'move' when it
 * states the stored UTC clock as Melbourne's clock (the false offset fault), to that instant; else 'hold' (the series is
 * paused, never guessed). The stored night is corrected in place, so no second series is ever made beside it. Pure.
 */
export function correctionDecision(stored: string, pageStarts: ReadonlySet<string>, status: number | null): { kind: 'right' | 'move' | 'hold'; to: string | null } {
  if (status !== 200) return { kind: 'hold', to: null }
  const at = new Date(stored)
  if (pageStarts.has(at.toISOString())) return { kind: 'right', to: null }
  const to = wallClockToIso(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes(), 0, 'Australia/Melbourne')
  if (to && pageStarts.has(new Date(to).toISOString())) return { kind: 'move', to: new Date(to).toISOString() }
  return { kind: 'hold', to: null }
}

/**
 * A LIKELY DUPLICATE (the CONTROLLER's 01:05 of 5 November 2026): a night EventLinqs already lists in the same city with the
 * same title (folded, Mt and Mount alike) on the same day, at any venue, whatever words its venue is given in.
 */
export function likelyDuplicate(
  night: { title: string; startsAt: string },
  known: readonly { title: string; startsAt: string; citySlug?: string | null }[],
  citySlug: string,
  dayOf: (iso: string) => string,
): boolean {
  const title = fold(night.title)
  const day = dayOf(night.startsAt)
  return known.some((k) => (k.citySlug ?? citySlug) === citySlug && fold(k.title) === title && dayOf(k.startsAt) === day)
}

/**
 * WHAT THE HUNT DOES WITH A NIGHT'S EXISTING CANDIDATE (car 44b; the CONTROLLER's 01:05 of 5 November 2026: 'For review ends
 * for these sources'). One the hunt's rule accepted and has not published is published. One that has waited for a person
 * since before the hunt read its page (GMHBA Stadium's four of 2 November) is decided by the rule now, when the rule accepts
 * it today at high confidence (the only way the database lets the rule decide, listing_candidates_decided_by). A night a
 * person refused, or one already published, is left.
 */
export function huntDecision(
  existing: { status: string; decided_by: string; published_series_id: string | null } | null,
  row: { decidedBy: string; confidence: string; kind: string },
): 'publish' | 'promote' | 'leave' {
  if (!existing || existing.published_series_id) return 'leave'
  if (existing.decided_by === 'partner_rule') return existing.status === 'accepted' ? 'publish' : 'leave'
  return existing.status === 'waiting' && row.decidedBy === 'partner_rule' && row.confidence === 'high' && row.kind === 'new' ? 'promote' : 'leave'
}

/** The held venue name a night's own venue words name, when it is one this page speaks for; else null. */
export function huntVenue(hunt: HuntSource, venueName: string): string | null {
  const v = fold(venueName)
  return hunt.venues.find((name) => v === fold(name) || v.startsWith(`${fold(name)} `) || (v.length > 6 && fold(name).startsWith(`${v} `))) ?? null
}
