import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCulture,
  getAllCultures,
  isCultureSlug,
} from '@/lib/cultures/data'
import { getCultureRedirect } from '@/lib/cultures/redirects'
import { buildCultureTagOrFilter } from '@/lib/cultures/tag-bridge'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getSubCulturePhoto } from '@/lib/images/sub-culture-photo'
import { getCityPhoto, getCityHeroPhoto } from '@/lib/images/city-photo'
import { CultureLandingPage } from '@/components/templates/CultureLandingPage'
import { citySlugify } from '@/components/features/culture/cities-rail'
import type { EventCardData } from '@/components/features/events/event-card'

// ISR: 5-minute revalidate matches /events/[slug] and /categories/[slug].
export const revalidate = 300

interface Props {
  params: Promise<{ culture: string }>
}

export function generateStaticParams() {
  return getAllCultures().map(c => ({ culture: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { culture: cultureParam } = await params
  const culture = getCulture(cultureParam)
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
  const { culture: cultureParam } = await params
  const redirectTarget = getCultureRedirect(cultureParam)
  if (redirectTarget) permanentRedirect(redirectTarget)
  if (!isCultureSlug(cultureParam)) notFound()

  const culture = getCulture(cultureParam)!

  const supabase = createPublicClient()
  const tagOr = buildCultureTagOrFilter(culture.slug)

  // Live events whose `tags` jsonb array contains any identifying token
  // for this culture (tag-bridge). The legacy category-bridge resolved
  // every culture to zero because live events carry generic categories
  // ('music', 'nightlife', ...), which emptied every culture landing.
  let liveEvents: EventCardData[] = []
  if (tagOr !== null) {
    const { data } = await supabase
      .from('events')
      .select(
        'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
      )
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', new Date().toISOString())
      .or(tagOr)
      .order('start_date', { ascending: true })
      .limit(12)

    liveEvents = ((data ?? []) as unknown as EventCardData[]).slice(0, 12)
  }

  // Parallelise all image fetches: hero + 6 sub-cultures + N cities + cta backdrop + related cultures.
  const subCultureKeys = culture.subCultures.map(sc => sc.slug)
  const citySlugs = culture.cities.map(citySlugify)
  const relatedSlugs = culture.relatedCultures

  const [
    heroImage,
    cityCtaImage,
    ...rest
  ] = await Promise.all([
    getCultureHeroPhoto(culture.slug),
    // Use the first city's hero (landscape) as the CTA backdrop. Falls back to null
    // and the CTA panel renders its dark navy fallback.
    citySlugs[0] ? getCityHeroPhoto(citySlugs[0]) : Promise.resolve(null),
    ...culture.subCultures.map(sc => getSubCulturePhoto(culture.slug, sc.slug)),
    ...citySlugs.map(slug => getCityPhoto(slug)),
    ...relatedSlugs.map(slug => getCultureHeroPhoto(slug)),
  ])

  const subImages = rest.slice(0, subCultureKeys.length)
  const cityImageList = rest.slice(
    subCultureKeys.length,
    subCultureKeys.length + citySlugs.length,
  )
  const relatedImageList = rest.slice(subCultureKeys.length + citySlugs.length)

  const subCultureImages: Record<string, string | null> = {}
  subCultureKeys.forEach((key, i) => {
    subCultureImages[key] = subImages[i] ?? null
  })

  const cityImages: Record<string, string | null> = {}
  citySlugs.forEach((slug, i) => {
    cityImages[slug] = cityImageList[i] ?? null
  })

  const relatedCultureImages: Record<string, string | null> = {}
  relatedSlugs.forEach((slug, i) => {
    relatedCultureImages[slug] = relatedImageList[i] ?? null
  })

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
        subCultureImages={subCultureImages}
        cityImages={cityImages}
        cityCtaImage={cityCtaImage}
        relatedCultureImages={relatedCultureImages}
      />
    </>
  )
}
