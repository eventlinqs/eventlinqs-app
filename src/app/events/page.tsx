import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents } from '@/lib/events'
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
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { EventsRecommendedSection } from '@/components/features/events/m5-events-recommended-section'
import { EventsResultsSection } from '@/components/features/events/m5-events-results-section'
import {
  EventsRecommendedSkeleton,
  EventsResultsSkeleton,
} from '@/components/features/events/m5-events-skeletons'

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

  // ── Shell data ───────────────────────────────────────────────────────
  // Inline awaits only: categories (filter bar), user (recommendation
  // scoring), detected location (country default). These three drive the
  // hero strip + filter bar which are above the fold.
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

  const effectiveCountry = filters.country ?? location.country ?? 'Australia'
  const effectiveFilters = { ...filters, country: effectiveCountry }
  const filterActive = hasActiveFilters(filters)

  // Main catalogue fetch stays inline because the hero needs `total` for
  // the "N events available" line. The expensive projectToCardData work
  // for each card happens inside EventsResultsSection, which is
  // Suspense-wrapped so its Pexels fallbacks don't block shell paint.
  const result = await fetchPublicEvents({
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

        {!filterActive ? (
          <Suspense fallback={<EventsRecommendedSkeleton />}>
            <EventsRecommendedSection userId={userId} filterActive={filterActive} />
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
          <Suspense fallback={<EventsResultsSkeleton />}>
            <EventsResultsSection
              events={result.events}
              params={raw}
              page={result.page}
              totalPages={result.totalPages}
            />
          </Suspense>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
