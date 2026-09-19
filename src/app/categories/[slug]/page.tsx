import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { loadDiscoveryRows, countCategory } from '@/lib/seo/discovery-counts'
import { discoveryIndexingFor } from '@/lib/seo/discovery-threshold'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getHeroCategory,
  getAllHeroCategories,
  isHeroCategorySlug,
} from '@/lib/hero-categories'
import { getPublishableCategories, getPublishableCategory } from '@/lib/categories/taxonomy'
import { getCategoryPhoto, isBrandedFallbackPhoto } from '@/lib/images/category-photo'
import { CategoryLandingPage } from '@/components/templates/CategoryLandingPage'
import { CategoryEventsLandingPage } from '@/components/templates/CategoryEventsLandingPage'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { getSiteUrl } from '@/lib/site-url'
import type { EventCardData } from '@/components/features/events/event-card'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { resolveCategorySlug } from '@/lib/events/search-params'

// ISR: every category page is the same for all anonymous visitors. The
// 5-minute revalidate window matches /events/[slug] and keeps the live
// event list fresh enough that newly-published events appear within the
// usual SEO-crawler retry interval.
export const revalidate = 300

/**
 * HOW MANY EVENT CARDS A CATEGORY LANDING SHOWS.
 *
 * Twenty-four is two full desktop rows of three plus the scroll, which is the
 * count `/community/[slug]` settled on for the same grid. It is a display cap
 * and never a substance judgement: whether the page is offered to Google is
 * decided by the live threshold in src/lib/seo/discovery-threshold.ts against
 * the FULL count, so a category holding 400 events and a category holding one
 * are judged on 400 and on one, not on what fits above the fold.
 */
const GRID_LIMIT = 24

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * WHAT IS PRERENDERED, AND WHY THE REAL CATEGORIES ARE NOT IN THIS LIST.
 *
 * The legacy hero slugs come from a compiled constant, so they cost nothing to
 * name here. The 22 real categories come from `public.event_categories`, and
 * reading a database inside generateStaticParams makes the BUILD fail when the
 * database is briefly unavailable, on a route that renders perfectly well on
 * demand. `dynamicParams` is on by default, so an uncached category renders on
 * its first request and is then cached for the revalidate window like every
 * other page here. The cost is one slow first hit per category per five
 * minutes; the cost of the alternative is a failed deployment.
 */
export function generateStaticParams() {
  return getAllHeroCategories().map(cat => ({ slug: cat.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const category = getHeroCategory(slug)
  if (category) {
    const description = category.heroBody.slice(0, 155)
    // INDEXABLE ONLY WHILE IT HOLDS EVENTS (close-out C19.3). The slug set the
    // page queries with is the same pair the page body uses.
    const eventCount = countCategory(await loadDiscoveryRows(), [
      category.slug,
      category.displayName.toLowerCase(),
    ])
    return {
      title: `${category.displayName} events - ${category.tagline} | EventLinqs`,
      description,
      keywords: category.keywords,
      ...(await discoveryIndexingFor(eventCount, `/categories/${category.slug}`)),
      openGraph: {
        title: `${category.displayName} events - ${category.tagline} | EventLinqs`,
        description,
        url: `/categories/${category.slug}`,
        type: 'website',
      },
    }
  }

  const real = await getPublishableCategory(slug)
  if (!real) return { title: 'Not Found | EventLinqs' }

  // Its OWN title, its OWN description and its OWN canonical, which is the
  // whole of what `/events?category=<slug>` could never have: that URL
  // canonicalises to /events, so twenty-two categories shared one page's
  // identity in search (close-out SEO3).
  const eventCount = countCategory(await loadDiscoveryRows(), [real.slug])
  return {
    title: real.editorial.metaTitle,
    description: real.editorial.metaDescription,
    keywords: real.editorial.keywords,
    ...(await discoveryIndexingFor(eventCount, `/categories/${real.slug}`)),
    openGraph: {
      title: real.editorial.metaTitle,
      description: real.editorial.metaDescription,
      url: `/categories/${real.slug}`,
      type: 'website',
      images: ['/opengraph-image'],
    },
  }
}

/**
 * TWO TAXONOMIES SHARE THIS URL SPACE, AND BOTH NOW RESOLVE.
 *
 * `/categories/[slug]` was bound to `hero-categories.ts`, seven legacy editorial
 * slugs of which six permanently redirect to `/community/*`. The platform's REAL
 * category taxonomy is `public.event_categories` and it has twenty-two slugs,
 * none of which is a hero slug.
 *
 * Driven against production on 25 August 2026, one request per slug, every real
 * category answered 404. The fix applied that day was a 308 to
 * `/events?category=<slug>`, reasoning that "inventing twenty-two landing pages
 * of editorial nobody wrote would be the generic template Law 1 exists to
 * refuse". That reasoning was sound and the remedy was not: `/events?category=`
 * canonicalises to `/events`, so the platform still had no page that could rank
 * for a head category query, and close-out SEO3 measured the result as a total
 * indexable inventory of roughly 37 pages.
 *
 * The editorial now exists (src/lib/categories/category-editorial.ts), the build
 * refuses a category with none (scripts/guards/discovery-indexability.mjs), and
 * every real slug is a real page. The redirect is gone; the alias map stays, so
 * the retired arts spelling still in the wild forwards to the live slug rather
 * than 404ing.
 */
async function aliasOrNotFound(slug: string): Promise<never> {
  const resolved = resolveCategorySlug(slug)
  if (resolved && resolved !== slug && (await getPublishableCategory(resolved))) {
    permanentRedirect(`/categories/${resolved}`)
  }
  notFound()
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params

  if (isHeroCategorySlug(slug)) return renderHeroCategory(slug)

  const real = await getPublishableCategory(slug)
  if (!real) await aliasOrNotFound(slug)

  const supabase = createPublicClient()
  // The category filter is applied IN THE QUERY, on an inner-joined
  // event_categories, so the rows that come back are the soonest events IN
  // THIS CATEGORY. `!inner` is what makes PostgREST filter on the embedded
  // resource rather than filtering the platform's soonest events afterwards.
  const { data: eventsRaw } = await withBuildRetry(
    () =>
      supabase
        .from('events')
        .select(
          'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories!inner(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
        )
        .match(PUBLIC_EVENT_MATCH)
        .or(listingWindowOrPredicate(new Date()))
        .eq('category.slug', real!.slug)
        .order('start_date', { ascending: true })
        .limit(GRID_LIMIT),
    { label: `categories/${real!.slug}` },
  )

  const liveEvents = (eventsRaw ?? []) as unknown as EventCardData[]

  const [photo, all] = await Promise.all([
    getCategoryPhoto(real!.slug, real!.slug),
    getPublishableCategories(),
  ])

  const baseUrl = getSiteUrl()
  const collectionUrl = `${baseUrl}/categories/${real!.slug}`

  return (
    <>
      {/*
       * An ItemList pointing at the leaf event pages, never Event nodes here.
       * Google requires Event markup on a unique leaf page for each performance
       * and explicitly does not want a listing page marked up with Event
       * (close-out SEO1 v2, fault three). EventCollectionJsonLd carries that
       * rule; this page does not re-derive it.
       */}
      <EventCollectionJsonLd
        url={collectionUrl}
        name={`${real!.name} events in Australia`}
        description={real!.editorial.metaDescription}
        events={liveEvents.map(e => ({ slug: e.slug, title: e.title }))}
        baseUrl={baseUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${baseUrl}/` },
          { name: 'Events', url: `${baseUrl}/events` },
          { name: real!.name, url: collectionUrl },
        ]}
      />
      <CategoryEventsLandingPage
        name={real!.name}
        editorial={real!.editorial}
        /*
         * NULL, NOT THE SENTINEL, when the resolver had no photograph.
         * `photo.src` is the branded SVG placeholder in that case, and the hero
         * chain is `spine ?? bundled ?? fallbackImage ?? HERO_RASTER_DEFAULT`:
         * a non-empty string wins the `??` and the hero's own last resort never
         * runs. HeroMedia then refuses the SVG and /categories/technology
         * answered 500, which is how the link crawler found this.
         */
        heroImage={isBrandedFallbackPhoto(photo) ? null : photo.src}
        events={liveEvents}
        siblings={all.filter(c => c.slug !== real!.slug).map(c => ({ slug: c.slug, name: c.name }))}
      />
    </>
  )
}

/** The legacy hero-category landing, unchanged apart from where it links on. */
async function renderHeroCategory(slug: string) {
  const category = getHeroCategory(slug)!
  const supabase = createPublicClient()

  const categorySlugs = [category.slug, category.displayName.toLowerCase()]
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
  const baseUrl = getSiteUrl()
  const collectionUrl = `${baseUrl}/categories/${category.slug}`

  /*
   * WHERE "View all" GOES, AND THE DEAD END IT USED TO BE.
   *
   * This link was `/events?category=<hero slug>`. No hero slug exists in
   * `event_categories`, so every one of those links landed on a filtered browse
   * page that could never match a single event: a 200 with nothing on it, which
   * Law 5 counts as a dead end exactly as it counts a 404. Where the hero
   * category has a real successor in the live taxonomy it now points at that
   * page, which has the events and the editorial; where it has none it points at
   * the catalogue, which always has something.
   */
  const browseHref = category.realCategorySlug
    ? `/categories/${category.realCategorySlug}`
    : '/events'

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
      <CategoryLandingPage category={category} liveEvents={liveEvents} browseHref={browseHref} />
    </>
  )
}
