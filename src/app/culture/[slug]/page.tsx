import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCulture,
  getAllCultures,
  isCultureSlug,
} from '@/lib/cultures/data'
import { getCategorySlugsForCulture } from '@/lib/cultures/category-bridge'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { CultureLandingPage } from '@/components/templates/CultureLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'

// ISR: 5-minute revalidate matches /events/[slug] and /categories/[slug].
// New events appear within crawler retry interval.
export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllCultures().map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const culture = getCulture(slug)
  if (!culture) return { title: 'Not Found | EventLinqs' }

  const description = culture.heroBody.slice(0, 155)
  const title = `${culture.displayName} events in your city | EventLinqs`

  return {
    title,
    description,
    keywords: culture.keywords,
    alternates: { canonical: `/culture/${culture.slug}` },
    openGraph: {
      title,
      description,
      url: `/culture/${culture.slug}`,
      type: 'website',
    },
  }
}

export default async function CulturePage({ params }: Props) {
  const { slug } = await params
  if (!isCultureSlug(slug)) notFound()

  const culture = getCulture(slug)!

  const supabase = createPublicClient()
  const categorySlugs = getCategorySlugsForCulture(culture.slug)

  // Fetch a window of live events. We over-fetch (limit 24) and filter
  // client-side by category slug because Supabase doesn't allow a
  // nested WHERE on the joined event_categories table.
  let liveEvents: EventCardData[] = []
  if (categorySlugs.length > 0) {
    const { data } = await supabase
      .from('events')
      .select(
        'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
      )
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(24)

    liveEvents = ((data ?? []) as unknown as EventCardData[])
      .filter(e => {
        const catSlug = e.category?.slug ?? ''
        return categorySlugs.includes(catSlug)
      })
      .slice(0, 12)
  }

  const heroImage = await getCultureHeroPhoto(culture.slug)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${culture.displayName} events on EventLinqs`,
    description: culture.heroBody,
    url: `${baseUrl}/culture/${culture.slug}`,
    inLanguage: 'en-AU',
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: liveEvents.length,
      itemListElement: liveEvents.slice(0, 12).map((e, i) => ({
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
      <CultureLandingPage
        culture={culture}
        heroImage={heroImage}
        liveEvents={liveEvents}
      />
    </>
  )
}
