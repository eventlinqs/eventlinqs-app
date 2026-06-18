import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getCity,
  getAllCities,
  isCitySlug,
  getSuburbsForCity,
  CITY_EVENT_TYPES,
} from '@/lib/cities/data'
import { getAllCultures } from '@/lib/cultures/data'
import { getCityHeroPhoto, getCityPhoto } from '@/lib/images/city-photo'
import { getSuburbHeroPhoto } from '@/lib/images/suburb-photo'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { CityLandingPage } from '@/components/templates/CityLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'
import type { MapEventPin } from '@/components/features/city/city-map'

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

function dayWindow(now: Date) {
  const sevenDays = new Date(now); sevenDays.setDate(now.getDate() + 7)
  const thirtyDays = new Date(now); thirtyDays.setDate(now.getDate() + 30)
  // weekend: Sat 00:00 -> Sun 23:59 of the upcoming weekend
  const day = now.getDay()
  const weekendStart = new Date(now)
  if (day === 6) weekendStart.setHours(0, 0, 0, 0)
  else if (day === 0) { weekendStart.setDate(now.getDate() - 1); weekendStart.setHours(0, 0, 0, 0) }
  else { weekendStart.setDate(now.getDate() + (6 - day)); weekendStart.setHours(0, 0, 0, 0) }
  const weekendEnd = new Date(weekendStart); weekendEnd.setDate(weekendStart.getDate() + 1); weekendEnd.setHours(23, 59, 59, 999)
  return {
    nowIso: now.toISOString(),
    sevenDaysIso: sevenDays.toISOString(),
    thirtyDaysIso: thirtyDays.toISOString(),
    weekendStartIso: weekendStart.toISOString(),
    weekendEndIso: weekendEnd.toISOString(),
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
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, venue_latitude, venue_longitude, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

  const { data: rows } = await withBuildRetry(
    () =>
      supabase
        .from('events')
        .select(baseSelect)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', w.nowIso)
        .ilike('venue_city', `%${city.name}%`)
        .order('start_date', { ascending: true })
        .limit(120),
    { label: `city/${city.slug}` },
  )

  const allRaw = (rows ?? []) as unknown as (EventCardData & { end_date?: string; venue_latitude?: number | null; venue_longitude?: number | null })[]

  const allEvents: EventCardData[] = allRaw.map(r => ({
    id: r.id, slug: r.slug, title: r.title,
    cover_image_url: r.cover_image_url, thumbnail_url: r.thumbnail_url,
    start_date: r.start_date,
    venue_name: r.venue_name, venue_city: r.venue_city, venue_country: r.venue_country,
    created_at: r.created_at, is_free: r.is_free,
    category: r.category, ticket_tiers: r.ticket_tiers ?? [],
  }))

  const thisWeekEvents = allEvents.filter(e => e.start_date >= w.nowIso && e.start_date <= w.sevenDaysIso)
  const thisWeekendEvents = allEvents.filter(e => e.start_date >= w.weekendStartIso && e.start_date <= w.weekendEndIso)
  const popularEvents = allEvents.slice(0, 12)

  // Map pins: only events with geocoded venues, capped at 100.
  const mapPins: MapEventPin[] = allRaw
    .filter(r => typeof r.venue_latitude === 'number' && typeof r.venue_longitude === 'number')
    .slice(0, 100)
    .map(r => {
      const cheapest = r.ticket_tiers && r.ticket_tiers.length > 0 ? Math.min(...r.ticket_tiers.map(t => t.price)) : 0
      const dateStr = new Date(r.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
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

  const cultures = getAllCultures()

  const heroImage = await getCityHeroPhoto(city.slug)

  const [eventTypePhotos, suburbPhotos, relatedCityPhotos, culturePhotos] = await Promise.all([
    Promise.all(eventTypeSlugs.map(s => getCategoryPhoto(s))),
    Promise.all(suburbs.map(s => getSuburbHeroPhoto(s.slug))),
    Promise.all(city.relatedCities.map(s => getCityPhoto(s))),
    Promise.all(cultures.map(c => getCultureHeroPhoto(c.slug))),
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

  const cultureImages: Record<string, string | null> = {}
  cultures.forEach((c, i) => {
    cultureImages[c.slug] = culturePhotos[i] ?? null
  })

  const caption = `${allEvents.length} upcoming event${allEvents.length === 1 ? '' : 's'}`

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
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
        cultureImages={cultureImages}
        suburbs={suburbs}
        mapPins={mapPins}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
      />
    </>
  )
}
