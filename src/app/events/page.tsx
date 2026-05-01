import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  fetchPublicEvents,
  fetchPublicEventsCached,
  fetchActiveCategoriesCached,
} from '@/lib/events'
import {
  hasActiveFilters,
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
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

// ISR: re-render every 60 seconds. Pages with searchParams stay dynamic on
// filtered URLs but the bare /events route now caches. Geo detection moved
// off the server (no headers() call) so the shell is cookies/headers-free.
// Per-user recommendations stream via the EventsRecommendedSection
// Suspense boundary, which performs its own auth lookup post-shell.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Find your next event | EventLinqs',
  description:
    'Browse upcoming events by date, culture, city, and price. The ticketing platform built for every culture.',
  alternates: { canonical: '/events' },
}

type Props = {
  searchParams: Promise<EventsSearchParams>
}

export default async function EventsPage({ searchParams }: Props) {
  const raw = await searchParams
  const { filters, page, view } = parseEventsSearchParams(raw)

  const categories = await fetchActiveCategoriesCached()

  // Server-side geo detection (headers() / IP lookup) was removed to keep
  // /events ISR-eligible on the no-filter case. Country falls through to
  // the filter URL parameter or the AU default; distance-based queries
  // require an explicit origin from a client-side picker, which the
  // EventsFilterBar surfaces as a "use my location" affordance.
  const origin = undefined
  const hasGeoSignal = false

  // No country default. When filters.country is undefined the fetcher
  // skips the venue_country filter entirely (see fetchers.ts:376), so
  // the unfiltered grid surfaces every published event regardless of
  // venue_country casing in the seed data. The country chip in the
  // filter bar still lets users narrow by country explicitly.
  const effectiveFilters = filters
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
          categories={categories}
          view={view}
          hasGeoSignal={hasGeoSignal}
        />

        {/* Recommended rail is secondary - its per-event Pexels cascade
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
            initialCenter={MELBOURNE_FALLBACK}
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
