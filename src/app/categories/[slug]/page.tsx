import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getHeroCategory,
  getAllHeroCategories,
  isHeroCategorySlug,
} from '@/lib/hero-categories'
import { CategoryLandingPage } from '@/components/templates/CategoryLandingPage'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { getSiteUrl } from '@/lib/site-url'
import type { EventCardData } from '@/components/features/events/event-card'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { resolveCategorySlug } from '@/lib/events/search-params'
import { createAdminClient } from '@/lib/supabase/admin'

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

/**
 * TWO TAXONOMIES SHARED ONE URL SPACE, AND ONLY ONE OF THEM RESOLVED.
 *
 * `/categories/[slug]` is bound to `hero-categories.ts`, seven legacy editorial
 * slugs of which six are permanently redirected to `/community/*` by
 * next.config. The platform's REAL category taxonomy is `public.event_categories`
 * and it has twenty-two slugs, none of which is a hero slug.
 *
 * Driven against production on 25 August 2026, one request per slug:
 *
 *     404  /categories/music        404  /categories/comedy
 *     404  /categories/sports       404  /categories/festival
 *     404  /categories/nightlife    404  /categories/family
 *     404  /categories/food-drink   404  /categories/arts-community
 *     ... and the other fourteen, all 404.
 *
 * So the most obvious URL on a ticketing platform, the one a person types and
 * the one `revalidateEventSurfaces` has been invalidating on every save since it
 * was written, answered 404 for every real category the catalogue uses.
 *
 * THE FIX IS A FORWARD, NOT A NEW PAGE. There is already exactly one canonical
 * category browse surface and the homepage category rail already links to it:
 * `/events?category=<slug>`. Inventing twenty-two landing pages of editorial
 * nobody wrote would be the generic template Law 1 exists to refuse. A 308 to
 * the surface that already exists is the honest answer, and it makes the URL
 * space total: every real category slug now lands somewhere that renders that
 * category's events.
 *
 * The alias map is applied first so `/categories/arts-culture`, the pre-rename
 * spelling that is still in the wild, forwards to the live slug rather than
 * 404ing.
 */
async function forwardRealCategoryOrNotFound(slug: string): Promise<never> {
  const resolved = resolveCategorySlug(slug)
  if (resolved) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('event_categories')
      .select('slug')
      .eq('slug', resolved)
      .maybeSingle()
    // A read failure must not be mistaken for "no such category". Saying so out
    // loud is the difference between this and the organiser 404, where a
    // discarded 42501 was read as an absent row for weeks.
    if (error) {
      console.error('[categories] could not resolve %s against event_categories:', resolved, error)
    }
    if (data?.slug) {
      permanentRedirect(`/events?category=${encodeURIComponent(data.slug)}`)
    }
  }
  notFound()
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params

  if (!isHeroCategorySlug(slug)) {
    await forwardRealCategoryOrNotFound(slug)
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
        .match(PUBLIC_EVENT_MATCH)
        .or(listingWindowOrPredicate(new Date()))
        .in('category.slug', categorySlugs)
        .order('start_date', { ascending: true })
        .limit(6),
    { label: `categories/${slug}` },
  )

  const liveEvents = (eventsRaw ?? []) as unknown as EventCardData[]

  // STRUCTURED DATA (added 2026-08-23). This page type emitted none at all, and
  // was absent from the sitemap as well, while being the surface that answers
  // the head category queries. The ItemList points at the leaf event pages that
  // carry the real Event markup; it deliberately does not repeat Event nodes
  // here (see EventCollectionJsonLd for Google's rule on that).
  const baseUrl = getSiteUrl()
  const collectionUrl = `${baseUrl}/categories/${category.slug}`

  return (
    <>
      <EventCollectionJsonLd
        url={collectionUrl}
        name={`${category.displayName} events in Australia`}
        description={category.heroBody.slice(0, 155)}
        events={liveEvents.map(e => ({ slug: e.slug, title: e.title }))}
        baseUrl={baseUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${baseUrl}/` },
          { name: 'Events', url: `${baseUrl}/events` },
          { name: category.displayName, url: collectionUrl },
        ]}
      />
      <CategoryLandingPage category={category} liveEvents={liveEvents} />
    </>
  )
}
