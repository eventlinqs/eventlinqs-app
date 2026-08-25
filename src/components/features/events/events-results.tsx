import { Reveal } from '@/components/ui/reveal'
import { EventsGrid } from './m5-events-grid'
import { EventsPagination } from './m5-events-pagination'
import type { EventsSearchParams } from '@/lib/events/search-params'
import type { FetchPublicEventsResult } from '@/lib/events/types'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'

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
  return (
    <>
      {total} event{total === 1 ? '' : 's'} available
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
