'use server'

import { fetchPublicEvents } from '@/lib/events'
import { projectToCardData } from '@/lib/events/event-card-projection'
import {
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { detectLocation } from '@/lib/geo/detect'
import type { EventCardData } from '@/components/features/events/event-card'
import type { BboxFilter } from '@/lib/events/types'
import type { MapEventPoint } from '@/components/features/events/m5-events-map-types'

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

/**
 * Server action for the /events map view. Returns a flat list of
 * lat/lng points for the current viewport bbox, shaped down to just
 * what the Mapbox popup needs (title, city, date, starting-from
 * price, link). Pagination is disabled — the bbox IS the filter.
 * Hard-capped at 500 to keep payloads bounded when a user zooms way
 * out over a dense region.
 */
export async function loadEventsInBbox(
  params: EventsSearchParams,
  bbox: BboxFilter,
): Promise<MapEventPoint[]> {
  const { filters } = parseEventsSearchParams(params)
  const result = await fetchPublicEvents({
    filters,
    page: 1,
    pageSize: 500,
    bbox,
  })

  const points: MapEventPoint[] = []
  for (const e of result.events) {
    if (e.venue_latitude === null || e.venue_longitude === null) continue
    const cheapest = e.ticket_tiers.length > 0
      ? Math.min(...e.ticket_tiers.map(t => t.price))
      : null
    const currency = e.ticket_tiers[0]?.currency ?? 'AUD'
    points.push({
      id: e.id,
      slug: e.slug,
      title: e.title,
      venue_city: e.venue_city,
      start_date: e.start_date,
      starting_from_cents: cheapest,
      is_free: e.is_free === true || (cheapest !== null && cheapest === 0),
      currency,
      lat: e.venue_latitude,
      lng: e.venue_longitude,
    })
  }
  return points
}
