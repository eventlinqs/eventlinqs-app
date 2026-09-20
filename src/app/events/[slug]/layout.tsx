import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { fetchFixtureEvent } from '@/lib/dev/fixture-events'
import { viewerMayReachArchivedEvent } from '@/lib/events/archived-view'
import { fetchAfterTheFactEvent } from '@/lib/events/after-the-fact-view'
import { EVENT_HERO_SELECT, eventHeroPreloadLink } from '@/lib/images/hero-preload'
import type { EventHeroFields } from '@/lib/images/event-media'

/**
 * Existence guard for /events/[slug].
 *
 * Why a layout and not just the page: the page renders inside the
 * `events/[slug]/loading.tsx` Suspense boundary. A `loading.tsx` streams its
 * fallback - committing the HTTP 200 - the moment the page suspends on its
 * data fetch, so a page-level `notFound()` thrown AFTER that fetch can only
 * render the not-found UI inline (a soft-404 / HTTP 200), not set a real 404.
 * (Routes with no loading boundary, e.g. /organisers/[handle], 404 correctly.)
 *
 * The layout renders OUTSIDE the page's loading Suspense, so resolving the
 * slug's existence here and calling `notFound()` before `children` mount sets
 * a real 404 for unknown slugs - while the page keeps its designed loading
 * skeleton for the (confirmed-to-exist) event's own render. Uses the same
 * cookie-free anon client + slug the page's fetchEvent uses, so visibility is
 * identical (a row the page would notFound on is a row this guard rejects).
 *
 * ==========================================================================
 * AND IT STARTS THE LCP IMAGE, FOR THE SAME REASON IT DECIDES THE 404
 * ==========================================================================
 *
 * Rendering outside the loading boundary is also the only place on this route
 * that can put the hero's `<link rel=preload as=image>` in the `<head>`. A
 * `loading.tsx` closes the head with the SKELETON, so the preload the hero
 * itself emits landed at byte 85,041 of a 205,060 byte document: the browser
 * could not ask for the LCP image until it had parsed 41 per cent of the page.
 * Lighthouse measured it as `Resource load delay` and it was the largest term
 * in this route's LCP. Every other public route on the platform carries that
 * link at byte 241, because none of them has a loading boundary.
 *
 * So each branch below that returns `children` also registers the hero, from
 * the row it already read: the existence select is WIDENED to the hero's
 * columns rather than a second query being added.
 *
 * `scripts/guards/hero-preload-above-the-loading-boundary.mjs` derives this
 * requirement from the tree - a `loading.tsx` beside a page that renders a hero
 * - so the next route that grows one cannot repeat this quietly.
 *
 * THE ARCHIVED-HOLDER BRANCH DELIBERATELY DOES NOT PRELOAD, and the reason is
 * cost rather than oversight. `viewerMayReachArchivedEvent` answers from a
 * lookup that does not carry the hero columns, so preloading there would add a
 * read to a path that is per-viewer, uncacheable at the edge by design, noindex
 * by ruling, and reached only by someone who already holds a ticket. It is the
 * one branch where the image is not worth a round trip.
 */
/**
 * The hero's preload link and the page, in that order.
 *
 * A fragment rather than a wrapper element: this layout sits between the root
 * layout and the page and must add NO box to the document, or the hero's
 * `absolute inset-0` would resolve against a different containing block.
 * React hoists the `<link>` out of here into the head regardless of where in
 * the tree it sits, which is the whole mechanism.
 */
function withHeroPreload(link: React.ReactElement | null, children: React.ReactNode) {
  return (
    <>
      {link}
      {children}
    </>
  )
}

/**
 * The one branch that deliberately does NOT start the LCP image, named so the
 * decision is in the code rather than in a guard's allowlist.
 *
 * `viewerMayReachArchivedEvent` answers from a lookup that does not carry the
 * hero's columns, so preloading here would add a round trip to a path that is
 * per-viewer, uncacheable at the edge by design, noindex by ruling, and reached
 * only by somebody who already holds a ticket. It is the one branch where the
 * image is not worth a read.
 *
 * `scripts/guards/hero-preload-above-the-loading-boundary.mjs` requires every
 * branch of this layout to return through one of these two functions, so the
 * next branch added has to say which it is instead of quietly being neither.
 */
function withoutHeroPreload(children: React.ReactNode) {
  return children
}

export default async function EventSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Density fixture (Preview + local only, double-guarded inside
  // fixtureEventExists): a homepage fixture card must resolve to a real
  // detail page, so honour the same one-source-of-truth fixture the homepage
  // rails render. Never consulted on production deployments.
  const fixture = await fetchFixtureEvent(slug)
  if (fixture) return withHeroPreload(await eventHeroPreloadLink(fixture), children)

  /*
   * THE READ THAT DECIDES EXISTENCE MAY NOT DISCARD ITS ERROR. 12 September
   * 2026, the fourth occurrence of one class: the gate's checkout drive opened a
   * published, public event at 768 wide and this guard answered 404, once,
   * between a 200 at 390 and a 200 at 1440. The line here was
   * `const { data } = await ...maybeSingle()`, so a dropped socket left `data`
   * null exactly as an empty table would, nothing was logged, and a real event
   * was declared not to exist. readOrThrow retries a transient fault, throws a
   * real one (a 500 says "ask again", which is true), and answers null only when
   * the database itself said there is no row. This guard sits ABOVE the page's
   * loading boundary, so a throw here is a real HTTP 500 and never a streamed
   * 200 (src/lib/supabase/read-or-throw.ts).
   */
  const supabase = createPublicClient()
  const row = await readOrThrow('event-route', () =>
    supabase.from('events').select(EVENT_HERO_SELECT).eq('slug', slug).maybeSingle() as unknown as Read<EventHeroFields>,
  )

  if (row) return withHeroPreload(await eventHeroPreloadLink(row), children)

  /*
   * NOTHING PUBLIC AT THIS SLUG, and the database said so. Say so in the log
   * too, so the next blink leaves a trace instead of a bare 404. An ARCHIVED
   * event is invisible to the anon read by row-level security, which is right
   * for a stranger, but a viewer who holds a ticket to it may still reach its
   * page (docs/EVENT-LIFECYCLE.md, close-out C13.5 and C13.6). That decision has
   * to be made HERE, because this guard answers before the page runs: the first
   * C13 drive found the page's own holder branch was never reached, the layout
   * having already said 404. The session is read only on this path, so an
   * ordinary missing slug still 404s without touching request data; for an
   * archived slug the response is per viewer, and the proxy marks it private to
   * the edge cache.
   */
  console.warn(`[event-route] no public row for ${slug}; asking whether a ticket holder may see an archived one`)
  if (await viewerMayReachArchivedEvent(slug)) return withoutHeroPreload(children)

  /*
   * PAUSED, POSTPONED, CANCELLED AND COMPLETED ARE PUBLIC PAGES, and the anon
   * read above cannot see any of them: the row-level security policies on
   * `public.events` admit `status = 'published'` alone. `docs/EVENT-LIFECYCLE.md`
   * says all four answer a full page with a banner, and all four were answering
   * a real 404 until 14 September 2026. The full account is in
   * `src/lib/event-lifecycle.ts` beside PUBLIC_AFTER_THE_FACT_STATUSES.
   *
   * Unlike the archived branch above, this answer is the SAME FOR EVERY VIEWER,
   * so it reads no session and the response stays cacheable at the edge.
   */
  const afterTheFact = await fetchAfterTheFactEvent<EventHeroFields>(slug, EVENT_HERO_SELECT)
  if (afterTheFact) return withHeroPreload(await eventHeroPreloadLink(afterTheFact), children)

  notFound()
}
