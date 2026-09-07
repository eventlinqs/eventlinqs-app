import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'
import type { EventsSearchParams } from '@/lib/events/search-params'
import { EventsEmptyState } from './m5-events-empty-state'
import { EventsGridClient } from './m5-events-grid-client'

type Props = {
  events: PublicEventRow[]
  params: EventsSearchParams
  page: number
  totalPages: number
  firstCardEager?: boolean
}

/**
 * Server-side entry point for the /events grid. Resolves Pexels fallbacks
 * for the initial page, then hands off to EventsGridClient which owns the
 * IntersectionObserver + useTransition infinite-scroll loop. Subsequent
 * pages are fetched through the loadMoreEventCards server action, so
 * PEXELS_API_KEY and unstable_cache stay server-only.
 */
export async function EventsGrid({ events, params, page, totalPages, firstCardEager }: Props) {
  if (events.length === 0) {
    // Which emptiness is this (close-out C17.6)? Paging, sorting, the map or grid
    // view, the tab and the focus or error markers do not narrow the catalogue;
    // everything else does. An unfiltered, unsearched empty grid is a platform
    // waiting for its first listing and says so.
    const NOT_A_FILTER = new Set(['page', 'sort', 'view', 'tab', 'focus', 'error'])
    const filtered = Object.entries(params).some(([key, value]) => !NOT_A_FILTER.has(key) && typeof value === 'string' && value.trim() !== '')
    return <EventsEmptyState query={typeof params.q === 'string' ? params.q.trim().slice(0, 80) : undefined} filtered={filtered} />
  }

  const initialCards = await projectToCardData(events)

  return (
    <EventsGridClient
      initialCards={initialCards}
      params={params}
      startPage={page}
      totalPages={totalPages}
      firstCardEager={firstCardEager}
    />
  )
}
