'use server'

import { fetchPublicEvents } from '@/lib/events'
import { projectToCardData } from '@/lib/events/event-card-projection'
import {
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { detectLocation } from '@/lib/geo/detect'
import type { EventCardData } from '@/components/features/events/event-card'

export type LoadMoreResult = {
  cards: EventCardData[]
  hasMore: boolean
  page: number
}

/**
 * Server action used by the infinite-scroll sentinel to fetch + shape the
 * next page of events. Returns ready-to-render EventCardData so the Pexels
 * fallback and badge computation stay server-side (PEXELS_API_KEY and
 * unstable_cache never cross the client boundary).
 */
export async function loadMoreEventCards(
  params: EventsSearchParams,
  page: number,
): Promise<LoadMoreResult> {
  const { filters } = parseEventsSearchParams(params)
  const location = await detectLocation()
  const origin =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined

  const result = await fetchPublicEvents({ filters, page, pageSize: 24, origin })
  const cards = await projectToCardData(result.events)

  return {
    cards,
    hasMore: result.page < result.totalPages,
    page: result.page,
  }
}
