import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { formatEventDateShort, PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getCity,
  getAllCities,
  isCitySlug,
  getSuburbsForCity,
  CITY_EVENT_TYPES,
} from '@/lib/cities/data'
import { getAllCommunities } from '@/lib/communities/data'
import { getCityHeroPhoto, getCityPhoto } from '@/lib/images/city-photo'
import { getSuburbHeroPhoto } from '@/lib/images/suburb-photo'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { CityLandingPage } from '@/components/templates/CityLandingPage'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import type { EventCardData } from '@/components/features/events/event-card'
import type { MapEventPin } from '@/components/features/city/city-map'
import { getSiteUrl } from '@/lib/site-url'
import {
  listingWindowOrPredicate,
  startOfLocalDayUtcOffset,
  weekendWindowUtc,
} from '@/lib/events/listing-window'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllCities().map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = getCity(slug)
  if (!city) return { title: 'Not Found | EventLinqs' }

  const title = `Things to do in ${city.name} | EventLinqs`
  const description = city.editorial.slice(0, 155)
  return {
    title,
    description,
    keywords: city.keywords,
    alternates: { canonical: `/city/${city.slug}` },
    openGraph: { title, description, url: `/city/${city.slug}`, type: 'website', images: ['/opengraph-image'] },
  }
}

/**
 * The rail windows for this page, every boundary in the PLATFORM zone.
 *
 * `setHours` was the server's zone, which on Vercel is UTC, so an Australian
 * Saturday evening could fall outside the window called This weekend. That is
 * exclusion audit item 3, and it survived here after being fixed in the
 * /events presets. `todayStartIso` is the other half: a rail that includes
 * today starts at the start of today, never at `now`, or an event that began
 * this morning drops out of This week while it is still on (audit item 1).
 */
function dayWindow(now: Date) {
  const zone = PLATFORM_TIME_ZONE
  const dayStart = (n: number) => startOfLocalDayUtcOffset(now, zone, n)
  const dayEnd = (n: number) => new Date(dayStart(n + 1).getTime() - 1)
  const weekend = weekendWindowUtc(now, zone)
  return {
    nowIso: now.toISOString(),
    todayStartIso: dayStart(0).toISOString(),
    sevenDaysIso: dayEnd(7).toISOString(),
    thirtyDaysIso: dayEnd(30).toISOString(),
    weekendStartIso: weekend.from.toISOString(),
    weekendEndIso: weekend.to.toISOString(),
  }
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params
  if (!isCitySlug(slug)) notFound()
  const city = getCity(slug)!

  const supabase = createPublicClient()
  const w = dayWindow(new Date())

  // City-scoped event query: published + public, future-dated, venue_city
  // ilike match (city_primary FK is the new path post-migration; until
  // organisers fill the column, venue_city ilike is the bridge).
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, timezone, venue_name, venue_city, venue_country, venue_latitude, venue_longitude, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

  const { data: rows } = await withBuildRetry(
    () =>
      supabase
        .from('events')
        .select(baseSelect)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .or(listingWindowOrPredicate(new Date(w.nowIso)))
        .ilike('venue_city', `%${city.name}%`)
        .order('start_date', { ascending: true })
        .limit(120),
    { label: `city/${city.slug}` },
  )

  const allRaw = (rows ?? []) as unknown as (EventCardData & {
    end_date?: string
    venue_latitude?: number | null
    venue_longitude?: number | null
    /** The event's own zone, so its date is not formatted in the reader's. */
    timezone?: string | null
  })[]

  const allEvents: EventCardData[] = allRaw.map(r => ({
    id: r.id, slug: r.slug, title: r.title,
    cover_image_url: r.cover_image_url, thumbnail_url: r.thumbnail_url,
    start_date: r.start_date,
    venue_name: r.venue_name, venue_city: r.venue_city, venue_country: r.venue_country,
    created_at: r.created_at, is_free: r.is_free,
    category: r.category, ticket_tiers: r.ticket_tiers ?? [],
  }))

  // From the START OF TODAY, not from `now`: an event that started this
  // morning is still on and still belongs in This week (exclusion audit item 1).
  const thisWeekEvents = allEvents.filter(e => e.start_date >= w.todayStartIso && e.start_date <= w.sevenDaysIso)
  const thisWeekendEvents = allEvents.filter(e => e.start_date >= w.weekendStartIso && e.start_date <= w.weekendEndIso)
  const popularEvents = allEvents.slice(0, 12)

  // Map pins: only events with geocoded venues, capped at 100.
  const mapPins: MapEventPin[] = allRaw
    .filter(r => typeof r.venue_latitude === 'number' && typeof r.venue_longitude === 'number')
    .slice(0, 100)
    .map(r => {
      const cheapest = r.ticket_tiers && r.ticket_tiers.length > 0 ? Math.min(...r.ticket_tiers.map(t => t.price)) : 0
      // The EVENT's zone, never the reader's: a 9pm Perth event reads as
      // the next day in Sydney.
      const dateStr = formatEventDateShort(r.start_date, r.timezone)
      return {
        id: r.id, slug: r.slug, title: r.title,
        date: dateStr,
        suburb: r.venue_city,
        price: cheapest > 0 ? `From AUD $${(cheapest / 100).toFixed(0)}` : 'Free',
        cover: r.cover_image_url,
        latitude: r.venue_latitude as number,
        longitude: r.venue_longitude as number,
      }
    })

  const suburbs = getSuburbsForCity(city.slug)
  const eventTypeSlugs = CITY_EVENT_TYPES.map(t => t.slug)

  const communities = getAllCommunities()

  const heroImage = await getCityHeroPhoto(city.slug)

  const [eventTypePhotos, suburbPhotos, relatedCityPhotos, communityPhotos] = await Promise.all([
    Promise.all(eventTypeSlugs.map(s => getCategoryPhoto(s))),
    Promise.all(suburbs.map(s => getSuburbHeroPhoto(s.slug))),
    Promise.all(city.relatedCities.map(s => getCityPhoto(s))),
    Promise.all(communities.map(c => getCommunityHeroPhoto(c.slug))),
  ])

  const eventTypeImages: Record<string, string | null> = {}
  eventTypeSlugs.forEach((t, i) => {
    eventTypeImages[t] = eventTypePhotos[i]?.src ?? null
  })

  const suburbImages: Record<string, string | null> = {}
  suburbs.forEach((s, i) => {
    suburbImages[s.slug] = suburbPhotos[i] ?? null
  })

  const relatedCityImages: Record<string, string | null> = {}
  city.relatedCities.forEach((s, i) => {
    relatedCityImages[s] = relatedCityPhotos[i] ?? null
  })

  const communityImages: Record<string, string | null> = {}
  communities.forEach((c, i) => {
    communityImages[c.slug] = communityPhotos[i] ?? null
  })

  const caption = `${allEvents.length} upcoming event${allEvents.length === 1 ? '' : 's'}`

  const baseUrl = getSiteUrl()
  const cityLd = {
    '@context': 'https://schema.org',
    '@type': 'City',
    name: city.name,
    containedInPlace: { '@type': 'Country', name: 'Australia' },
    url: `${baseUrl}/city/${city.slug}`,
    geo: { '@type': 'GeoCoordinates', latitude: city.latitude, longitude: city.longitude },
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Upcoming events in ${city.name}`,
    numberOfItems: allEvents.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: allEvents.slice(0, 12).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${baseUrl}/events/${e.slug}`,
      name: e.title,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cityLd) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Cities', url: `${baseUrl}/cities` },
          { name: city.name, url: `${baseUrl}/city/${city.slug}` },
        ]}
      />
      <CityLandingPage
        city={city}
        heroImage={heroImage}
        caption={caption}
        thisWeekEvents={thisWeekEvents}
        thisWeekendEvents={thisWeekendEvents}
        popularEvents={popularEvents}
        allEvents={allEvents}
        eventTypeImages={eventTypeImages}
        relatedCityImages={relatedCityImages}
        suburbImages={suburbImages}
        communityImages={communityImages}
        suburbs={suburbs}
        mapPins={mapPins}
      />
    </>
  )
}
