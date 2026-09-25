import type { Metadata } from 'next'
import { discoveryIndexingFor } from '@/lib/seo/discovery-threshold'
import { getSiteUrl } from '@/lib/site-url'
import { getAllCities } from '@/lib/cities/data'
import { WEEKEND_HERO } from '@/lib/images/weekend-photos'
import { WeekendLandingPage, type WeekendCityLink } from '@/components/templates/WeekendLandingPage'
import { EventCollectionJsonLd } from '@/components/seo/event-collection-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import {
  WEEKEND_SURFACE_PATH,
  describeWeekend,
  groupWeekendByDay,
  loadWeekendSurface,
} from '@/lib/events/weekend-surface'
import type { PublicEventRow } from '@/lib/events/types'

/**
 * `/this-weekend`, the weekend discovery surface (close-out AQ3).
 *
 * The page holds NO rule of its own. The window, the events and the count all
 * come from `src/lib/events/weekend-surface.ts`, which the sitemap and the guard
 * ask as well, so the three can never disagree about whether this URL is worth
 * offering to a search engine. The shape of the page and the reason for each
 * band are in `WeekendLandingPage`.
 */

// ISR, the same 5-minute window every discovery landing runs on. It is not
// shorter because the underlying fetcher is keyed by the hour anyway, and a
// revalidate below that would re-render the page without re-reading anything.
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const { from, to, total } = await loadWeekendSurface()
  const weekend = describeWeekend(from, to)
  const title = `What's on this weekend in Australia | EventLinqs`
  const description =
    total > 0
      ? `Every event on sale for ${weekend}, across Australia. All-in prices from the first click.`
      : `Events on sale for ${weekend}, across Australia. All-in prices from the first click.`

  return {
    title,
    description,
    /*
     * CONDITIONAL, exactly like every other templated discovery page: indexable
     * while it holds at least the live threshold of publicly visible events,
     * noindex while it does not, self-canonical either way.
     *
     * AQ3's own reversal condition asks for this in its own words: "if a surface
     * cannot be filled with real events it is not published, because an empty
     * city page is worse than no city page". A weekend page is empty MORE often
     * than a city page rather than less, because its whole contents expire every
     * Sunday night, so it is the page that most needs the rule.
     */
    ...(await discoveryIndexingFor(total, WEEKEND_SURFACE_PATH)),
    openGraph: {
      title,
      description,
      url: WEEKEND_SURFACE_PATH,
      type: 'website',
      images: ['/opengraph-image'],
    },
  }
}

/**
 * The cities holding one of this weekend's events, with their counts.
 *
 * The match is `venue_city ilike %name%`, which is the rule every city-scoped
 * listing query on the platform uses (`matchesCity` in
 * src/lib/seo/discovery-matchers.ts states it). It is applied here over the rows
 * already fetched rather than by asking the database twenty-four more times.
 *
 * A CITY WITH NOTHING ON IS NOT LINKED. That is the point of counting rather
 * than listing: every chip in the strip leads to a city page that has something
 * on it this weekend, so the strip cannot become twenty-four links to empty
 * pages the way a static list would the moment the catalogue thins out.
 */
function citiesWithEvents(events: PublicEventRow[]): WeekendCityLink[] {
  const out: WeekendCityLink[] = []
  for (const city of getAllCities()) {
    const needle = city.name.toLowerCase()
    const count = events.filter(e => (e.venue_city ?? '').toLowerCase().includes(needle)).length
    if (count > 0) out.push({ slug: city.slug, name: city.name, count })
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export default async function ThisWeekendPage() {
  const { from, to, events, total } = await loadWeekendSurface()
  const weekend = describeWeekend(from, to)
  const days = groupWeekendByDay(events)
  const baseUrl = getSiteUrl()
  const collectionUrl = `${baseUrl}${WEEKEND_SURFACE_PATH}`

  return (
    <>
      {/*
       * An ItemList pointing at the leaf event pages, never Event nodes here.
       * Google supports the event experience on a page about ONE event and says
       * so in writing; a listing page marked up with Event nodes is the
       * documented way to have the markup discounted. EventCollectionJsonLd
       * carries that rule and its citation, and this page does not re-derive it.
       */}
      <EventCollectionJsonLd
        url={collectionUrl}
        name={`Events on this weekend in Australia, ${weekend}`}
        description={`Every event on sale for ${weekend}, across Australia.`}
        events={events.map(e => ({ slug: e.slug, title: e.title }))}
        baseUrl={baseUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${baseUrl}/` },
          { name: 'Events', url: `${baseUrl}/events` },
          { name: 'This weekend', url: collectionUrl },
        ]}
      />
      <WeekendLandingPage
        weekend={weekend}
        total={total}
        days={days}
        heroImage={WEEKEND_HERO.src}
        heroAlt={WEEKEND_HERO.alt}
        heroObjectPosition={WEEKEND_HERO.objectPosition}
        cities={citiesWithEvents(events)}
      />
    </>
  )
}
