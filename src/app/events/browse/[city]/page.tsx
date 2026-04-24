import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents, fetchPublicEventsCached } from '@/lib/events'
import {
  hasActiveFilters,
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { detectLocation } from '@/lib/geo/detect'
import { getPickerCities, type PickerCity } from '@/lib/locations/picker-cities'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventsHeroStrip } from '@/components/features/events/m5-events-hero-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { EventsBrowseRecommendedSection } from '@/components/features/events/m5-events-browse-recommended-section'
import { EventsRecommendedSkeleton } from '@/components/features/events/m5-events-skeletons'

export const revalidate = 60

type Props = {
  params: Promise<{ city: string }>
  searchParams: Promise<EventsSearchParams>
}

const MELBOURNE_FALLBACK = { lat: -37.8136, lng: 144.9631 }

async function resolveCity(slug: string): Promise<PickerCity | null> {
  const groups = await getPickerCities()
  const all = [
    ...groups.australia,
    ...groups.internationalByCountry.flatMap(g => g.cities),
  ]
  return all.find(c => c.slug === slug) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params
  const city = await resolveCity(slug)
  if (!city) {
    return { title: 'City not found | EventLinqs' }
  }
  const title = `Events in ${city.city} | EventLinqs`
  const description = `Discover upcoming events, concerts, and experiences in ${city.city}, ${city.country}. All-in pricing, guest checkout, no hidden fees.`
  return {
    title,
    description,
    alternates: { canonical: `/events/browse/${city.slug}` },
    openGraph: {
      title,
      description,
      url: `/events/browse/${city.slug}`,
      type: 'website',
    },
  }
}

export default async function BrowseCityPage({ params, searchParams }: Props) {
  const [{ city: slug }, raw] = await Promise.all([params, searchParams])
  const city = await resolveCity(slug)
  if (!city) notFound()

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
    city.latitude !== null && city.longitude !== null
      ? { latitude: city.latitude, longitude: city.longitude }
      : location.latitude !== null && location.longitude !== null
        ? { latitude: location.latitude, longitude: location.longitude }
        : undefined
  const hasGeoSignal = origin !== undefined

  const effectiveFilters = { ...filters, city: city.city, country: undefined }
  const filterActive = hasActiveFilters(filters)

  // Main catalogue fetch stays inline so mobile browsers can start
  // preloading card imagery as soon as the HTML is parsed. Suspense on
  // the grid regressed SI on /events mobile for the same reason —
  // images only begin loading after the streamed chunk arrives, which
  // stretches Lighthouse's visual-progress integral.
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

  const basePath = `/events/browse/${city.slug}`
  const railSeeAllHref = `${basePath}?sort=popular`

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <EventsHeroStrip
          params={raw}
          total={result.total}
          basePath={basePath}
          heading={`Events in ${city.city}`}
          subtitle={city.country}
        />

        <EventsFilterBar
          params={raw}
          categories={(categories ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          view={view}
          hasGeoSignal={hasGeoSignal}
          basePath={basePath}
        />

        {!filterActive ? (
          <Suspense fallback={<EventsRecommendedSkeleton />}>
            <EventsBrowseRecommendedSection
              filterActive={filterActive}
              cityName={city.city}
              seeAllHref={railSeeAllHref}
            />
          </Suspense>
        ) : null}

        {view === 'map' ? (
          <EventsMapLazy
            params={raw}
            initialCenter={
              origin
                ? { lat: origin.latitude, lng: origin.longitude }
                : MELBOURNE_FALLBACK
            }
          />
        ) : (
          <section aria-label="Event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {result.events.length === 0 ? (
              <EmptyCityState city={city} />
            ) : (
              <>
                <EventsGrid
                  events={result.events}
                  params={raw}
                  page={result.page}
                  totalPages={result.totalPages}
                />
                <EventsPagination
                  params={raw}
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath={basePath}
                />
              </>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}

function EmptyCityState({ city }: { city: PickerCity }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-ink-100 bg-white px-6 py-10 text-center">
      <h2 className="font-display text-xl font-bold text-ink-900">
        No events in {city.city} yet
      </h2>
      <p className="mt-2 text-sm text-ink-600">
        We&rsquo;re launching in {city.city} soon. In the meantime, browse events
        across {city.country} or further afield.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/events"
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
        >
          Browse all events
        </Link>
      </div>
    </div>
  )
}
