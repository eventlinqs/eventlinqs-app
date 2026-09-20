import { notFound } from 'next/navigation'
import { readEventForRoute } from '@/lib/events/event-detail-read'
import { eventHeroPreloadLink } from '@/lib/images/hero-preload'

/**
 * Existence guard for /events/[slug].
 *
 * ==========================================================================
 * IT READS THE SAME ROW THE PAGE READS, AND IT NO LONGER PAYS FOR IT
 * 21 September 2026, close-out C8, clause C8B.3
 * ==========================================================================
 *
 * This file used to run its own narrower read, through its own four branches,
 * one round trip before the page ran its own. `generateMetadata` ran a third.
 * Counted at the global fetch on a production build against TEST
 * (scripts/verify/lib/count-supabase-reads.mjs), one view of
 * /events/arena-sessions-large-room-performance-test made 18 PostgREST calls of
 * which 17 were distinct, and the repeat was the event row; the narrow read
 * here was the invisible third, because no "same question twice" count can see
 * a question asked in different words. Timed against TEST: 89ms narrow, 100ms
 * wide.
 *
 * The four branches now live once, in `src/lib/events/event-detail-read.ts`,
 * memoised per request with React's `cache`, which is the mechanism Next's own
 * reference names for exactly this ("React `cache` can be used if `fetch` is
 * unavailable", generate-metadata.md, Next 16.3.0). Nothing about the lifecycle
 * order changed: the same fixture, anonymous, archived-holder and
 * after-the-fact branches in the same order, decided in the same place, before
 * the page runs.
 *
 * WHY THIS GUARD IS STILL HERE AT ALL, since the page can 404 by itself now
 * that the route has no loading boundary: it decides the lifecycle branches
 * BEFORE the page runs, which is what the first C13 drive needed - it found the
 * page's own holder branch never ran because the layout had already answered
 * 404. Deleting it is a question for docs/EVENT-LIFECYCLE.md, not for a
 * performance change. It costs nothing now.
 *
 * ==========================================================================
 * IT STILL STARTS THE LCP IMAGE, AND NOW ON EVERY BRANCH
 * ==========================================================================
 *
 * While this route had a loading boundary this was the ONLY place that could
 * put the hero's `<link rel=preload as=image>` in the `<head>`: the head closed
 * with the skeleton, so the link next/image emits where the hero RENDERS landed
 * at byte 85,041. Moving the ask here took it to byte 241 and took resource load
 * delay from a 331ms median to 12ms.
 *
 * With that boundary deleted it is no longer the only place, and it is now
 * redundant-but-harmless: React dedupes this link and the element's own
 * registration to a single hint, as it must, since both are built from the same
 * call on the same inputs. It is kept in this pass because removing it also
 * removes the `next/image` edge it puts in this layout's graph, and lane A
 * measured that edge at 5,641 bytes gzip on /events/[slug]/with/[artist] - a
 * separate change with its own measurement to take, named in
 * C:\dev\REVIEW-QUEUE-C.md with that number beside it.
 *
 * THE ARCHIVED-HOLDER BRANCH USED TO SKIP THE PRELOAD, AND THE REASON WAS COST.
 * `viewerMayReachArchivedEvent` answered from a lookup that did not carry the
 * hero's columns, so preloading there would have added a round trip to a path
 * that is per-viewer, uncacheable at the edge by design, noindex by ruling, and
 * reached only by somebody who already holds a ticket. The shared resolver
 * returns the holder's FULL row, so that round trip does not exist any more and
 * the special case has no reason left. A ticket holder now gets the same LCP
 * treatment as everybody else, and this route has one code path instead of two.
 */
export default async function EventSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  /*
   * THE READ THAT DECIDES EXISTENCE MAY NOT DISCARD ITS ERROR. 12 September
   * 2026, the fourth occurrence of one class: the gate's checkout drive opened a
   * published, public event at 768 wide and this guard answered 404, once,
   * between a 200 at 390 and a 200 at 1440. The line here was
   * `const { data } = await ...maybeSingle()`, so a dropped socket left `data`
   * null exactly as an empty table would, nothing was logged, and a real event
   * was declared not to exist. The resolver's `readOrThrow` retries a transient
   * fault, throws a real one (a 500 says "ask again", which is true), and
   * answers null only when the database itself said there is no row. A throw
   * here is a real HTTP 500 and never a streamed 200, because nothing has been
   * flushed yet (src/lib/supabase/read-or-throw.ts).
   */
  const event = await readEventForRoute(slug)
  if (!event) notFound()

  /*
   * A fragment rather than a wrapper element: this layout sits between the root
   * layout and the page and must add NO box to the document, or the hero's
   * `absolute inset-0` would resolve against a different containing block.
   * React hoists the `<link>` out of here into the head regardless of where in
   * the tree it sits, which is the whole mechanism.
   */
  return (
    <>
      {await eventHeroPreloadLink(event)}
      {children}
    </>
  )
}
