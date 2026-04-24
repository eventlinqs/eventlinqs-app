import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents, fetchPublicEventsCached } from '@/lib/events'
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
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { EventsRecommendedSection } from '@/components/features/events/m5-events-recommended-section'
import { EventsRecommendedSkeleton } from '@/components/features/events/m5-events-skeletons'

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
  const [{ data: categories }, location] = await Promise.all([
    supabase
      .from('event_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order'),
    detectLocation(),
  ])

  const origin =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined
  const hasGeoSignal = location.source !== 'fallback' && origin !== undefined

  const effectiveCountry = filters.country ?? location.country ?? 'Australia'
  const effectiveFilters = { ...filters, country: effectiveCountry }
  const filterActive = hasActiveFilters(filters)

  // Grid stays inline so mobile browsers can begin preloading card
  // imagery as soon as the HTML is parsed. Suspense here regressed SI
  // because images started loading after the streamed chunk arrived
  // instead of during HTML parse.
  // Default-case (no filters, no distance) goes through the cached path
  // so PSI cache-bust queries share a warm snapshot; filtered/personalised
  // queries still hit the request-scoped client to respect filters and
  // distance-RPC semantics.
  const canUseCached =
    !filterActive &&
    typeof effectiveFilters.distance_km !== 'number' &&
    view !== 'map'
  const result = canUseCached
    ? await fetchPublicEventsCached({
        filters: effectiveFilters,
        page,
        pageSize: 24,
      })
    : await fetchPublicEvents({
        filters: effectiveFilters,
        page,
        pageSize: 24,
        origin,
      })

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

        {/* Recommended rail is secondary — its per-event Pexels cascade
            can stream after shell paint without regressing the grid's
            image-load timing. */}
        {!filterActive ? (
          <Suspense fallback={<EventsRecommendedSkeleton />}>
            <EventsRecommendedSection filterActive={filterActive} />
          </Suspense>
        ) : null}

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
