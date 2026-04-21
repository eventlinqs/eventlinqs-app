import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents, fetchRecommendedEvents } from '@/lib/events'
import {
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { detectLocation } from '@/lib/geo/detect'
import { getPickerCities, type PickerCity } from '@/lib/locations/picker-cities'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventsHeroStrip } from '@/components/features/events/m5-events-hero-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { RecommendedRail } from '@/components/features/events/m5-recommended-rail'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMap } from '@/components/features/events/m5-events-map'

export const revalidate = 60

type Props = {
  params: Promise<{ city: string }>
  searchParams: Promise<EventsSearchParams>
}

const MELBOURNE_FALLBACK = { lat: -37.8136, lng: 144.9631 }

/**
 * Resolve the slug to a PickerCity (launch list or DB-sourced). Returns
 * null when the slug isn't present in either source — the page then
 * renders notFound() so we don't spawn infinite SEO URLs for garbage
 * input.
 */
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

  // When the city has known coordinates (launch cities + picker cities
  // with geocode data), use them as the geo origin so distance filters
  // and map centring are anchored to the city instead of the visitor's
  // detected location.
  const origin =
    city.latitude !== null && city.longitude !== null
      ? { latitude: city.latitude, longitude: city.longitude }
      : location.latitude !== null && location.longitude !== null
        ? { latitude: location.latitude, longitude: location.longitude }
        : undefined
  const hasGeoSignal = origin !== undefined

  // The path drives the city filter; any ?city= in the query is ignored
  // so /events/browse/melbourne?city=sydney doesn't produce confusing
  // cross-filtered results.
  const effectiveFilters = { ...filters, city: city.city, country: undefined }

  const [result, recommended] = await Promise.all([
    fetchPublicEvents({ filters: effectiveFilters, page, pageSize: 24, origin }),
    fetchRecommendedEvents(userId, 12),
  ])

  const recHeadline: 'recommended' | 'popular' | null =
    recommended.length === 0 ? null : userId ? 'recommended' : 'popular'

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
          categories={(categories ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          view={view}
          hasGeoSignal={hasGeoSignal}
          basePath={basePath}
        />

        <RecommendedRail events={recommended} headline={recHeadline} />

        {view === 'map' ? (
          <EventsMap
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
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
        >
          Browse all events
        </Link>
      </div>
    </div>
  )
}
