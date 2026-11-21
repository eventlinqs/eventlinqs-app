/**
 * SEARCH REACH: EVERY LIVE EVENT IS FOUND BY WHAT ITS OWN PAGE SHOWS (the PM's order of 22 November 2026, 05:25,
 * guard A; Lawal, 05:08: "This can never break").
 *
 * THE DEFECT THAT SET IT. www.eventlinqs.com.au/events?q=asia+oasis answered 'No results' while Colours of Asia, whose
 * page says 'Organised by Asia Oasis', ran that day: a listing's host lives in events.metadata.host_name (listingHost),
 * search read the ORGANISATION's name, and a listing's organisation is the listings organisation, which no page shows.
 * What a page shows and what search reads were two sources.
 *
 * THE RULE. Each published, not ended event is searched three ways, by the three names its page shows: its title, its
 * shown organiser (shownOrganiser, the same function every page names the organiser with) and its venue. Its season
 * (the same title at the same venue: one event with many dates) must be among the results:
 *   - by its TITLE, in the top three;
 *   - by its ORGANISER or its VENUE, in the top three when that name holds three seasons or fewer; a name holding more
 *     (a comedy club with thirty nights of twelve shows) cannot put every season in three places, so there the season
 *     must be on the first page of results. The count of such names is reported, never hidden.
 *
 * Pure: the runner (scripts/verify/search-reach.mjs) reads the events and asks the search; every judgement is here.
 */
import { shownOrganiser } from '@/lib/listings/shown-organiser'

export type ReachEvent = {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly venue_name: string | null
  readonly listing_source: string | null
  readonly metadata: unknown
  readonly organisation: { readonly name: string | null; readonly slug: string | null; readonly short_name: string | null } | null
}

export type ReachKind = 'title' | 'organiser' | 'venue'

export type ReachQuery = { readonly kind: ReachKind; readonly q: string }

/** The placeholders shownOrganiser answers when it has no name; never searched. */
const NO_NAME = new Set(['the venue', 'the organiser'])

const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** One event's season: the same title at the same venue. */
export function seasonKey(e: { readonly title: string; readonly venue_name: string | null }): string {
  return `${norm(e.title)}|${norm(e.venue_name)}`
}

/** The three names an event's page shows, each a query; an empty or placeholder name is not searched. Pure. */
export function reachQueries(e: ReachEvent): ReachQuery[] {
  const out: ReachQuery[] = []
  const add = (kind: ReachKind, q: string | null | undefined) => {
    const v = (q ?? '').replace(/\s+/g, ' ').trim()
    if (v && !NO_NAME.has(v.toLowerCase())) out.push({ kind, q: v })
  }
  add('title', e.title)
  add('organiser', shownOrganiser(e, e.organisation).name)
  add('venue', e.venue_name)
  return out
}

export type ReachVerdict = {
  readonly eventId: string
  readonly slug: string
  readonly kind: ReachKind
  readonly q: string
  readonly found: boolean
  /** 'top3', or 'first page' where the name holds more than three seasons. */
  readonly needed: 'top3' | 'first page'
  /** Where the season first appears in the results (1 based), or null. */
  readonly at: number | null
}

/**
 * Judges one event on one query against the results in order (their slugs). `seasonOf` maps a result's slug to its
 * season key (from the live events read); a slug it does not know is not this event's season. `seasonsByName` counts,
 * for each organiser or venue query (lower case), how many live seasons hold that name. Pure.
 */
export function judgeReach(
  e: ReachEvent,
  query: ReachQuery,
  results: readonly string[],
  seasonOf: ReadonlyMap<string, string>,
  seasonsByName: ReadonlyMap<string, number>,
): ReachVerdict {
  const mine = seasonKey(e)
  const index = results.findIndex((slug) => slug === e.slug || seasonOf.get(slug) === mine)
  const crowded = query.kind !== 'title' && (seasonsByName.get(query.q.toLowerCase()) ?? 0) > 3
  const needed = crowded ? 'first page' : 'top3'
  const found = index >= 0 && (needed === 'first page' || index < 3)
  return { eventId: e.id, slug: e.slug, kind: query.kind, q: query.q, found, needed, at: index >= 0 ? index + 1 : null }
}

/** How many live seasons hold each organiser and venue name (lower case), for judgeReach's crowded rule. Pure. */
export function seasonsByName(events: readonly ReachEvent[]): Map<string, number> {
  const seasons = new Map<string, Set<string>>()
  for (const e of events) {
    for (const q of reachQueries(e)) {
      if (q.kind === 'title') continue
      const k = q.q.toLowerCase()
      if (!seasons.has(k)) seasons.set(k, new Set())
      seasons.get(k)!.add(seasonKey(e))
    }
  }
  return new Map([...seasons].map(([k, s]) => [k, s.size]))
}

/** The event pages a results page links, in order, once each (never /events/browse). Pure. */
export function resultSlugs(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/href="\/events\/([a-z0-9][a-z0-9-]*)"/g)) {
    const slug = m[1]
    if (slug === 'browse' || out.includes(slug)) continue
    out.push(slug)
  }
  return out
}
