import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getCulture,
  getAllCultures,
  isCultureSlug,
} from '@/lib/cultures/data'
import { getCategorySlugsForCulture } from '@/lib/cultures/category-bridge'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { PhotographicCultureHero } from '@/components/templates/PhotographicCultureHero'
import { AllEventsGridByCulture } from '@/components/features/culture/events-by-culture-grid'
import { CultureOrganiserCtaPanel } from '@/components/features/culture/culture-organiser-cta'
import { citySlugify } from '@/components/features/culture/cities-rail'
import type { EventCardData } from '@/components/features/events/event-card'

export const revalidate = 300

interface Props {
  params: Promise<{ culture: string; city: string }>
}

/**
 * Build the cross-product of every culture × its listed cities so the
 * intersection page is statically rendered for known traffic. Unknown
 * culture-city combinations 404 (notFound) rather than render an empty
 * shell - the value of this page is curation.
 */
export function generateStaticParams() {
  const params: { culture: string; city: string }[] = []
  for (const c of getAllCultures()) {
    for (const city of c.cities) {
      params.push({ culture: c.slug, city: citySlugify(city) })
    }
  }
  return params
}

function findCityName(cultureSlug: string, citySlug: string): string | null {
  const culture = getCulture(cultureSlug)
  if (!culture) return null
  return culture.cities.find(c => citySlugify(c) === citySlug) ?? null
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
    keywords: [...culture.keywords, `${culture.displayName} ${cityName}`, `${cityName} ${culture.displayName.toLowerCase()} events`],
    alternates: { canonical: `/culture/${culture.slug}/${cityParam}` },
    openGraph: {
      title,
      description,
      url: `/culture/${culture.slug}/${cityParam}`,
      type: 'website',
    },
  }
}

export default async function CultureByCityPage({ params }: Props) {
  const { culture: cultureParam, city: cityParam } = await params
  if (!isCultureSlug(cultureParam)) notFound()

  const culture = getCulture(cultureParam)!
  const cityName = findCityName(cultureParam, cityParam)
  if (!cityName) notFound()

  const supabase = createPublicClient()
  const categorySlugs = getCategorySlugsForCulture(culture.slug)

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
      .ilike('venue_city', cityName)
      .order('start_date', { ascending: true })
      .limit(24)

    liveEvents = ((data ?? []) as unknown as EventCardData[])
      .filter(e => {
        const catSlug = e.category?.slug ?? ''
        return categorySlugs.includes(catSlug)
      })
      .slice(0, 12)
  }

  const cityImage = await getCityHeroPhoto(cityParam)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${culture.displayName} events in ${cityName} on EventLinqs`,
    description: `${culture.displayName} events in ${cityName}.`,
    url: `${baseUrl}/culture/${culture.slug}/${cityParam}`,
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
      <PageShell>
        <PhotographicCultureHero
          eyebrow={`${culture.displayName.toUpperCase()} · ${cityName.toUpperCase()}`}
          title={`${culture.displayName} events in ${cityName}.`}
          subtitle={`${culture.tagline} On stage tonight in ${cityName}, with the people who run them.`}
          imageSrc={cityImage}
        />

        <ContentSection surface="base" width="default">
          <Link
            href={`/culture/${culture.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-accent)] transition-colors hover:text-[var(--brand-accent-hover)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to all {culture.displayName} events
          </Link>
        </ContentSection>

        <AllEventsGridByCulture
          cultureSlug={culture.slug}
          cultureName={`${culture.displayName} in ${cityName}`}
          cultureTagline={`${culture.tagline} On now in ${cityName}.`}
          events={liveEvents}
        />

        <CultureOrganiserCtaPanel
          cultureSlug={culture.slug}
          cultureName={culture.displayName}
          organiserPersonas={culture.organiserPersonas}
          backdropImage={cityImage}
        />
      </PageShell>
    </>
  )
}
