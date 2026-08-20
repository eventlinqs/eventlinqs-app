import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getHeroCategory,
  getAllHeroCategories,
  isHeroCategorySlug,
} from '@/lib/hero-categories'
import { CategoryLandingPage } from '@/components/templates/CategoryLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'

// ISR: every hero category is the same for all anonymous visitors. The
// 5-minute revalidate window matches /events/[slug] and keeps the live
// event list fresh enough that newly-published events appear within the
// usual SEO-crawler retry interval.
export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllHeroCategories().map(cat => ({ slug: cat.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = getHeroCategory(slug)

  if (!category) {
    return { title: 'Not Found | EventLinqs' }
  }

  const description = category.heroBody.slice(0, 155)

  return {
    title: `${category.displayName} events - ${category.tagline} | EventLinqs`,
    description,
    keywords: category.keywords,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: {
      title: `${category.displayName} events - ${category.tagline} | EventLinqs`,
      description,
      url: `/categories/${category.slug}`,
      type: 'website',
    },
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params

  if (!isHeroCategorySlug(slug)) {
    notFound()
  }

  const category = getHeroCategory(slug)!

  // Fetch live events for this category.
  // We join to event_categories to match by slug rather than UUID,
  // since the slug is the stable identifier in this data model.
  const supabase = createPublicClient()

  // The category filter is applied IN THE QUERY, on an inner-joined
  // event_categories, so the six rows that come back are the six soonest
  // events IN THIS CATEGORY.
  //
  // It used to take the six soonest events platform-wide and only then filter
  // by category in JavaScript, which meant a category page showed an event
  // only when that event happened to be among the six soonest on the entire
  // platform. With any real catalogue every category landing fell through to
  // the empty state no matter how many events the category had. The comment
  // that justified it ("Supabase doesn't allow nested WHERE on joined tables
  // without a view or RPC") is not correct: PostgREST filters on an embedded
  // resource when the embed is an inner join, which is the `!inner` below.
  const categorySlugs = [slug, category.displayName.toLowerCase()]
  const { data: eventsRaw } = await withBuildRetry(
    () =>
      supabase
        .from('events')
        .select(
          'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories!inner(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
        )
        .eq('status', 'published')
        .eq('visibility', 'public')
        .or(listingWindowOrPredicate(new Date()))
        .in('category.slug', categorySlugs)
        .order('start_date', { ascending: true })
        .limit(6),
    { label: `categories/${slug}` },
  )

  const liveEvents = (eventsRaw ?? []) as unknown as EventCardData[]

  return <CategoryLandingPage category={category} liveEvents={liveEvents} />
}
