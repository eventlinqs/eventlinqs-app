/**
 * LAW 18, RELEVANCE ORDER (Lawal, 4 November 2026, 15:12 and 15:25; the CONTROLLER's 15:20, 15:30 and 15:40; the spec,
 * researched on the leaders: C:\dev\GROWTH\RELEVANCE-ORDER-4NOV.md). "What's on is the highlight of the cities ...
 * prioritized ... by how big the events are ... the little events are the least prioritized ... mommy in the library ...
 * That comes last."
 *
 * Four tiers, read from the listing's own fields only (ticketed or free, its venue, its category, the words of its
 * title), never from a hand list of events:
 *   1  ticketed at a headline venue (a stadium, arena, estate, major theatre or concert hall), and a ticketed festival;
 *   2  every other ticketed night (music, comedy, theatre, sport, nightlife ...), and a free festival or community festival
 *      (AMCF at Federation Square);
 *   3  markets and community events, and every other free night;
 *   4  LAST: library sessions, story time, toddler and baby sessions, meetups, classes, workshops, support groups.
 * Tier 4 is never in Big nights, Just announced or This weekend; it stays findable in the month list and under All
 * dates (law 16), at the end of its month.
 *
 * The leaders, read live on 4 November (the spec): Ticketmaster ranks rails by popularity above an 'All Events' list in
 * date order; the City of Melbourne's What's On keeps family and kids sessions in their own rail low on the page.
 */

/**
 * The headline venues: the CONTROLLER's 15:20 for Geelong (GMHBA Stadium, Costa Hall and Geelong Arts Centre, Mt Duneed
 * Estate, Geelong Racecourse, Wurdi Youang) and 15:30 for Melbourne, and round 3's big venues (src/lib/events/
 * guide-sections.ts BIG_VENUES) for Ballarat and Bendigo. A venue is matched by its own name, as the listing states it.
 */
export const HEADLINE_VENUES: readonly RegExp[] = [
  // Geelong
  /\bgmhba stadium\b|\bkardinia park\b/i,
  /\bcosta hall\b/i,
  /\bgeelong arts centre\b/i,
  /\bthe play ?house\b/i,
  /\bmt\.? duneed\b|\bmount duneed\b/i,
  /\bgeelong racecourse\b/i,
  /\bwurdi youang\b/i,
  // Melbourne
  /\brod laver arena\b/i,
  /\bmargaret court arena\b/i,
  /\bjohn cain arena\b/i,
  /\bmelbourne park\b/i,
  /\bmcg\b|\bmelbourne cricket ground\b/i,
  /\bmarvel stadium\b/i,
  /\baami park\b/i,
  /\bsidney myer music bowl\b/i,
  /\bpalais theatre\b/i,
  /\bforum melbourne\b|^the forum\b|^forum\b/i,
  /\bfestival hall\b/i,
  /\bhamer hall\b/i,
  /\barts centre melbourne\b/i,
  /\bregent theatre\b/i,
  /\bher majesty'?s\b/i,
  /\bprincess theatre\b/i,
  /\bcomedy theatre\b/i,
  /\bathenaeum\b/i,
  /\bmelbourne recital centre\b/i,
  /\bfed(eration)? square\b/i,
  /\bflemington\b/i,
  /\bmelbourne showgrounds\b/i,
  // Ballarat and Bendigo (round 3)
  /\bulumbarra\b/i,
  /\bthe capital\b/i,
]

/** The words that make a night tier 4, in its title, or its venue being a library. */
const TIER_FOUR_TITLE =
  /\b(story ?time|rhyme ?time|toddlers?|bab(y|ies)|playgroups?|meet-?ups?|class(es)?|workshops?|support groups?|homework club|book club|knit(ting)?|craft (session|club|group)|tech help|digital help|conversation (club|group|practice)|walking group|mums?|parents? group)\b/i
const LIBRARY = /\blibrar(y|ies)\b/i

export type Tier = 1 | 2 | 3 | 4

export type RelevanceFields = {
  readonly title: string
  readonly venue: string | null
  readonly categorySlug: string | null
  /** Sold by ticket, paid: our checkout or another site's. */
  readonly ticketed: boolean
}

export function isHeadlineVenue(venue: string | null): boolean {
  return HEADLINE_VENUES.some((v) => v.test((venue ?? '').trim()))
}

export function tierOf(r: RelevanceFields): Tier {
  const festival = r.categorySlug === 'festival'
  if (r.ticketed && (isHeadlineVenue(r.venue) || festival)) return 1
  if (LIBRARY.test(r.venue ?? '') || TIER_FOUR_TITLE.test(r.title) || r.categorySlug === 'classes-workshops') return 4
  if (r.ticketed || festival) return 2
  return 3
}

/** Tier first, then the soonest: every rail but the month list. */
export function byRelevance<T>(tier: (x: T) => Tier, at: (x: T) => number): (a: T, b: T) => number {
  return (a, b) => tier(a) - tier(b) || at(a) - at(b)
}
