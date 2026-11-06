import { tierOf } from '@/lib/events/relevance'

/**
 * THE PICK RANKING FOR EVERY SOCIAL POST (Lawal, 07:55 on 7 November 2026, through the CONTROLLER's 07:58: 'the hierarchy of
 * every night show, the hit shows, the best shows, not just listings ... it has to be bangers. The one with the most crowd has
 * to top the list. You cannot just be random.'). No post (Tonight Story, weekend carousel, 3 Free) is filled in listing
 * order again: it is filled from this ranked list, each pick with its reasons. Pure, from what the engine already stores:
 *   CROWD FIRST, in Lawal's own words ('The one with the most crowd has to top the list'): the venue's class, stadium over
 *          arena over a festival over a theatre or hall over the rest (src/lib/events/relevance.ts's headline venues, split
 *          by size). The CONTROLLER's 07:58 named demand the heaviest weight; where the two differ, Lawal's words rank.
 *   DEMAND, the heaviest of the rest: the night is sold out (the daily link check's availability). It reorders nights of
 *          one class, never across classes: each class stands further above the next than a sell out adds.
 *   PULL: the relevance tier (ticketed at a headline venue first).
 *   ONE-OFF over long runs: the fewer nights its listing runs, the more it counts.
 *   FIT FOR THE POST: Tonight is a night out (gigs, club nights, comedy, festivals, big sport): never a children's show, a
 *          family event, or a matinee (starting before 5 pm); Free is free nights only (a family event may be there, still
 *          ranked by draw); tier 4 (library sessions, story time, classes) is never picked.
 *   THE FLOOR: under PICK_FLOOR a night never makes a post; if only two clear it, the post carries two.
 * Signals not stored yet, named for collecting: 'selling fast' and 'final release' words on the ticket page, extra shows
 * added (a night first seen after its run began), the act's pull (a touring headliner, follower counts), venue capacities.
 * Every pick still passes the accuracy gate first: the caller passes only nights that are published and not held.
 */

export type PostKind = 'tonight' | 'weekend' | 'free'
export type PickInput = {
  id: string
  title: string
  venue: string | null
  categorySlug: string | null
  ticketed: boolean
  free: boolean
  startsAt: string
  zone: string
  soldOut: boolean
  /** How many upcoming nights its listing runs: one is a one-off. */
  nightsInListing: number
}
export type Pick = { id: string; title: string; score: number; reasons: string[] }

export const PICK_FLOOR = 20

const STADIUM = /\b(gmhba stadium|kardinia park|mcg|melbourne cricket ground|marvel stadium|aami park|geelong racecourse|flemington|melbourne showgrounds|mt\.? duneed|mount duneed)\b/i
const ARENA = /\b(rod laver arena|john cain arena|margaret court arena|sidney myer music bowl|festival hall|palais theatre|forum melbourne)\b|^the forum\b/i
const HALL = /\b(hamer hall|arts centre melbourne|regent theatre|her majesty'?s|princess theatre|comedy theatre|athenaeum|melbourne recital centre|costa hall|geelong arts centre|the play ?house|ulumbarra|the capital)\b/i
const NIGHT_OUT = new Set(['music', 'sports', 'comedy', 'nightlife', 'festival', 'theatre'])

const hourIn = (iso: string, zone: string) => Number(new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)))

export function rankPicks(events: readonly PickInput[], kind: PostKind): Pick[] {
  const picks: Pick[] = []
  for (const e of events) {
    const tier = tierOf({ title: e.title, venue: e.venue, categorySlug: e.categorySlug, ticketed: e.ticketed })
    if (tier === 4) continue
    if (kind === 'free' && !e.free) continue
    if (kind === 'tonight' && (!NIGHT_OUT.has(e.categorySlug ?? '') || e.categorySlug === 'family' || hourIn(e.startsAt, e.zone) < 17)) continue
    const reasons: string[] = []
    let score = 0
    const venue = e.venue ?? ''
    if (STADIUM.test(venue)) {
      score += 60
      reasons.push(`a stadium crowd (${venue})`)
    } else if (ARENA.test(venue)) {
      score += 45
      reasons.push(`an arena crowd (${venue})`)
    } else if (e.categorySlug === 'festival') {
      score += 30
      reasons.push('a festival crowd')
    } else if (HALL.test(venue)) {
      score += 18
      reasons.push(`a major theatre or hall (${venue})`)
    }
    if (e.soldOut) {
      score += 10
      reasons.push('sold out: demand')
    }
    if (tier === 1) {
      score += 6
      reasons.push('ticketed at a headline venue')
    } else if (tier === 2) {
      score += 3
      // Tier 2 is every other ticketed night AND a free festival or community event: the reason says which.
      reasons.push(e.ticketed ? 'a ticketed night' : 'a free festival or community event')
    }
    if (e.nightsInListing <= 1) {
      score += 6
      reasons.push('one night only')
    } else if (e.nightsInListing <= 3) score += 3
    if (score >= PICK_FLOOR) picks.push({ id: e.id, title: e.title, score, reasons })
  }
  return picks.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}
