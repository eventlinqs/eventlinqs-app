import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  getHeroCategory,
  getAllHeroCategories,
  isHeroCategorySlug,
} from '@/lib/hero-categories'
import { CategoryLandingPage } from '@/components/templates/CategoryLandingPage'
import type { EventCardData } from '@/components/features/events/event-card'

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
    openGraph: {
      title: `${category.displayName} events - ${category.tagline} | EventLinqs`,
      description,
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

  const { data: eventsRaw } = await supabase
    .from('events')
    .select(
      'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(6)

  // Filter client-side by category slug - Supabase doesn't allow nested WHERE
  // on joined tables without a view or RPC. Safe at this event volume.
  const liveEvents = ((eventsRaw ?? []) as unknown as EventCardData[]).filter(
    e => e.category?.slug === slug || e.category?.slug === category.displayName.toLowerCase(),
  )

  return <CategoryLandingPage category={category} liveEvents={liveEvents} />
}
