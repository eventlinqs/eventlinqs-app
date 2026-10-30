import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { discoveryIndexingFor } from '@/lib/seo/discovery-threshold'
import { getSiteUrl } from '@/lib/site-url'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { FreeWeekLandingPage, type FreeWeekCategoryLink } from '@/components/templates/FreeWeekLandingPage'
import { describeFreeWeek, freeWeekPath, groupFreeWeekByDay } from '@/lib/listings/free-week'
import { loadFreeWeek, readGuideCities, readGuideCity } from '@/lib/listings/free-week-surface'
import type { PublicEventRow } from '@/lib/events/types'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { isCitySlug } from '@/lib/cities/data'

/**
 * `/free/<city>/this-week`, the city guide's week (WI2 Part 2,
 * docs/walk-in/WI2-PLAN.md section 8a).
 *
 * The page holds NO rule of its own. The guide cities, the week, the events and
 * the count come from src/lib/listings/free-week-surface.ts and free-week.ts,
 * which the sitemap asks too, so the two can never disagree about whether this
 * URL is worth offering to a search engine. A city with no guide answers 404.
 */

// ISR, the five minutes every discovery landing runs on. A chosen category
// (`?category=`) renders on request and canonicalises to the page, as /events.
export const revalidate = 300

type Props = {
  params: Promise<{ city: string }>
  searchParams: Promise<{ category?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params
  const city = await readGuideCity(slug)
  // A city with no guide answers 404 from the page itself, which no index keeps.
  if (!city) return { title: 'Not found | EventLinqs' }
  const { from, to, total } = await loadFreeWeek(city)
  const week = describeFreeWeek(from, to, city.timezone)
  const path = freeWeekPath(city.slug)
  const title = `Free things to do in ${city.name} this week | EventLinqs`
  const description =
    total > 0
      ? `${total} free event${total === 1 ? '' : 's'} in ${city.name}, ${week}: walk-in nights and free ticketed events, day by day.`
      : `Free events in ${city.name}, ${week}: walk-in nights and free ticketed events, day by day.`
  return {
    title,
    description,
    // CONDITIONAL, as /this-weekend: indexable while the page holds the live
    // threshold of events, noindex while it does not, self-canonical either way.
    ...(await discoveryIndexingFor(total, path)),
    openGraph: { title, description, url: path, type: 'website', images: ['/opengraph-image'] },
  }
}

/** The categories this week holds, with their counts, most first. */
function categoriesOf(events: PublicEventRow[]): FreeWeekCategoryLink[] {
  const byslug = new Map<string, FreeWeekCategoryLink>()
  for (const e of events) {
    if (!e.category) continue
    const hit = byslug.get(e.category.slug)
    if (hit) hit.count += 1
    else byslug.set(e.category.slug, { slug: e.category.slug, name: e.category.name, count: 1 })
  }
  return [...byslug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export default async function FreeWeekPage({ params, searchParams }: Props) {
  const { city: slug } = await params
  const city = await readGuideCity(slug)
  if (!city) notFound()

  const now = new Date()
  const heroImage = null
  // NO PHOTO IS EVER REUSED (the project manager's ruling of 31 October 2026, 05:05 (3)): the city's photo belongs to
  // the city's own tile and page, so this page borrows none and its hero draws its own navy band.
  const [{ from, to, events: rows, total }, guideCities, query] = await Promise.all([
    loadFreeWeek(city),
    readGuideCities(),
    searchParams,
  ])
  const events = await withVenuePhotos(rows)
  const week = describeFreeWeek(from, to, city.timezone)
  const path = freeWeekPath(city.slug)
  const baseUrl = getSiteUrl()
  const pageUrl = `${baseUrl}${path}`
  // A guide city is a database row; a city page is the platform's own list. Link
  // the city page only where one exists, so a new guide row never links a 404.
  const cityHref = isCitySlug(city.slug) ? `/city/${city.slug}` : null

  const categories = categoriesOf(events)
  const asked = typeof query.category === 'string' ? query.category : null
  // An unknown category shows the whole week rather than an empty page.
  const activeCategory = asked && categories.some((c) => c.slug === asked) ? asked : null
  const shownEvents = activeCategory ? events.filter((e) => e.category?.slug === activeCategory) : events
  const days = groupFreeWeekByDay(shownEvents, city.timezone, now)

  return (
    <>
      {/*
       * An ItemList of the occurrences' own pages, never Event nodes here: each
       * dated occurrence's own page carries its Event markup (WI1), and Google
       * reads event markup on a page about one event. EventCollectionJsonLd
       * carries that rule and its citation.
       */}
      <EventCollectionJsonLd
        url={pageUrl}
        name={`Free things to do in ${city.name} this week, ${week}`}
        description={`Every free event in ${city.name}, ${week}.`}
        events={events.map((e) => ({ slug: e.slug, title: e.title }))}
        baseUrl={baseUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${baseUrl}/` },
          ...(cityHref ? [{ name: city.name, url: `${baseUrl}${cityHref}` }] : []),
          { name: 'Free this week', url: pageUrl },
        ]}
      />
      <FreeWeekLandingPage
        cityName={city.name}
        citySlug={city.slug}
        cityHref={cityHref}
        week={week}
        total={total}
        shown={events.length}
        days={days}
        categories={categories}
        activeCategory={activeCategory}
        pageUrl={pageUrl}
        pagePath={path}
        heroImage={heroImage}
        cities={guideCities
          .filter((c) => c.slug !== city.slug)
          .map((c) => ({ slug: c.slug, name: c.name, href: freeWeekPath(c.slug) }))}
      />
    </>
  )
}
