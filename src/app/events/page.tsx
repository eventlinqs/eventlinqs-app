import type { Metadata } from 'next'
import { Suspense } from 'react'
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
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { EventsPopularSection } from '@/components/features/events/m5-events-popular-section'
import { EventsCount, EventsResults } from '@/components/features/events/events-results'
import {
  EventsGridSkeleton,
  EventsCountSkeleton,
} from '@/components/features/events/events-loading-skeletons'

const MELBOURNE_FALLBACK = { lat: -37.8136, lng: 144.9631 }

// ISR: re-render every 60 seconds. Pages with searchParams stay dynamic on
// filtered URLs but the bare /events route now caches. Geo detection moved
// off the server (no headers() call) so the shell is cookies/headers-free.
// The hero strip + filter bar render in the immediate shell (the LCP anchor);
// the popular rail and results grid stream behind in-page <Suspense> with
// designed skeletons - NOT a segment loading.tsx (that would wrap the
// /events/[slug] + /events/browse/[city] children and break their hard 404s).
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Find your next event | EventLinqs',
  description:
    'Browse upcoming events by date, community, city, and price. The ticketing platform built for every community.',
  alternates: { canonical: '/events' },
}

type Props = {
  searchParams: Promise<EventsSearchParams>
}

export default async function EventsPage({ searchParams }: Props) {
  const raw = await searchParams
  const { filters, page, view } = parseEventsSearchParams(raw)

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

  // Search framing: when the user arrives with a text query, the hero
  // acknowledges it ("Results for ...") instead of the generic browse
  // heading. This is the /events?q= search-results experience; both
  // Ticketmaster and Eventbrite frame a query explicitly. Trimmed and
  // capped so a pasted essay cannot blow out the H1; React escapes it.
  const searchQuery = typeof raw.q === 'string' ? raw.q.trim().slice(0, 80) : ''

  // Default-case (no filters, no distance) goes through the cached path
  // so PSI cache-bust queries share a warm snapshot; filtered/personalised
  // queries still hit the request-scoped client to respect filters and
  // distance-RPC semantics.
  const canUseCached =
    !filterActive &&
    typeof effectiveFilters.distance_km !== 'number' &&
    view !== 'map'

  // The events fetch is the slow region. Create the promise but DON'T await it
  // here - awaiting would block the hero strip + filter bar (and the LCP).
  // Instead the SAME promise is handed to two in-page <Suspense> children (the
  // hero count + the results grid), which stream behind designed skeletons
  // while the shell paints immediately. One fetch feeds both. `categories` is
  // always-cached (fast), so the filter bar can await it without blocking
  // meaningfully.
  const resultPromise = canUseCached
    ? fetchPublicEventsCached({ filters: effectiveFilters, page, pageSize: 24 })
    : fetchPublicEvents({ filters: effectiveFilters, page, pageSize: 24, origin })
  const categories = await fetchActiveCategoriesCached()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <EventsHeroStrip
          params={raw}
          heading={searchQuery ? `Results for "${searchQuery}"` : undefined}
          countSlot={
            <Suspense fallback={<EventsCountSkeleton />}>
              <EventsCount resultPromise={resultPromise} />
            </Suspense>
          }
        />

        <EventsFilterBar
          params={raw}
          categories={categories}
          view={view}
          hasGeoSignal={hasGeoSignal}
        />

        {/* Popular rail renders INLINE (not behind Suspense): its first card
            image is the /events LCP candidate and must be discoverable in the
            initial HTML (priority preload) during parse. Wrapping it in Suspense
            pushed the LCP image behind a streamed chunk and regressed mobile LCP
            to ~5.2s (Lighthouse). The rail's own fetch (anon, cached) is fast.
            Only the below-the-fold results grid streams behind a skeleton. */}
        {!filterActive ? (
          <EventsPopularSection filterActive={filterActive} />
        ) : null}

        {view === 'map' ? (
          <EventsMapLazy
            params={raw}
            initialCenter={MELBOURNE_FALLBACK}
          />
        ) : (
          <section aria-label="Event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="sr-only">All events</h2>
            {/* Results grid streams behind the designed zero-CLS skeleton - it is
                below the fold (and below the popular rail), so this never affects
                the LCP. Hero + filter bar render immediately above. */}
            <Suspense fallback={<EventsGridSkeleton />}>
              <EventsResults
                resultPromise={resultPromise}
                params={raw}
                filterActive={filterActive}
              />
            </Suspense>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
