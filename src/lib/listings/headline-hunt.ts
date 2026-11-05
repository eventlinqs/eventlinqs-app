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
import type { GuideCategory } from '@/lib/categories/classify'

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
export const HUNT_HOLDS = ['similar_listing', 'called_off_words', 'midnight_start', 'source_unverified'] as const

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
