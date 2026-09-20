import 'server-only'
import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/public-client'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { fetchFixtureEvent } from '@/lib/dev/fixture-events'
import { fetchArchivedEventForHolder } from '@/lib/events/archived-view'
import { fetchAfterTheFactEvent } from '@/lib/events/after-the-fact-view'
import type { Event, TicketTier, Organisation, EventCategory, EventAddon } from '@/types/database'

/**
 * THE EVENT BEHIND /events/[slug], RESOLVED ONCE PER REQUEST.
 *
 * ==========================================================================
 * WHY THIS MODULE EXISTS: THE HEAD AND THE BODY WERE BUYING THE SAME ROW
 * ==========================================================================
 *
 * A Next.js route renders its head and its body from one request:
 * `generateMetadata` runs for the head and the default export runs for the
 * body, and each loads what it needs. Next's own reference says that is
 * supposed to be free - "fetch requests are automatically memoized for the same
 * data across generateMetadata, generateStaticParams, Layouts, Pages, and
 * Server Components. React `cache` can be used if fetch is unavailable"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-metadata.md, Next 16.3.0).
 *
 * On this platform it is NOT free, for a reason that is written down and is
 * still the right trade: every Supabase request carries its own AbortSignal so
 * that a retry inside a render is a real second request, and a signal is the
 * framework deduplicator's documented opt-OUT
 * (src/lib/supabase/undeduped-fetch.ts). So the memoisation Next assumes does
 * not happen here, and the head and the body each paid for the row.
 *
 * MEASURED, NOT SUSPECTED, ON 21 SEPTEMBER 2026 (close-out C8, C8B.1). A
 * production build served locally, with every PostgREST call counted at the
 * global fetch (scripts/verify/lib/count-supabase-reads.mjs):
 *
 *     /events/arena-sessions-large-room-performance-test   18 calls, 17 distinct
 *     /events/cat-indie-sounds-live-at-the-enmore-sydney   14 calls, 13 distinct
 *     /events/artist-layer-launch-night-geelong            12 calls, 11 distinct
 *
 * and the repeated one was this row, with this column list, twice. The route
 * ALSO read it a third time, with a different and narrower column list, in its
 * layout's existence guard, which no "same question twice" count can see.
 * Timed against TEST the previous evening: 89ms for the narrow read, 100ms for
 * this one. Three reads where one does, on the platform's most important page,
 * whose observed LCP is now dominated by time to first byte.
 *
 * ==========================================================================
 * WHAT `cache` DOES AND WHAT IT DOES NOT DO
 * ==========================================================================
 *
 * React's `cache` memoises for the lifetime of ONE server request. It is not a
 * data cache, it has no TTL, it is not shared between requests or between
 * users, and it cannot serve a stale row: the second caller in the same render
 * gets the first caller's promise. That is exactly the scope of the defect, and
 * it is why this is the mechanism Next's own documentation names rather than
 * `unstable_cache` or a revalidate window.
 *
 * ONE CONSEQUENCE IS DELIBERATE AND IS NOT A REGRESSION. `readOrThrow` retries
 * a transient fault and throws a real one; when it throws, the rejected promise
 * is what this memo holds, so the head and the body see the same failure rather
 * than the body quietly succeeding on a second attempt the head never got. That
 * is the answer this route should give: a route that renders a page under a
 * "not found" title because its two reads disagreed is worse than a 500 that
 * says ask again.
 *
 * ==========================================================================
 * THE FOUR BRANCHES, WHICH ARE THE LIFECYCLE AND NOT A PERFORMANCE DETAIL
 * ==========================================================================
 *
 * The order is the one the route has always used and `docs/EVENT-LIFECYCLE.md`
 * is AUTHORITY over it:
 *
 *   1. the density fixture (Preview and local only, double-guarded inside
 *      fetchFixtureEvent, never consulted on production);
 *   2. the anonymous public read, which row-level security limits to published
 *      public events, which is what a stranger may see;
 *   3. the ARCHIVED event, for a viewer who holds a ticket to it and for nobody
 *      else (close-out C13.5 and C13.6);
 *   4. the four after-the-fact states - paused, postponed, cancelled, completed
 *      - which answer a full page with a banner and which the anonymous read
 *      cannot see either.
 *
 * Nothing about that order changes here. What changes is that it is now
 * performed ONCE and the layout, the metadata and the page read its answer.
 */

export type FullEvent = Event & {
  ticket_tiers: TicketTier[]
  organisation: Organisation
  category: EventCategory | null
  event_addons?: EventAddon[]
}

/**
 * The one column list this route reads by. The public anon read, the holder's
 * archived read and the after-the-fact read all share it, so every branch
 * renders the same composition.
 *
 * `organisations` is embedded with an EXPLICIT column list, never `(*)`. This
 * is a public page read as `anon`, and organisations carries email, phone,
 * owner_id and the full Stripe Connect posture. Those columns are revoked from
 * anon by column privilege (migration 20260808000010), so a `(*)` embed would
 * fail the whole query with "permission denied for column email" and blank the
 * event page. See docs/security/AUDIT-2026-08-08.md.
 */
export const EVENT_PAGE_SELECT =
  '*, ticket_tiers(*), organisation:organisations(id, name, slug, description, logo_url, website), category:event_categories(*), event_addons(*)'

/**
 * The event at this slug as this viewer may see it, or null when there is none.
 *
 * Memoised per request. Every caller on this route - the layout's existence
 * guard, `generateMetadata` and the page itself - goes through here, and
 * `scripts/guards/the-head-and-the-body-ask-once.mjs` fails the build if a
 * route ever asks twice again.
 */
export const readEventForRoute = cache(async function readEventForRoute(slug: string): Promise<FullEvent | null> {
  // 1. The density fixture. A homepage fixture card must resolve to a fully
  // rendered detail page instead of a 404, so the rails and this path read ONE
  // fixture. Returns null for unknown slugs and is a no-op on production.
  const fixture = await fetchFixtureEvent(slug)
  if (fixture) return fixture as unknown as FullEvent

  /*
   * 2. A FAILED READ IS NOT AN ABSENT EVENT. This used to log the error and
   * return null, and the caller turned null into notFound(): a buyer whose read
   * blinked was told the event does not exist (12 September 2026, the fourth
   * occurrence of the class; src/lib/supabase/read-or-throw.ts records it).
   * readOrThrow retries a transient fault and throws a real one, so the answer
   * is "try again" and never "not here".
   */
  const supabase = createPublicClient()
  const data = await readOrThrow('event-detail', () =>
    supabase.from('events').select(EVENT_PAGE_SELECT).eq('slug', slug).maybeSingle() as unknown as Read<FullEvent>,
  )
  if (data) return data

  /*
   * 3. NOTHING PUBLIC AT THIS SLUG, and the database said so; the log says so
   * too, so a bare 404 can never again be mistaken for a blink. Row-level
   * security keeps drafts and ARCHIVED events out of the anonymous read, which
   * is right for a stranger. For an archived event, and only then, a viewer who
   * holds a ticket may still see the page (docs/EVENT-LIFECYCLE.md, close-out
   * C13.5 and C13.6), so the second look is taken with the service role. It
   * returns null for everyone else, and the caller's notFound() stands.
   *
   * THIS IS ALSO WHERE THE SESSION IS READ, AND ONLY HERE. An ordinary missing
   * slug 404s without touching request data; an archived slug's answer is per
   * viewer, and src/proxy.ts marks that response private to the edge cache.
   */
  console.warn(`[event-detail] no public row for ${slug}`)
  const holderView = await fetchArchivedEventForHolder<FullEvent>(slug, EVENT_PAGE_SELECT)
  if (holderView) return holderView

  /*
   * 4. THE FOUR AFTER-THE-FACT STATES, which the anonymous read could not see
   * either. `docs/EVENT-LIFECYCLE.md` says a paused, postponed, cancelled or
   * completed event answers a full page with its banner; the RLS policies admit
   * published alone, so all four were a 404 and the banner code on this page had
   * never run for a stranger. See src/lib/event-lifecycle.ts,
   * PUBLIC_AFTER_THE_FACT_STATUSES. Unlike the archived branch above, this
   * answer is the SAME FOR EVERY VIEWER, so it reads no session and the response
   * stays cacheable at the edge.
   */
  return fetchAfterTheFactEvent<FullEvent>(slug, EVENT_PAGE_SELECT)
})
