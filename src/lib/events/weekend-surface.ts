import { fetchPublicEventsCached } from './fetchers'
import { WEEKEND_SURFACE_LIMIT, weekendSurfaceWindow } from './weekend-days'
import type { PublicEventRow } from './types'

/**
 * THE "WHAT IS ON THIS WEEKEND" SURFACE, READ IN ONE PLACE.
 *
 * ============================================================================
 * WHY THIS MODULE EXISTS AT ALL
 * ============================================================================
 *
 * Close-out AQ3 asks for "a this weekend surface", and the platform had one
 * everywhere except as a page: a homepage rail, a footer link, a chip on the
 * city filter bar and the `/events?preset=weekend` filter, four doors into a
 * query string that canonicalises to `/events`. Somebody searching "what is on
 * this weekend in Australia" could not land on it, because there was no it.
 *
 * THREE THINGS NOW NEED THE SAME ANSWER and they run in three different places:
 *
 *   the PAGE       renders the cards and decides its own robots directive,
 *   the SITEMAP    decides whether to publish the URL at all,
 *   the GUARD      holds the two of them to one decision.
 *
 * Search Console's own exclusion reason "duplicate, Google chose different
 * canonical" is what a sitemap that advertises a noindex URL reads as, so those
 * may never disagree. They cannot, because there is one function and one cache
 * entry behind all of them: `loadWeekendSurface`.
 *
 * ============================================================================
 * WHY IT IS `fetchPublicEventsCached` AND NOT A QUERY OF ITS OWN
 * ============================================================================
 *
 * `/events?preset=weekend` has existed all along, and the surface that a link
 * called "This weekend" opens must show what the filter called "This weekend"
 * shows. A second query would be a second dialect of the same question: a
 * different visibility predicate, a different cover rule, a different sort, and
 * no way to see the two drift apart. So this asks the SAME fetcher with the
 * SAME filter, which means it also shares the same cache entry, and the page
 * and the filter cannot answer differently.
 *
 * ============================================================================
 * WHAT THE CACHE COSTS, STATED RATHER THAN DISCOVERED
 * ============================================================================
 *
 * `fetchPublicEventsCached` keys on the hour, so the window is recomputed at
 * most an hour after the weekend rolls over. The roll happens at local midnight
 * on Monday, which is inside an hour bucket like any other, so the worst case is
 * that for up to one hour after midnight on Monday the page still shows the
 * weekend that has just finished. Every event on it has ended by then and the
 * listing window drops them, so the observable effect is an emptier page for an
 * hour, never a stale event.
 *
 * ============================================================================
 * THE RULES LIVE NEXT DOOR, DELIBERATELY
 * ============================================================================
 *
 * The route, the day split and the human description of the weekend are in
 * `./weekend-days`, which imports no framework, and are re-exported here so
 * every call site inside the product needs one import. That split is the same
 * one `discovery-counts.ts` makes for `discovery-matchers.ts` and it exists for
 * the same reason: a script outside a Next build has to be able to load the
 * rules. See that file's header for the run that proved it.
 */
export * from './weekend-days'

export interface WeekendSurface {
  /** Saturday 00:00 in the platform zone. */
  from: Date
  /** The last instant of Sunday in the platform zone. Inclusive. */
  to: Date
  /** The events, capped at WEEKEND_SURFACE_LIMIT, soonest first. */
  events: PublicEventRow[]
  /** Every publicly visible event in the window, uncapped. Drives indexability. */
  total: number
}

/**
 * The weekend, its events and its true count, from the one shared fetcher.
 *
 * `now` is an argument so a test can pin a weekend. Every caller in the product
 * omits it, so the page, the sitemap and the filter all read one clock.
 */
export async function loadWeekendSurface(now: Date = new Date()): Promise<WeekendSurface> {
  const { from, to } = weekendSurfaceWindow(now)
  const { events, total } = await fetchPublicEventsCached({
    filters: { preset: 'weekend' },
    page: 1,
    pageSize: WEEKEND_SURFACE_LIMIT,
  })
  return { from, to, events, total }
}
