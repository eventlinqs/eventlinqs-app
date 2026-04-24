import { EventsGrid } from './m5-events-grid'
import { EventsPagination } from './m5-events-pagination'
import type { PublicEventRow } from '@/lib/events/types'
import type { EventsSearchParams } from '@/lib/events/search-params'

type Props = {
  events: PublicEventRow[]
  params: EventsSearchParams
  page: number
  totalPages: number
}

/**
 * Wraps EventsGrid + pagination in a single Suspense-friendly unit.
 * The grid's async projection (per-event Pexels fallbacks) is what we
 * actually want to offload — pushing it behind a <Suspense> lets the
 * hero, filter bar, and skeleton paint at first byte.
 */
export async function EventsResultsSection({ events, params, page, totalPages }: Props) {
  return (
    <section aria-label="Event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <EventsGrid events={events} params={params} page={page} totalPages={totalPages} />
      <EventsPagination params={params} page={page} totalPages={totalPages} />
    </section>
  )
}
