import { Reveal } from '@/components/ui/reveal'
import { EventsGrid } from './m5-events-grid'
import { EventsPagination } from './m5-events-pagination'
import type { EventsSearchParams } from '@/lib/events/search-params'
import type { FetchPublicEventsResult } from '@/lib/events/types'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { WhatsOnDirectory } from './whats-on-directory'
import { directoryDays } from '@/lib/events/whats-on-directory'

/**
 * Async data regions for /events browse. Both consume the SAME unawaited
 * `resultPromise` created in the page, so a single events fetch feeds both the
 * hero count and the grid (no double fetch). Each is rendered inside its own
 * page-level <Suspense>, so the hero strip + filter bar paint immediately while
 * these stream behind a designed skeleton.
 */

/**
 * THE COLLECTION MARKUP FOR /events, THE ONE LISTING SURFACE THAT HAD NONE.
 *
 * A 23 August 2026 pass built EventCollectionJsonLd and wired it to
 * /events/browse/[city] and /categories/[slug]. It did not reach /events, which
 * is the surface the header links to from every page and the one this platform
 * ranks on for "events near me". Measured against production on 25 August 2026,
 * per page type: /events returned 0 JSON-LD blocks while every city browse page
 * on this branch returned CollectionPage + BreadcrumbList.
 *
 * IT AWAITS THE SAME PROMISE THE GRID AWAITS, and it lives behind the page's
 * <Suspense> for that reason. Awaiting the events fetch in the page body would
 * block the hero strip and the LCP, which is the exact cost the streaming shape
 * in this file exists to avoid. React streams the markup into the same HTML
 * response, so a crawler that never runs JavaScript still receives it.
 */
export async function EventsCollectionMarkup({
  resultPromise,
  baseUrl,
}: {
  resultPromise: Promise<FetchPublicEventsResult>
  baseUrl: string
}) {
  const { events } = await resultPromise
  if (events.length === 0) return null
  return (
    <EventCollectionJsonLd
      url={`${baseUrl}/events`}
      name="Events in Australia"
      description="Upcoming events, concerts, comedy, festivals and experiences across Australia."
      events={events.map(e => ({ slug: e.slug, title: e.title }))}
      baseUrl={baseUrl}
    />
  )
}

/** Hero "N events available" line. Streams into the hero's count slot. */
export async function EventsCount({
  resultPromise,
  subtitle,
}: {
  resultPromise: Promise<FetchPublicEventsResult>
  subtitle?: string
}) {
  const { total } = await resultPromise
  // ROUND 3 (7), Lawal 2 November 2026: the total is NIGHTS (one row per date), so it says dates; calling dates events
  // overstated the platform (WINDOW 6's old-routes.md: '383 events available' where Geelong holds 191 events).
  return (
    <>
      {total} upcoming {total === 1 ? 'date' : 'dates'}
      {subtitle ? ` · ${subtitle}` : ''}
    </>
  )
}

/** Results grid + pagination. Reveal-wraps the grid only on the unfiltered
 *  (below-the-popular-rail) view, matching the prior inline behaviour. */
export async function EventsResults({
  resultPromise,
  params,
  filterActive,
}: {
  resultPromise: Promise<FetchPublicEventsResult>
  params: EventsSearchParams
  filterActive: boolean
}) {
  const result = await resultPromise
  const grid = (
    <EventsGrid
      events={result.events}
      params={params}
      page={result.page}
      totalPages={result.totalPages}
      firstCardEager={filterActive}
    />
  )
  return (
    <>
      {filterActive ? grid : <Reveal>{grid}</Reveal>}
      <EventsPagination params={params} page={result.page} totalPages={result.totalPages} />
    </>
  )
}

/**
 * THE RESULTS AS WHAT'S ON (Lawal's order of 1 November 2026, 11:01: "Browse Events and each city page: directory
 * first, Featured above it"). The same page of results the grid drew, one row per night under its day, with the same
 * pagination and the same designed empty state. The filter bar above already filters, so the list carries no chips.
 */
export async function EventsDirectoryResults({
  resultPromise,
  params,
}: {
  resultPromise: Promise<FetchPublicEventsResult>
  params: EventsSearchParams
}) {
  const result = await resultPromise
  if (result.events.length === 0) {
    return <EventsGrid events={[]} params={params} page={result.page} totalPages={result.totalPages} firstCardEager={false} />
  }
  return (
    <>
      <WhatsOnDirectory days={directoryDays(result.events, new Date())} chips={[]} />
      <EventsPagination params={params} page={result.page} totalPages={result.totalPages} />
    </>
  )
}
