import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents, fetchRecommendedEvents } from '@/lib/events'
import {
  hasActiveFilters,
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { detectLocation } from '@/lib/geo/detect'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventsHeroStrip } from '@/components/features/events/m5-events-hero-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { RecommendedRail } from '@/components/features/events/m5-recommended-rail'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'

const MELBOURNE_FALLBACK = { lat: -37.8136, lng: 144.9631 }

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Discover events | EventLinqs',
  description:
    'Browse upcoming events by date, category, city, and price. Where the culture gathers.',
  alternates: { canonical: '/events' },
}

type Props = {
  searchParams: Promise<EventsSearchParams>
}

export default async function EventsPage({ searchParams }: Props) {
  const raw = await searchParams
  const { filters, page, view } = parseEventsSearchParams(raw)

  const supabase = await createClient()
  const [{ data: categories }, { data: userData }, location] = await Promise.all([
    supabase
      .from('event_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.auth.getUser(),
    detectLocation(),
  ])

  const userId = userData.user?.id ?? null
  const origin =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined
  const hasGeoSignal = location.source !== 'fallback' && origin !== undefined

  // Default the catalogue to the visitor's detected country unless they've
  // explicitly picked another via the ?country= URL param. Unknown / failed
  // detection falls back to Australia (primary market).
  const effectiveCountry = filters.country ?? location.country ?? 'Australia'
  const effectiveFilters = { ...filters, country: effectiveCountry }

  // Rail disappears when any narrowing filter is active (preset,
  // category, q, price, date range, distance). The country default is
  // not counted as a user filter. Parallel-fetch regardless so the grid
  // request isn't serialised behind the rail decision.
  const filterActive = hasActiveFilters(filters)
  const [result, recommended] = await Promise.all([
    fetchPublicEvents({ filters: effectiveFilters, page, pageSize: 24, origin }),
    filterActive
      ? Promise.resolve([])
      : fetchRecommendedEvents(userId, 12),
  ])

  const recHeadline: 'recommended' | 'popular' | null =
    filterActive || recommended.length === 0
      ? null
      : userId
        ? 'recommended'
        : 'popular'

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <EventsHeroStrip params={raw} total={result.total} />

        <EventsFilterBar
          params={raw}
          categories={(categories ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          view={view}
          hasGeoSignal={hasGeoSignal}
        />

        <RecommendedRail events={recommended} headline={recHeadline} />

        {view === 'map' ? (
          <EventsMapLazy
            params={raw}
            initialCenter={
              hasGeoSignal && origin
                ? { lat: origin.latitude, lng: origin.longitude }
                : MELBOURNE_FALLBACK
            }
          />
        ) : (
          <section aria-label="Event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <EventsGrid
              events={result.events}
              params={raw}
              page={result.page}
              totalPages={result.totalPages}
            />
            <EventsPagination params={raw} page={result.page} totalPages={result.totalPages} />
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
