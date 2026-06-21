import { notFound, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCommunity,
  isCommunitySlug,
  type CommunitySlug,
} from '@/lib/communities/data'
import { getCommunityRedirect } from '@/lib/communities/redirects'
import { getCity, isCitySlug } from '@/lib/cities/data'
import { buildCommunityTagOrFilter } from '@/lib/communities/tag-bridge'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getSubCommunityPhoto } from '@/lib/images/sub-community-photo'
import { citySlugify } from '@/components/features/community/cities-rail'
import {
  getIntersectionEditorial,
  getIntersectionHeroSubtitle,
} from '@/lib/communities/intersection-editorial'
import { CommunityCityLandingPage } from '@/components/templates/CommunityCityLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'
import type { MapEventPin } from '@/components/features/city/city-map'

export const revalidate = 300

interface Props {
  params: Promise<{ community: string; city: string }>
}

/**
 * Long tail: community x city intersections multiply to hundreds of DB-backed
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

function findCityName(communitySlug: string, citySlug: string): string | null {
  const community = getCommunity(communitySlug)
  if (!community) return null
  // 1. Curated community.cities list (always wins - editorial pairs).
  const fromCommunity = community.cities.find(c => citySlugify(c) === citySlug)
  if (fromCommunity) return fromCommunity
  // 2. Fallback: any AU city slug from the `cities` table renders the
  //    intersection page even if the community's curated list does not
  //    name it. The events query downstream may return zero rows; the
  //    page handles empty state. This closes the Batch 11.1 D3.3 link
  //    audit gap where /city/[slug] pages emitted intersection links
  //    for smaller AU cities (Albury, Ballarat, Bendigo, Launceston,
  //    Sunshine Coast, Toowoomba, Townsville) that 404'd because no
  //    community's curated list included them.
  if (isCitySlug(citySlug)) {
    const cityRecord = getCity(citySlug)
    if (cityRecord) return cityRecord.name
  }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { community: communityParam, city: cityParam } = await params
  const community = getCommunity(communityParam)
  const cityName = community ? findCityName(communityParam, cityParam) : null
  if (!community || !cityName) return { title: 'Not Found | EventLinqs' }

  const title = `${community.displayName} events in ${cityName} | EventLinqs`
  const description = `${community.displayName} events on tonight in ${cityName}. ${community.tagline}`.slice(0, 155)

  return {
    title,
    description,
    keywords: [
      ...community.keywords,
      `${community.displayName} ${cityName}`,
      `${cityName} ${community.displayName.toLowerCase()} events`,
    ],
    alternates: { canonical: `/community/${community.slug}/${cityParam}` },
    openGraph: {
      title,
      description,
      url: `/community/${community.slug}/${cityParam}`,
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

export default async function CommunityByCityPage({ params }: Props) {
  const { community: communityParam, city: cityParam } = await params
  const redirectTarget = getCommunityRedirect(communityParam, cityParam)
  if (redirectTarget) permanentRedirect(redirectTarget)
  if (!isCommunitySlug(communityParam)) notFound()

  const community = getCommunity(communityParam)!
  const cityName = findCityName(communityParam, cityParam)
  if (!cityName) notFound()

  // Mark the route dynamic-on-demand AFTER the synchronous notFound/redirect
  // guards (so unknown community-city pairs still hard-404). Without this the
  // empty-gSP static pin + the SiteHeader render-time cookie read 500 the
  // first request.
  await headers()

  // City record lookup (for lat/lng + state). Many international or
  // smaller cities listed in CommunityContent.cities won't have a record
  // in the cities table; the map section hides cleanly when null.
  const cityRecord = isCitySlug(cityParam) ? getCity(cityParam) : null

  const supabase = createPublicClient()
  const tagOr = buildCommunityTagOrFilter(community.slug)
  const now = new Date()
  const w = weekendWindow(now)
  const sevenDays = new Date(now); sevenDays.setDate(now.getDate() + 7)

  // Events in this city whose `tags` jsonb array contains any
  // identifying token for the community (tag-bridge). The legacy
  // category-bridge resolved every community to zero on live
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

  // Image fetches: hero + sub-communities + related-cities + related-communities.
  // The "[Community] in other cities" rail uses the OTHER cities for this
  // community (everything in community.cities minus the current one).
  const otherCityNames = community.cities.filter(c => citySlugify(c) !== cityParam)
  const relatedCitiesEntries = otherCityNames.slice(0, 8).map(name => ({
    communitySlug: community.slug,
    communityLabel: community.displayName,
    citySlug: citySlugify(name),
    cityLabel: name,
  }))

  // The "Other communities in [city]" rail uses community.relatedCommunities
  // (3 communities the editorial team flagged as adjacent scenes).
  const otherCommunities = (community.relatedCommunities as CommunitySlug[])
    .map(slug => getCommunity(slug))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6)

  const subCommunitySlugs = community.subCommunities.map(s => s.slug)

  // allowBundledFallback on the community fallback so the page hero always
  // has a measurable LCP element when both the city and the Pexels community
  // lookup return null. Same rationale as src/app/community/[community]/page.tsx.
  const heroImage = await getCityHeroPhoto(cityParam)
    ?? await getCommunityHeroPhoto(community.slug, { allowBundledFallback: true })

  const [subCommunityPhotos, relatedCityPhotos, relatedCommunityPhotos] = await Promise.all([
    Promise.all(subCommunitySlugs.map(s => getSubCommunityPhoto(community.slug, s))),
    Promise.all(relatedCitiesEntries.map(r => getCityHeroPhoto(r.citySlug))),
    Promise.all(otherCommunities.map(c => getCommunityHeroPhoto(c.slug))),
  ])

  const subCommunityImages: Record<string, string | null> = {}
  subCommunitySlugs.forEach((s, i) => { subCommunityImages[s] = subCommunityPhotos[i] ?? null })

  const relatedCities = relatedCitiesEntries.map((entry, i) => ({
    ...entry,
    image: relatedCityPhotos[i] ?? null,
  }))

  const relatedCommunities = otherCommunities.map((c, i) => ({
    slug: c.slug,
    label: c.displayName,
    tagline: c.tagline,
    image: relatedCommunityPhotos[i] ?? null,
  }))

  const editorial = getIntersectionEditorial(community, cityParam, cityName, cityRecord)
  const heroSubtitle = getIntersectionHeroSubtitle(community, cityParam, cityName)

  const caption = `${allEvents.length} upcoming event${allEvents.length === 1 ? '' : 's'}`

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${community.displayName} events in ${cityName} on EventLinqs`,
    description: `${community.displayName} events in ${cityName}. ${community.tagline}`.slice(0, 200),
    url: `${baseUrl}/community/${community.slug}/${cityParam}`,
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
      <CommunityCityLandingPage
        community={community}
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
        subCommunityImages={subCommunityImages}
        relatedCities={relatedCities}
        relatedCommunities={relatedCommunities}
        mapPins={mapPins}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
      />
    </>
  )
}
