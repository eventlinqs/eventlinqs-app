import { Reveal } from '@/components/ui/reveal'
import { EventsGrid } from './m5-events-grid'
import { EventsPagination } from './m5-events-pagination'
import type { EventsSearchParams } from '@/lib/events/search-params'
import type { FetchPublicEventsResult } from '@/lib/events/types'

/**
 * Async data regions for /events browse. Both consume the SAME unawaited
 * `resultPromise` created in the page, so a single events fetch feeds both the
 * hero count and the grid (no double fetch). Each is rendered inside its own
 * page-level <Suspense>, so the hero strip + filter bar paint immediately while
 * these stream behind a designed skeleton.
 */

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
