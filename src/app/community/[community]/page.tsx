import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getCommunity,
  getAllCommunities,
  isCommunitySlug,
} from '@/lib/communities/data'
import { getCommunityRedirect } from '@/lib/communities/redirects'
import { buildCommunityTagOrFilter } from '@/lib/communities/tag-bridge'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getSubCommunityPhoto } from '@/lib/images/sub-community-photo'
import { getCityPhoto, getCityHeroPhoto } from '@/lib/images/city-photo'
import { CommunityLandingPage } from '@/components/templates/CommunityLandingPage'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { citySlugify } from '@/components/features/community/cities-rail'
import type { EventCardData } from '@/components/features/events/event-card'

// ISR: 5-minute revalidate matches /events/[slug] and /categories/[slug].
export const revalidate = 300

interface Props {
  params: Promise<{ community: string }>
}

export function generateStaticParams() {
  return getAllCommunities().map(c => ({ community: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { community: communityParam } = await params
  const community = getCommunity(communityParam)
  if (!community) return { title: 'Not Found | EventLinqs' }

  const description = community.heroBody.slice(0, 155)
  const title = `${community.displayName} events in your city | EventLinqs`

  return {
    title,
    description,
    keywords: community.keywords,
    alternates: { canonical: `/community/${community.slug}` },
    openGraph: {
      title,
      description,
      url: `/community/${community.slug}`,
      type: 'website',
      images: ['/opengraph-image'],
    },
  }
}

export default async function CommunityPage({ params }: Props) {
  const { community: communityParam } = await params
  const redirectTarget = getCommunityRedirect(communityParam)
  if (redirectTarget) permanentRedirect(redirectTarget)
  if (!isCommunitySlug(communityParam)) notFound()

  const community = getCommunity(communityParam)!

  const supabase = createPublicClient()
  const tagOr = buildCommunityTagOrFilter(community.slug)

  // Live events whose `tags` jsonb array contains any identifying token
  // for this community (tag-bridge). The legacy category-bridge resolved
  // every community to zero because live events carry generic categories
  // ('music', 'nightlife', ...), which emptied every community landing.
  let liveEvents: EventCardData[] = []
  if (tagOr !== null) {
    const { data } = await withBuildRetry(
      () =>
        supabase
          .from('events')
          .select(
            'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
          )
          .eq('status', 'published')
          .eq('visibility', 'public')
          .gte('start_date', new Date().toISOString())
          .or(tagOr)
          .order('start_date', { ascending: true })
          .limit(12),
      { label: `community/${community.slug}` },
    )

    liveEvents = ((data ?? []) as unknown as EventCardData[]).slice(0, 12)
  }

  // Parallelise all image fetches: hero + 6 sub-communities + N cities + cta backdrop + related communities.
  const subCommunityKeys = community.subCommunities.map(sc => sc.slug)
  const citySlugs = community.cities.map(citySlugify)
  const relatedSlugs = community.relatedCommunities

  const [
    heroImage,
    cityCtaImage,
    ...rest
  ] = await Promise.all([
    // allowBundledFallback so the page hero always has a measurable LCP
    // element when Pexels returns null (CI without PEXELS_API_KEY, or any
    // Pexels outage in production). PhotographicCommunityHero's null branch
    // renders a CSS gradient only, which Lighthouse cannot score (NO_LCP).
    getCommunityHeroPhoto(community.slug, { allowBundledFallback: true }),
    // Use the first city's hero (landscape) as the CTA backdrop. Falls back to null
    // and the CTA panel renders its dark navy fallback.
    citySlugs[0] ? getCityHeroPhoto(citySlugs[0]) : Promise.resolve(null),
    ...community.subCommunities.map(sc => getSubCommunityPhoto(community.slug, sc.slug)),
    ...citySlugs.map(slug => getCityPhoto(slug)),
    // Related-community tiles below the fold do not need the fallback - they
    // are small thumbnails, not LCP candidates.
    ...relatedSlugs.map(slug => getCommunityHeroPhoto(slug)),
  ])

  const subImages = rest.slice(0, subCommunityKeys.length)
  const cityImageList = rest.slice(
    subCommunityKeys.length,
    subCommunityKeys.length + citySlugs.length,
  )
  const relatedImageList = rest.slice(subCommunityKeys.length + citySlugs.length)

  const subCommunityImages: Record<string, string | null> = {}
  subCommunityKeys.forEach((key, i) => {
    subCommunityImages[key] = subImages[i] ?? null
  })

  const cityImages: Record<string, string | null> = {}
  citySlugs.forEach((slug, i) => {
    cityImages[slug] = cityImageList[i] ?? null
  })

  const relatedCommunityImages: Record<string, string | null> = {}
  relatedSlugs.forEach((slug, i) => {
    relatedCommunityImages[slug] = relatedImageList[i] ?? null
  })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${community.displayName} events on EventLinqs`,
    description: community.heroBody,
    url: `${baseUrl}/community/${community.slug}`,
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
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Communities', url: `${baseUrl}/communities` },
          { name: community.displayName, url: `${baseUrl}/community/${community.slug}` },
        ]}
      />
      <CommunityLandingPage
        community={community}
        heroImage={heroImage}
        liveEvents={liveEvents}
        subCommunityImages={subCommunityImages}
        cityImages={cityImages}
        cityCtaImage={cityCtaImage}
        relatedCommunityImages={relatedCommunityImages}
      />
    </>
  )
}
