import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
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
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { PhotographicCityHero } from '@/components/templates/PhotographicCityHero'
import { EventsSearchStrip } from '@/components/features/events/m5-events-search-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'
import { EventsMapLazy } from '@/components/features/events/m5-events-map-lazy'
import { RecommendedRail } from '@/components/features/events/m5-recommended-rail'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { getSiteUrl } from '@/lib/site-url'

// Rendered dynamically on demand (see the headers() note in the component) -
// same reason and approach as /events/[slug]. No generateStaticParams: an empty
// gSP pinned Turbopack to a static classification and the shared chrome's
// render-time cookie read 500'd the first on-demand request. Dropping gSP makes
// the route dynamic (nothing prerenders at build - pool-safe) and preserves
// notFound() -> 404. The sitemap still lists every browse city.
export const revalidate = 120

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
      // WITHOUT THIS THE PAGE SHARES WITH NO PREVIEW CARD AT ALL.
      //
      // Declaring an openGraph object here and omitting images does not fall
      // back to the root opengraph-image.tsx: it suppresses it. Measured on
      // 2 September 2026, /events/browse/melbourne was the only public surface
      // of six with NO og:image tag, while /city/[slug], /community/[community]
      // and the homepage all carried one. Those two both spell this line out
      // (city page line 52, community page line 52) and that is why they work.
      //
      // It matters more here than the count suggests: there are 22 of these city
      // browse pages in the production sitemap, and every one of them was
      // sharing to Facebook, LinkedIn and X as a bare link.
      images: ['/opengraph-image'],
    },
  }
}

export default async function BrowseCityPage({ params, searchParams }: Props) {
  // Mark the route dynamic the natural way (see /events/[slug] for the full
  // rationale): generateStaticParams -> [] left Next classifying this static, so
  // the first on-demand request hit the shared chrome's render-time cookie/
  // header read and 500'd. A no-op `headers()` read marks the route dynamic
  // (the documented ISR-disqualifier in this repo), but it must come AFTER the
  // notFound() guard - accessing request data first would commit a streaming
  // 200 and soft-404 an unknown city. cookies-free resolveCity keeps the guard
  // clean.
  const [{ city: slug }, raw] = await Promise.all([params, searchParams])
  const city = await resolveCity(slug)
  if (!city) notFound()
  await headers()

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
  const [categories, result, popularEvents, heroImage] = await Promise.all([
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
    getCityHeroPhoto(city.slug),
  ])

  const basePath = `/events/browse/${city.slug}`

  // STRUCTURED DATA (added 2026-08-23). A production audit found all 21 of
  // these URLs in the sitemap emitting zero JSON-LD, on the surface that
  // answers "what is on in Brisbane".
  //
  // Emitted ONLY on the unfiltered first page. Every filtered or paginated view
  // already canonicalises to this same base path (see generateMetadata), so
  // describing a filtered subset as if it were the whole collection would
  // contradict our own canonical and misstate numberOfItems.
  const siteUrl = getSiteUrl()
  const collectionUrl = `${siteUrl}${basePath}`
  const isCanonicalView = !filterActive && result.page === 1

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {isCanonicalView && (
        <>
          <EventCollectionJsonLd
            url={collectionUrl}
            name={`Events in ${city.city}`}
            description={`Upcoming events, concerts and experiences in ${city.city}, ${city.country}.`}
            events={result.events.map(e => ({ slug: e.slug, title: e.title }))}
            baseUrl={siteUrl}
          />
          <BreadcrumbJsonLd
            items={[
              { name: 'Home', url: `${siteUrl}/` },
              { name: 'Events', url: `${siteUrl}/events` },
              { name: city.city, url: collectionUrl },
            ]}
          />
        </>
      )}
      <SiteHeader staticSafe />
      <main className="flex-1">
        <PhotographicCityHero
          city={city.city}
          country={city.country}
          total={result.total}
          imageSrc={heroImage}
        />

        <EventsSearchStrip
          params={raw}
          basePath={basePath}
          placeholder={`Search events in ${city.city}…`}
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
        EventLinqs is open in {city.city} today, so the first one here could be
        yours. Put your event on free, or browse what is on across{' '}
        {city.country}.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/organisers"
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
        >
          Put on an event
        </Link>
        <Link
          href="/events"
          className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300"
        >
          Browse all events
        </Link>
      </div>
    </div>
  )
}
