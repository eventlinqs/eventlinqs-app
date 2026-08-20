import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCity,
  getSuburb,
  isCitySlug,
} from '@/lib/cities/data'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'
import { getSuburbHeroPhoto } from '@/lib/images/suburb-photo'
import { SuburbLandingPage } from '@/components/templates/SuburbLandingPage'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import type { EventCardData } from '@/components/features/events/event-card'
import { getSiteUrl } from '@/lib/site-url'
import { listingWindowOrPredicate, weekendWindowUtc } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string; suburb: string }>
}

// Long tail: cities x suburbs multiplies to hundreds of DB-backed pages, kept
// off the build-time Supabase pool by rendering on-demand. NO generateStaticParams:
// an EMPTY gSP pins the route to a STATIC classification, so the first
// on-demand request 500'd ("Page changed from static to dynamic at runtime,
// reason: cookies") when the shared SiteHeader (PageShell, non-staticSafe)
// performed its render-time auth cookie read - the exact failure /events/[slug]
// hit and fixed the same way. Dropping gSP + the `await headers()` marker in the
// component makes the route dynamic-on-demand: nothing prerenders at build
// (pool-safe), notFound() returns a real 404, and revalidate=300 + the CDN
// header keep it edge-cached. The sitemap still lists every suburb.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, suburb } = await params
  const city = getCity(slug)
  if (!city) return { title: 'Not Found | EventLinqs' }
  const fullSuburbSlug = `${city.slug}-${suburb}`
  const s = getSuburb(fullSuburbSlug)
  if (!s) return { title: 'Not Found | EventLinqs' }

  const title = `Things to do in ${s.name}, ${city.name} | EventLinqs`
  const description = s.editorial.slice(0, 155)
  return {
    title,
    description,
    alternates: { canonical: `/city/${city.slug}/${suburb}` },
    openGraph: { title, description, url: `/city/${city.slug}/${suburb}`, type: 'website', images: ['/opengraph-image'] },
  }
}

/**
 * One shared definition, in the PLATFORM zone. The local copy this replaced was
 * built on `setHours`, which is the server's zone (UTC on Vercel), so an
 * Australian Saturday evening could fall outside the window called This weekend.
 */
function weekendWindow(now: Date) {
  const weekend = weekendWindowUtc(now, PLATFORM_TIME_ZONE)
  return {
    weekendStartIso: weekend.from.toISOString(),
    weekendEndIso: weekend.to.toISOString(),
  }
}

export default async function SuburbPage({ params }: Props) {
  const { slug, suburb } = await params
  if (!isCitySlug(slug)) notFound()
  const city = getCity(slug)!
  const fullSuburbSlug = `${city.slug}-${suburb}`
  const suburbContent = getSuburb(fullSuburbSlug)
  if (!suburbContent) notFound()

  // Mark the route dynamic-on-demand AFTER the synchronous notFound guards
  // (so unknown suburbs still hard-404). Without this the empty-gSP static
  // pin + the SiteHeader render-time cookie read 500 the first request.
  await headers()

  const supabase = createPublicClient()
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

  // Suburb-scoped query.
  //
  // WHAT THIS USED TO DO, and why it was wrong. The comment here said the
  // bridge was "venue_city matching city OR venue_name containing the suburb
  // name", but the code only ever applied the first half: it selected every
  // event in the CITY and rendered them under the suburb's name. So
  // /city/melbourne/inner-melbourne and /city/melbourne/bayside showed the
  // identical list, each claiming to be that district's events. Nothing errored
  // and every page looked full, which is exactly why it survived: a wrong
  // answer that looks like a right one.
  //
  // The district is now decided by the SAME rule the write path and the
  // /events?suburb= filter use (lib/cities/resolve-suburb.ts): the event's own
  // suburb_primary if it carries one, or its venue coordinates falling within
  // the district radius. Both halves are needed for now because suburb_primary
  // is only written going forward and backfilled by migration; the coordinate
  // half covers everything either of those has not reached.
  const { data: rows } = await supabase
    .from('events')
    .select(`${baseSelect}, suburb_primary, venue_latitude, venue_longitude`)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .or(listingWindowOrPredicate(new Date()))
    .ilike('venue_city', `%${city.name}%`)
    .order('start_date', { ascending: true })
    .limit(200)

  const allRaw = (rows ?? []) as unknown as (EventCardData & {
    suburb_primary: string | null
    venue_latitude: number | null
    venue_longitude: number | null
  })[]
  // Assignment is EXCLUSIVE: an event belongs to the ONE nearest district, not
  // to every district whose radius happens to reach it. That distinction is the
  // whole difference between six district pages and six copies of the city
  // page. Melbourne's districts all sit within 12 km of the CBD, and 43 of the
  // 55 Melbourne events carry the CBD centroid as their venue coordinate, so an
  // inclusive radius test hands those same 43 events to Bayside, Northern
  // Suburbs and Western Suburbs alike, each page asserting they are its own.
  const events = allRaw.filter(e =>
    (e.suburb_primary ??
      resolveSuburbSlug({
        citySlug: city.slug,
        latitude: e.venue_latitude,
        longitude: e.venue_longitude,
      })) === suburbContent.slug,
  )

  const w = weekendWindow(new Date())
  const weekendEvents = events.filter(e => e.start_date >= w.weekendStartIso && e.start_date <= w.weekendEndIso)

  const [heroImage, ...rest] = await Promise.all([
    getSuburbHeroPhoto(suburbContent.slug),
    ...suburbContent.relatedSuburbs.map(s => getSuburbHeroPhoto(s)),
  ])

  const relatedSuburbImages: Record<string, string | null> = {}
  suburbContent.relatedSuburbs.forEach((s, i) => {
    relatedSuburbImages[s] = (rest[i] as string | null) ?? null
  })

  const baseUrl = getSiteUrl()
  const placeLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `${suburbContent.name}, ${city.name}`,
    containedInPlace: { '@type': 'City', name: city.name },
    url: `${baseUrl}/city/${city.slug}/${suburb}`,
    geo: { '@type': 'GeoCoordinates', latitude: suburbContent.latitude, longitude: suburbContent.longitude },
  }

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd) }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Cities', url: `${baseUrl}/cities` },
          { name: city.name, url: `${baseUrl}/city/${city.slug}` },
          { name: suburbContent.name, url: `${baseUrl}/city/${city.slug}/${suburb}` },
        ]}
      />
      <SuburbLandingPage
        city={city}
        suburb={suburbContent}
        heroImage={heroImage}
        events={events}
        weekendEvents={weekendEvents}
        relatedSuburbImages={relatedSuburbImages}
      />
    </>
  )
}
