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
 * ==========================================================================
 * THE BOUNDARY THIS FILE WAS WRITTEN AGAINST IS GONE. 20 September 2026.
 * ==========================================================================
 *
 * This comment used to open by explaining that the page renders inside the
 * `events/[slug]/loading.tsx` Suspense boundary, and every paragraph after it
 * followed from that. `loading.tsx` was DELETED under close-out C8 because the
 * boundary made React stream the flight payload before the resumed markup and
 * left the hero <img> at byte 102,160 of a 205,226 byte document. The
 * measurement, the trade and the decision are in
 * docs/perf/EVENT-ROUTE-LOADING-BOUNDARY-2026-09-20.md, and
 * `scripts/guards/no-loading-boundary-in-front-of-a-hero.mjs` keeps it deleted.
 *
 * The comment is rewritten rather than trimmed because a stale comment that
 * states a fact about the tree is a defect in its own right: the next reader
 * would have gone looking for a file that is not there.
 *
 * WHAT THAT CHANGES HERE, honestly: less than it looks. The page's own
 * `notFound()` now sets a real 404 by itself, because with no boundary there is
 * no fallback committing an HTTP 200 ahead of it. So this guard is no longer
 * the ONLY thing standing between an unknown slug and a soft 404. It is kept
 * because it still answers earlier than the page's own fetch, from the same
 * cookie-free anon client and the same slug, so visibility is identical (a row
 * the page would notFound on is a row this guard rejects), and because the
 * lifecycle branches below (archived holder, after-the-fact statuses) are
 * decided here before the page runs. Deleting it is a question for
 * docs/EVENT-LIFECYCLE.md, not for a performance change.
 *
 * ==========================================================================
 * IT STILL STARTS THE LCP IMAGE, AND THAT IS NOW BELT AND BRACES
 * ==========================================================================
 *
 * While the boundary existed this was the ONLY place on the route that could
 * put the hero's `<link rel=preload as=image>` in the `<head>`: the head closed
 * with the skeleton, so the link next/image emits where the hero RENDERS landed
 * at byte 85,041. Moving the ask here took it to byte 241 and took resource
 * load delay from a 331ms median to 12ms. That fix was real and it is why the
 * remaining cost was measurable at all.
 *
 * With the boundary gone it is no longer the only place. Every other public
 * route on this platform carries its hint in the head at byte 221 to 241 with
 * NO bespoke preload, from next/image's own registration, precisely because
 * nothing closes the head early. Measured on this tree after the deletion: ONE
 * image hint per document, in the head, at byte 221 - React dedupes this link
 * and the element's own registration to a single hint, as it must, since they
 * are built from the same call on the same inputs.
 *
 * SO THIS IS NOW REDUNDANT-BUT-HARMLESS, AND IT IS SAID OUT LOUD RATHER THAN
 * LEFT FOR SOMEBODY TO DISCOVER. It is kept in this pass because removing it
 * also removes `HeroPreloadLink`, the `next/image` edge it puts in this
 * layout's graph, and the guard clause and tests that hold it, and that is a
 * separate change with its own measurement to take - worth taking, because
 * lane A measured that graph edge at 5,641 bytes gzip on
 * /events/[slug]/with/[artist]. It is named in C:\dev\REVIEW-QUEUE-C.md with
 * that number beside it.
 *
 * Each branch below that returns `children` registers the hero from the row it
 * already read: the existence select is WIDENED to the hero's columns rather
 * than a second query being added.
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
 * THE GUARD CLAUSE THAT USED TO ENFORCE THIS IS GONE, AND ITS ABSENCE IS NOT
 * AN OVERSIGHT. `hero-preload-above-the-loading-boundary` carried a clause
 * requiring every branch of this layout to return through one of these two
 * functions, because a branch that silently returned `children` left the LCP
 * image unasked-for until byte 85,041 and nothing noticed. That clause was
 * written for a route with a loading boundary, and there is no longer one: a
 * branch that forgets the preload now costs the earliness of a HINT that
 * next/image emits anyway, in a head that stays open, rather than the LCP. The
 * replacement guard holds the rule that actually matters now and does not
 * pretend to hold this one. The two functions stay because naming the decision
 * is still better than leaving it implied.
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
   * the database itself said there is no row. A throw here is a real HTTP 500
   * and never a streamed 200, because nothing has been flushed yet: that used
   * to be true because this ran above the route's loading boundary, and since
   * that boundary was deleted (close-out C8) it is true of the whole render
   * (src/lib/supabase/read-or-throw.ts).
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
