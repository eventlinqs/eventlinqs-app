import { notFound, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCulture,
  isCultureSlug,
  type CultureSlug,
} from '@/lib/cultures/data'
import { getCultureRedirect } from '@/lib/cultures/redirects'
import { getCity, isCitySlug } from '@/lib/cities/data'
import { buildCultureTagOrFilter } from '@/lib/cultures/tag-bridge'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getSubCulturePhoto } from '@/lib/images/sub-culture-photo'
import { citySlugify } from '@/components/features/culture/cities-rail'
import {
  getIntersectionEditorial,
  getIntersectionHeroSubtitle,
} from '@/lib/cultures/intersection-editorial'
import { CultureCityLandingPage } from '@/components/templates/CultureCityLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'
import type { MapEventPin } from '@/components/features/city/city-map'

export const revalidate = 300

interface Props {
  params: Promise<{ culture: string; city: string }>
}

/**
 * Long tail: culture x city intersections multiply to hundreds of DB-backed
 * pages, kept off the build-time Supabase pool by rendering on-demand. NO
 * generateStaticParams: an EMPTY gSP pins the route STATIC, so the first
 * on-demand request 500'd ("Page changed from static to dynamic at runtime,
 * reason: cookies") when the shared SiteHeader (PageShell, non-staticSafe) did
 * its render-time auth cookie read - the same failure /events/[slug] fixed.
 * Dropping gSP + the `await headers()` marker makes the route dynamic-on-demand:
 * nothing prerenders at build (pool-safe), notFound() returns a real 404, and
 * revalidate=300 keeps it edge-cached. The sitemap still lists curated
 * intersections.
 */

function findCityName(cultureSlug: string, citySlug: string): string | null {
  const culture = getCulture(cultureSlug)
  if (!culture) return null
  // 1. Curated culture.cities list (always wins - editorial pairs).
  const fromCulture = culture.cities.find(c => citySlugify(c) === citySlug)
  if (fromCulture) return fromCulture
  // 2. Fallback: any AU city slug from the `cities` table renders the
  //    intersection page even if the culture's curated list does not
  //    name it. The events query downstream may return zero rows; the
  //    page handles empty state. This closes the Batch 11.1 D3.3 link
  //    audit gap where /city/[slug] pages emitted intersection links
  //    for smaller AU cities (Albury, Ballarat, Bendigo, Launceston,
  //    Sunshine Coast, Toowoomba, Townsville) that 404'd because no
  //    culture's curated list included them.
  if (isCitySlug(citySlug)) {
    const cityRecord = getCity(citySlug)
    if (cityRecord) return cityRecord.name
  }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { culture: cultureParam, city: cityParam } = await params
  const culture = getCulture(cultureParam)
  const cityName = culture ? findCityName(cultureParam, cityParam) : null
  if (!culture || !cityName) return { title: 'Not Found | EventLinqs' }

  const title = `${culture.displayName} events in ${cityName} | EventLinqs`
  const description = `${culture.displayName} events on tonight in ${cityName}. ${culture.tagline}`.slice(0, 155)

  return {
    title,
    description,
    keywords: [
      ...culture.keywords,
      `${culture.displayName} ${cityName}`,
      `${cityName} ${culture.displayName.toLowerCase()} events`,
    ],
    alternates: { canonical: `/culture/${culture.slug}/${cityParam}` },
    openGraph: {
      title,
      description,
      url: `/culture/${culture.slug}/${cityParam}`,
      type: 'website',
      images: ['/opengraph-image'],
    },
  }
}

function weekendWindow(now: Date) {
  const day = now.getDay()
  const start = new Date(now)
  if (day === 6) start.setHours(0, 0, 0, 0)
  else if (day === 0) { start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0) }
  else { start.setDate(now.getDate() + (6 - day)); start.setHours(0, 0, 0, 0) }
  const end = new Date(start); end.setDate(start.getDate() + 1); end.setHours(23, 59, 59, 999)
  return { weekendStartIso: start.toISOString(), weekendEndIso: end.toISOString() }
}

export default async function CultureByCityPage({ params }: Props) {
  const { culture: cultureParam, city: cityParam } = await params
  const redirectTarget = getCultureRedirect(cultureParam, cityParam)
  if (redirectTarget) permanentRedirect(redirectTarget)
  if (!isCultureSlug(cultureParam)) notFound()

  const culture = getCulture(cultureParam)!
  const cityName = findCityName(cultureParam, cityParam)
  if (!cityName) notFound()

  // Mark the route dynamic-on-demand AFTER the synchronous notFound/redirect
  // guards (so unknown culture-city pairs still hard-404). Without this the
  // empty-gSP static pin + the SiteHeader render-time cookie read 500 the
  // first request.
  await headers()

  // City record lookup (for lat/lng + state). Many international or
  // smaller cities listed in CultureContent.cities won't have a record
  // in the cities table; the map section hides cleanly when null.
  const cityRecord = isCitySlug(cityParam) ? getCity(cityParam) : null

  const supabase = createPublicClient()
  const tagOr = buildCultureTagOrFilter(culture.slug)
  const now = new Date()
  const w = weekendWindow(now)
  const sevenDays = new Date(now); sevenDays.setDate(now.getDate() + 7)

  // Events in this city whose `tags` jsonb array contains any
  // identifying token for the culture (tag-bridge). The legacy
  // category-bridge resolved every culture to zero on live
  // generic-category events.
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, venue_latitude, venue_longitude, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

  let allEvents: EventCardData[] = []
  let mapPins: MapEventPin[] = []
  if (tagOr !== null) {
    const { data } = await supabase
      .from('events')
      .select(baseSelect)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', now.toISOString())
      .ilike('venue_city', `%${cityName}%`)
      .or(tagOr)
      .order('start_date', { ascending: true })
      .limit(120)

    const raw = (data ?? []) as unknown as (EventCardData & {
      venue_latitude?: number | null
      venue_longitude?: number | null
    })[]

    const filtered = raw
    allEvents = filtered

    mapPins = filtered
      .filter(r => typeof r.venue_latitude === 'number' && typeof r.venue_longitude === 'number')
      .slice(0, 100)
      .map(r => {
        const cheapest = r.ticket_tiers && r.ticket_tiers.length > 0 ? Math.min(...r.ticket_tiers.map(t => t.price)) : 0
        const dateStr = new Date(r.start_date).toLocaleDateString('en-AU', {
          weekday: 'short', day: 'numeric', month: 'short',
        })
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
  }

  const thisWeekendEvents = allEvents.filter(
    e => e.start_date >= w.weekendStartIso && e.start_date <= w.weekendEndIso,
  )
  const thisWeekEvents = allEvents.filter(
    e => e.start_date >= now.toISOString() && e.start_date <= sevenDays.toISOString(),
  )
  const popularEvents = allEvents.slice(0, 12)

  // Image fetches: hero + sub-cultures + related-cities + related-cultures.
  // The "[Culture] in other cities" rail uses the OTHER cities for this
  // culture (everything in culture.cities minus the current one).
  const otherCityNames = culture.cities.filter(c => citySlugify(c) !== cityParam)
  const relatedCitiesEntries = otherCityNames.slice(0, 8).map(name => ({
    cultureSlug: culture.slug,
    cultureLabel: culture.displayName,
    citySlug: citySlugify(name),
    cityLabel: name,
  }))

  // The "Other cultures in [city]" rail uses culture.relatedCultures
  // (3 cultures the editorial team flagged as adjacent scenes).
  const otherCultures = (culture.relatedCultures as CultureSlug[])
    .map(slug => getCulture(slug))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6)

  const subCultureSlugs = culture.subCultures.map(s => s.slug)

  // allowBundledFallback on the culture fallback so the page hero always
  // has a measurable LCP element when both the city and the Pexels culture
  // lookup return null. Same rationale as src/app/culture/[culture]/page.tsx.
  const heroImage = await getCityHeroPhoto(cityParam)
    ?? await getCultureHeroPhoto(culture.slug, { allowBundledFallback: true })

  const [subCulturePhotos, relatedCityPhotos, relatedCulturePhotos] = await Promise.all([
    Promise.all(subCultureSlugs.map(s => getSubCulturePhoto(culture.slug, s))),
    Promise.all(relatedCitiesEntries.map(r => getCityHeroPhoto(r.citySlug))),
    Promise.all(otherCultures.map(c => getCultureHeroPhoto(c.slug))),
  ])

  const subCultureImages: Record<string, string | null> = {}
  subCultureSlugs.forEach((s, i) => { subCultureImages[s] = subCulturePhotos[i] ?? null })

  const relatedCities = relatedCitiesEntries.map((entry, i) => ({
    ...entry,
    image: relatedCityPhotos[i] ?? null,
  }))

  const relatedCultures = otherCultures.map((c, i) => ({
    slug: c.slug,
    label: c.displayName,
    tagline: c.tagline,
    image: relatedCulturePhotos[i] ?? null,
  }))

  const editorial = getIntersectionEditorial(culture, cityParam, cityName, cityRecord)
  const heroSubtitle = getIntersectionHeroSubtitle(culture, cityParam, cityName)

  const caption = `${allEvents.length} upcoming event${allEvents.length === 1 ? '' : 's'}`

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${culture.displayName} events in ${cityName} on EventLinqs`,
    description: `${culture.displayName} events in ${cityName}. ${culture.tagline}`.slice(0, 200),
    url: `${baseUrl}/culture/${culture.slug}/${cityParam}`,
    inLanguage: 'en-AU',
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: allEvents.length,
      itemListElement: allEvents.slice(0, 12).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${baseUrl}/events/${e.slug}`,
        name: e.title,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <CultureCityLandingPage
        culture={culture}
        cityName={cityName}
        citySlug={cityParam}
        cityRecord={cityRecord}
        heroImage={heroImage}
        editorial={editorial}
        heroSubtitle={heroSubtitle}
        caption={caption}
        thisWeekEvents={thisWeekEvents}
        thisWeekendEvents={thisWeekendEvents}
        popularEvents={popularEvents}
        allEvents={allEvents}
        subCultureImages={subCultureImages}
        relatedCities={relatedCities}
        relatedCultures={relatedCultures}
        mapPins={mapPins}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
      />
    </>
  )
}
