import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  fetchPublicEvents,
  fetchPublicEventsCached,
  fetchActiveCategoriesCached,
  fetchPopularThisWeekPublic,
} from '@/lib/events'
import {
  hasActiveFilters,
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { getPickerCities, type PickerCity } from '@/lib/locations/picker-cities'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventsHeroStrip } from '@/components/features/events/m5-events-hero-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { RecommendedRail } from '@/components/features/events/m5-recommended-rail'

// ISR: pre-render every picker city at build time. Bare /events/browse/[city]
// (no searchParams) hits the cached static HTML; filtered URLs render
// dynamic but reuse the same cookies-free data path.
export const revalidate = 120
export const dynamicParams = true

export async function generateStaticParams() {
  const groups = await getPickerCities()
  const all = [
    ...groups.australia,
    ...groups.internationalByCountry.flatMap(g => g.cities),
  ]
  return all.map(c => ({ city: c.slug }))
}

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

  // Origin resolves from the city geometry only (city.latitude/longitude),
  // not from a server-side IP lookup. detectLocation() called headers()
  // which silently disqualified this route from ISR; the fallback to a
  // visitor's IP geo was redundant when we are already in a city-scoped
  // page anyway.
  const origin =
    city.latitude !== null && city.longitude !== null
      ? { latitude: city.latitude, longitude: city.longitude }
      : undefined
  const hasGeoSignal = origin !== undefined

  const effectiveFilters = { ...filters, city: city.city, country: undefined }
  const filterActive = hasActiveFilters(filters)

  // Main catalogue fetch stays inline so mobile browsers can start
  // preloading card imagery as soon as the HTML is parsed. Suspense on
  // the grid regressed SI on /events mobile for the same reason  -
  // images only begin loading after the streamed chunk arrives, which
  // stretches Lighthouse's visual-progress integral.
  // Parallelise categories + main grid + popular rail. Popular rail data
  // is now fetched at the page level (not inside EventsPopularSection)
  // so all three queries run concurrently rather than serially blocking
  // TTFB. The rail's first card is the LCP candidate; resolving its
  // image src in the initial render lets the auto-injected preload
  // emit in <head> instead of in a streamed Suspense chunk.
  const canUseCached =
    !filterActive &&
    typeof effectiveFilters.distance_km !== 'number' &&
    view !== 'map'
  const [categories, result, popularEvents] = await Promise.all([
    fetchActiveCategoriesCached(),
    canUseCached
      ? fetchPublicEventsCached({
          filters: effectiveFilters,
          page,
          pageSize: 24,
        })
      : fetchPublicEvents({
          filters: effectiveFilters,
          page,
          pageSize: 24,
          origin,
        }),
    !filterActive ? fetchPopularThisWeekPublic(12, city.city) : Promise.resolve([]),
  ])

  const basePath = `/events/browse/${city.slug}`

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
          categories={categories}
          view={view}
          hasGeoSignal={hasGeoSignal}
          basePath={basePath}
        />

        {!filterActive && popularEvents.length > 0 ? (
          <RecommendedRail
            events={popularEvents}
            headline="popular"
            seeAllHref={`${basePath}?sort=popular`}
          />
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
                <h2 className="sr-only">Events in {city.city}</h2>
                <EventsGrid
                  events={result.events}
                  params={raw}
                  page={result.page}
                  totalPages={result.totalPages}
                  firstCardEager={filterActive}
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
