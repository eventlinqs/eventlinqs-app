import Link from 'next/link'
import { Suspense } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityHero } from '@/components/features/city/city-hero'
import { DateFilterChips } from '@/components/features/city/date-filter-chips'
import { CityEditorialSection } from '@/components/features/city/city-editorial-section'
import { EventTypesRail } from '@/components/features/city/event-types-rail'
import { CityMap, type MapEventPin, type MapSuburbPolygon } from '@/components/features/city/city-map'
import { CityOrganiserCtaPanel } from '@/components/features/city/city-organiser-cta-panel'
import { MobileStickyBar } from '@/components/features/city/mobile-sticky-bar'
import { BrowseByCommunityRail } from '@/components/features/city/browse-by-community-rail'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import type { EventCardData } from '@/components/features/events/event-card'
import { CityTileImage } from '@/components/media/CityTileImage'
import { TileCaption } from '@/components/media/tile-caption'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import type { ReactNode } from 'react'
import type { CityContent, SuburbContent } from '@/lib/cities/data'
import { getAllCities, getCity } from '@/lib/cities/data'
import { STANDARD_TILE_CELL, WIDE_TILE_CELL } from '@/lib/ui/rhythm'
import { directoryDays } from '@/lib/events/whats-on-directory'
import { WhatsOnSection } from '@/components/features/events/ledger-sections'
import { FeaturedFromCards } from '@/components/features/events/featured-this-week-loader'


interface Props {
  city: CityContent
  heroImage: string | null
  caption: string
  /** Live events filtered by city + future-dated. Already split by date below. */
  thisWeekEvents: EventCardData[]
  todayTomorrowEvents: EventCardData[]
  thisWeekendEvents: EventCardData[]
  popularEvents: EventCardData[]
  allEvents: EventCardData[]
  /** Map of event-type slug → Pexels landscape URL. */
  eventTypeImages: Record<string, string | null>
  /** Map of related city slug → Pexels portrait URL. */
  relatedCityImages: Record<string, string | null>
  /** Map of suburb slug → Pexels landscape URL. Tier 1 only. */
  suburbImages: Record<string, string | null>
  suburbs: SuburbContent[]
  /** Pre-built Mapbox pins (geocoded events). */
  mapPins: MapEventPin[]
  /** True when the city has a free guide, so the page links its week. */
  hasFreeGuide?: boolean
  /** The paid Featured row for this city (Train C, row 12), shown under the editorial; none when no slot runs. */
  featuredRow?: ReactNode
}

/**
 * CityLandingPage - the /city/[slug] template.
 *
 * 15 sections per the Batch 6 spec:
 *   S1  CityHero
 *   S2  DateFilterChips (sticky)
 *   S3  CityEditorialSection
 *   S4  This Week + This Weekend rails
 *   S5  Browse by Community rail
 *   S6  EventTypesRail
 *   S7  CityMap (Mapbox)
 *   S8  Popular this month
 *   S9  By Suburb rail (Tier 1 only)
 *   S10 Featured Organisers (hidden until populated)
 *   S11 Featured Venues (hidden until populated)
 *   S12 All [City] Events Grid
 *   S13 Related Cities Rail
 *   S14 Organiser CTA + Newsletter Capture
 *   S15 MobileStickyBar (≤768px)
 *
 * Sections render conditionally with the brief's "hide if sparse"
 * rules: rails fewer than 4 events hide; organisers/venues fewer than 3
 * hide. The All Events grid always renders, with the empty-state CTA
 * when the city has no live events on the platform.
 */
export function CityLandingPage({
  city,
  heroImage,
  caption,
  thisWeekendEvents: thisWeekendCandidates,
  allEvents,
  eventTypeImages,
  relatedCityImages,
  suburbImages,
  suburbs,
  mapPins,
  hasFreeGuide = false,
  featuredRow = null,
}: Props) {
  // WHAT'S ON FIRST, FEATURED ABOVE IT (Lawal's order of 1 November 2026, 11:01): every upcoming night in the city
  // as one row under its day, in place of the date, hub and popular rails and the all events grid.
  const pageIsEmpty = allEvents.length === 0
  const directory = directoryDays(allEvents, new Date())
  const allCities = getAllCities()
  const relatedItems = city.relatedCities
    .map(slug => getCity(slug))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const polygons: MapSuburbPolygon[] = suburbs.map(s => ({
    slug: s.slug,
    name: s.name,
    href: `/city/${city.slug}/${s.slug.replace(`${city.slug}-`, '')}`,
    latitude: s.latitude,
    longitude: s.longitude,
  }))

  return (
    <PageShell>
      <CityHero
        eyebrow={`${city.name.toUpperCase()} · ${city.state}`}
        title={`Things to do in ${city.name}`}
        subtitle="Every community. Every event. One platform."
        imageSrc={heroImage}
        primaryCtaLabel={pageIsEmpty ? 'See what is on across Australia' : `Browse all ${city.name} events`}
        primaryCtaHref={pageIsEmpty ? '/events' : undefined}
        secondaryCtaLabel="Sell tickets"
        secondaryCtaHref={`/organisers?city=${city.slug}`}
        caption={caption}
      />

      {pageIsEmpty ? null : (
        <Suspense fallback={null}>
          <DateFilterChips anchorId="all-events" />
        </Suspense>
      )}

      <CityEditorialSection
        eyebrow={`About ${city.name}`}
        heading={city.descriptor}
        paragraphs={[city.editorial]}
      />

      {featuredRow}

      <FeaturedFromCards events={allEvents} />

      {directory.length > 0 ? (
        <div id="all-events" className="scroll-mt-40">
          <WhatsOnSection
            days={directory}
            eyebrow={`Every event in ${city.name}`}
            title={`What’s on in ${city.name}`}
            link={{ href: `/events?city=${city.slug}`, label: 'Open in browse view' }}
          />
        </div>
      ) : null}

      {/* S5 Browse by Community rail - 14 photographic community tiles routing
          to /community/[community]/[city] for the cross-community-city
          intersection page added in Batch 5.5. */}
      <BrowseByCommunityRail
        citySlug={city.slug}
        cityName={city.name}
      />

      <EventTypesRail
        citySlug={city.slug}
        cityName={city.name}
        images={eventTypeImages}
      />

      {mapPins.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              Map
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              Where {city.name} is happening
            </h2>
          </div>
          <CityMap
            centerLng={city.longitude}
            centerLat={city.latitude}
            zoom={city.mapZoom}
            pins={mapPins}
            suburbs={polygons.length > 0 ? polygons : undefined}
          />
        </ContentSection>
      ) : null}

      {/* S9 By suburb rail - Tier 1 only. */}
      {city.tier === 1 && suburbs.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`Pick your part of ${city.name}`}
            header={{
              eyebrow: 'By suburb',
              title: `Pick your part of ${city.name}`,
            }}
          >
            {suburbs.map(s => {
              const img = suburbImages[s.slug] ?? null
              const sub = s.slug.startsWith(`${city.slug}-`) ? s.slug.slice(city.slug.length + 1) : s.slug
              return (
                <Link
                  key={s.slug}
                  href={`/city/${city.slug}/${sub}`}
                  className={`group block ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${s.name}, ${city.name}`} layout="rail-wide-tile" />
                    ) : (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-navy-950), color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)))',
                        }}
                      />
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                      {s.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {s.characterDescriptor}
                    </p>
                  </div>
                </Link>
              )
            })}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S12 All city events grid. */}
      {/* 9,067px at 390 on 19 September 2026, which is 1,789% past the 480px
          `cv-section` reserves for a rail - so this section declares its own
          height instead. 24 cards in 1, 2 or 3 columns is arithmetic, not a
          guess: src/lib/ui/event-grid-intrinsic.ts, proven to the pixel by
          scripts/verify/event-grid-intrinsic-drive.mjs. */}
      {pageIsEmpty ? (
        <ContentSection id="all-events" surface="base" width="wide" topBorder>
          <EmptyCollectionNote message={`No events are listed in ${city.name} yet.`} />
        </ContentSection>
      ) : null}

      {/* S13 Related cities rail. */}
      {relatedItems.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel="Other Australian cities on EventLinqs"
            containerBg="ink-100"
            header={{
              eyebrow: 'Around the country',
              title: 'Other Australian cities on EventLinqs',
            }}
          >
            {relatedItems.map(c => {
              const img = relatedCityImages[c.slug] ?? null
              return (
                <Link
                  key={c.slug}
                  href={`/city/${c.slug}`}
                  className={`group block ${STANDARD_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${c.name} on EventLinqs`} layout="rail-standard-tile" />
                    ) : (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-navy-950), color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)))',
                        }}
                      />
                    )}
                    <TileCaption className="p-3">
                      <p className="font-display text-sm font-semibold text-white">{c.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">
                        {c.state}
                      </p>
                    </TileCaption>
                  </div>
                </Link>
              )
            })}
          </SnapRailScroller>
          <p className="mt-6 text-xs text-[var(--text-secondary)]">
            All {allCities.length} cities on EventLinqs are listed in the
            {' '}
            <Link href="/events" className="underline hover:text-[var(--text-primary)]">events directory</Link>,
            {' '}
            and every {city.name} event with its filters is at
            {' '}
            {/* THE ONE INTERNAL LINK /events/browse/[city] HAS.
              * A crawl of production on 8 September 2026 found that nothing on
              * the platform linked to it: 21 real, filterable pages reachable
              * only through the sitemap, which under close-out C19.3 they leave
              * while they hold no events (scripts/verify/internal-reachability.mjs).
              * The component written for this, CityRailTile, was never rendered
              * anywhere. This is the door, and it is useful to a reader as well:
              * the city page curates, the browse page filters. */}
            <Link
              href={`/events/browse/${city.slug}`}
              className="underline hover:text-[var(--text-primary)]"
            >
              browse {city.name}
            </Link>.
            {/* THE ONE INTERNAL LINK /free/[city]/this-week HAS (WI2 Part 2).
              * The gate's reachability crawl found it an orphan on 26 October
              * 2026: the week leaves the sitemap while it is empty, so a link is
              * the only way in, the same door /events/browse/[city] was given. */}
            {hasFreeGuide ? (
              <>
                {' '}
                Every free event in {city.name} this week is in the
                {' '}
                <Link
                  href={`/free/${city.slug}/this-week`}
                  className="underline hover:text-[var(--text-primary)]"
                >
                  {city.name} free guide
                </Link>.
              </>
            ) : null}
          </p>
        </ContentSection>
      ) : null}

      <CityOrganiserCtaPanel cityName={city.name} citySlug={city.slug} />

      {pageIsEmpty ? null : (
        <MobileStickyBar
          cityName={city.name}
          weekendCount={thisWeekendCandidates.length}
          anchorId="all-events"
        />
      )}
    </PageShell>
  )
}
