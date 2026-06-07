import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCity,
  getSuburb,
  isCitySlug,
} from '@/lib/cities/data'
import { getSuburbHeroPhoto } from '@/lib/images/suburb-photo'
import { SuburbLandingPage } from '@/components/templates/SuburbLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'

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
    openGraph: { title, description, url: `/city/${city.slug}/${suburb}`, type: 'website' },
  }
}

function weekendWindow(now: Date) {
  const day = now.getDay()
  const weekendStart = new Date(now)
  if (day === 6) weekendStart.setHours(0, 0, 0, 0)
  else if (day === 0) { weekendStart.setDate(now.getDate() - 1); weekendStart.setHours(0, 0, 0, 0) }
  else { weekendStart.setDate(now.getDate() + (6 - day)); weekendStart.setHours(0, 0, 0, 0) }
  const weekendEnd = new Date(weekendStart); weekendEnd.setDate(weekendStart.getDate() + 1); weekendEnd.setHours(23, 59, 59, 999)
  return { weekendStartIso: weekendStart.toISOString(), weekendEndIso: weekendEnd.toISOString() }
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

  // Suburb-scoped query: broaden by city + suburb name ilike. Once
  // suburb_primary FK is populated by organisers we can switch to a
  // direct .eq() on suburb_primary; for v1 the bridge is venue_city
  // matching city OR venue_name containing the suburb name.
  const { data: rows } = await supabase
    .from('events')
    .select(baseSelect)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .ilike('venue_city', `%${city.name}%`)
    .order('start_date', { ascending: true })
    .limit(60)

  const allRaw = (rows ?? []) as unknown as EventCardData[]
  const events = allRaw

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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
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
