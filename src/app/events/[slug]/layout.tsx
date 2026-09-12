import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { fixtureEventExists } from '@/lib/dev/fixture-events'
import { viewerMayReachArchivedEvent } from '@/lib/events/archived-view'

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
 */
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
  if (await fixtureEventExists(slug)) return children

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
    supabase.from('events').select('id').eq('slug', slug).maybeSingle(),
  )

  if (row) return children

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
  if (await viewerMayReachArchivedEvent(slug)) return children

  notFound()
}
