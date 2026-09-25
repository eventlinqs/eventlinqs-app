import Link from 'next/link'
import { Suspense } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityHero } from '@/components/features/city/city-hero'
import { DateFilterChips } from '@/components/features/city/date-filter-chips'
import { CityEditorialSection } from '@/components/features/city/city-editorial-section'
import { CityMap, type MapEventPin } from '@/components/features/city/city-map'
import { CityOrganiserCtaPanel } from '@/components/features/city/city-organiser-cta-panel'
import { MobileStickyBar } from '@/components/features/city/mobile-sticky-bar'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CityTileImage } from '@/components/media/CityTileImage'
import { TileCaption } from '@/components/media/tile-caption'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'
import type { CommunityContent } from '@/lib/communities/data'
import type { CityContent } from '@/lib/cities/data'
import { STANDARD_TILE_CELL, WIDE_TILE_CELL , FLAT_RAIL_CELL } from '@/lib/ui/rhythm'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'

interface RelatedIntersection {
  communitySlug: string
  communityLabel: string
  citySlug: string
  cityLabel: string
  image: string | null
}

interface RelatedCommunity {
  slug: string
  label: string
  tagline: string
  image: string | null
}

/**
 * How many of the intersection's events the grid shows. It was the literal
 * 24 inside `.slice(0, 24)`; it is named because the reserved height is now
 * derived from the same number (close-out C8B.3, 19 September 2026).
 */
const ALL_EVENTS_SHOWN = 24

interface Props {
  community: CommunityContent
  cityName: string
  citySlug: string
  cityRecord: CityContent | null
  heroImage: string | null
  editorial: string
  heroSubtitle: string
  caption: string

  thisWeekEvents: EventCardData[]
  thisWeekendEvents: EventCardData[]
  popularEvents: EventCardData[]
  allEvents: EventCardData[]

  /** Map of sub-community slug → Pexels landscape URL (null when not available). */
  subCommunityImages: Record<string, string | null>

  /** [Community] in other cities rail - one card per other listed city. */
  relatedCities: RelatedIntersection[]

  /** Other communities in [city] rail - one card per other tier-1 community. */
  relatedCommunities: RelatedCommunity[]

  /** Pre-built Mapbox pins (geocoded events filtered to this community+city). */
  mapPins: MapEventPin[]
}

/**
 * CommunityCityLandingPage - the /community/[community]/[city] template
 * (Batch 7).
 *
 * 12 sections per spec:
 *   S1  Hero (CityHero with community+city labels)
 *   S2  DateFilterChips (sticky)
 *   S3  CityEditorialSection (150-200 words generated)
 *   S4  This Week + This Weekend rails (≥4 events to render)
 *   S5  Sub-communities in [city] rail (Tier 1 communities only)
 *   S6  Popular this month rail (≥4 events to render)
 *   S7  CityMap (Mapbox)
 *   S8  Featured organisers (hidden until populated)
 *   S9  Featured venues (hidden until populated)
 *   S10 All [community] events in [city] (paginated grid)
 *   S11 Related intersections - 2 rails:
 *       - [Community] in other cities
 *       - Other communities in [city]
 *   S12 Organiser CTA + Newsletter
 *   S13 MobileStickyBar (≤768px)
 */
export function CommunityCityLandingPage({
  community,
  cityName,
  citySlug,
  cityRecord,
  heroImage,
  editorial,
  heroSubtitle,
  caption,
  thisWeekEvents,
  thisWeekendEvents,
  popularEvents,
  allEvents,
  subCommunityImages,
  relatedCities,
  relatedCommunities,
  mapPins,
}: Props) {
  /* ONE array feeds both the reserved height and the cards. */
  const shownEvents = allEvents.slice(0, ALL_EVENTS_SHOWN)
  const subCommunities = community.subCommunities
  const showSubCommunitiesRail = community.tier === 1 && subCommunities.length > 0

  return (
    <PageShell>
      {/* S1 Hero */}
      <CityHero
        eyebrow={`${community.displayName.toUpperCase()} · ${cityName.toUpperCase()}`}
        title={`${community.displayName} events in ${cityName}`}
        subtitle={heroSubtitle}
        imageSrc={heroImage}
        primaryCtaLabel={`Browse all ${community.displayName} ${cityName} events`}
        secondaryCtaLabel={`Sell tickets in ${cityName}`}
        secondaryCtaHref={`/organisers?city=${citySlug}&community=${community.slug}`}
        caption={caption}
      />

      {/* S2 Date filter chips */}
      <Suspense fallback={null}>
        <DateFilterChips anchorId="all-events" />
      </Suspense>

      {/* S3 Editorial */}
      <CityEditorialSection
        eyebrow={`${community.displayName} in ${cityName}`}
        heading={`Where ${community.displayName} ${cityName} happens`}
        paragraphs={[editorial]}
      />

      {/* S4 This weekend */}
      {/* ONE EVENT SHOWS THE RAIL (founder ruling, 23 August 2026). These curated
        rails were gated at `>= 4`, so a city or community with one, two or three
        events on showed none of them here and fell through to the full grid below.
        On a platform still building volume that hid the only event a place had. The
        gate is gone; an empty rail still does not render, because there is nothing
        to show. */}
      {thisWeekendEvents.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${community.displayName} this weekend in ${cityName}`}
            containerBg="ink-100"
            header={{
              eyebrow: 'This weekend',
              title: `${community.displayName} this weekend in ${cityName}`,
              headerLink: {
                href: `/events?community=${community.slug}&city=${citySlug}&date=weekend`,
                label: 'View all',
              },
            }}
          >
            {thisWeekendEvents.slice(0, 12).map(e => (
              <div key={e.id} className={FLAT_RAIL_CELL}>
                <EventCard event={e} variant="rail-flat" />
              </div>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S4 This week */}
      {thisWeekEvents.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${community.displayName} this week in ${cityName}`}
            header={{
              eyebrow: 'This week',
              title: `${community.displayName} this week in ${cityName}`,
              headerLink: {
                href: `/events?community=${community.slug}&city=${citySlug}&date=7d`,
                label: 'View all',
              },
            }}
          >
            {thisWeekEvents.slice(0, 12).map(e => (
              <div key={e.id} className={FLAT_RAIL_CELL}>
                <EventCard event={e} variant="rail-flat" />
              </div>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S5 Sub-communities in city rail (Tier 1 only) */}
      {showSubCommunitiesRail ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${community.displayName} sub-communities in ${cityName}`}
            containerBg="ink-100"
            header={{
              eyebrow: `${community.displayName} in ${cityName}`,
              title: `Every ${community.displayName} sound, in ${cityName}`,
            }}
          >
            {subCommunities.map(sc => {
              const img = subCommunityImages[sc.slug] ?? null
              return (
                <Link
                  key={sc.slug}
                  href={`/events?community=${community.slug}&sub_community=${sc.slug}&city=${citySlug}`}
                  className={`group block ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${sc.label} in ${cityName}`} layout="rail-wide-tile" />
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
                    <p className="font-display text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                      {sc.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)] sm:text-sm">
                      {sc.blurb}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
                      In {cityName}
                    </p>
                  </div>
                </Link>
              )
            })}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S6 Popular this month */}
      {popularEvents.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${community.displayName} highlights in ${cityName}`}
            header={{
              eyebrow: 'Popular this month',
              title: `${community.displayName} highlights in ${cityName}`,
            }}
          >
            {popularEvents.slice(0, 12).map(e => (
              <div key={e.id} className={FLAT_RAIL_CELL}>
                <EventCard event={e} variant="rail-flat" />
              </div>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S7 Map - Google Maps (one provider platform-wide), when city coords + events */}
      {cityRecord && mapPins.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              Map
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              Where {community.displayName} {cityName} is happening
            </h2>
          </div>
          <CityMap
            centerLng={cityRecord.longitude}
            centerLat={cityRecord.latitude}
            zoom={cityRecord.mapZoom}
            pins={mapPins}
          />
        </ContentSection>
      ) : null}

      {/* S10 All events in city (paginated grid). S8/S9 organisers/venues
          render conditionally - hidden until populated. */}
      {/* The events grid, the same markup as the city page's and therefore the
          same height arithmetic: it declares what it will be rather than
          inheriting a rail's 480px. src/lib/ui/event-grid-intrinsic.ts.
          NOTE, honestly: no intersection on TEST held a published event on
          19 September 2026, so this one is covered by the drive on the city
          page it is a copy of, and by the guard that holds the two markups
          identical - never by a measurement of itself. */}
      <ContentSection
        id="all-events"
        surface="base"
        width="wide"
        topBorder
        reveal
        intrinsicSize={eventGridIntrinsicSize(shownEvents.length)}
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              All upcoming
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              All {community.displayName} events in {cityName}
            </h2>
          </div>
          <Link
            href={`/events?community=${community.slug}&city=${citySlug}`}
            className="text-sm font-medium text-[var(--brand-accent-strong)] hover:text-[var(--text-primary)]"
          >
            Open in browse view &rsaquo;
          </Link>
        </div>
        {shownEvents.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {shownEvents.map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <CategoryHeroEmpty
            eyebrow={`${community.displayName.toUpperCase()} · ${cityName.toUpperCase()}`}
            headline={`The first ${community.displayName} ${cityName} event on EventLinqs could be yours.`}
            subhead={`${community.tagline} Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
            primaryAction={{
              label: 'Talk to us about listing',
              href: `/contact?topic=organiser&community=${community.slug}&city=${citySlug}`,
            }}
            secondaryAction={{
              label: `Browse all ${cityName} events`,
              href: `/city/${citySlug}`,
            }}
            trustPillars={[
              { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in 5 minutes' },
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts in 7 days' },
            ]}
          />
        )}
      </ContentSection>

      {/* S11a [Community] in other cities */}
      {relatedCities.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${community.displayName} in other cities`}
            containerBg="ink-100"
            header={{
              eyebrow: 'Take it on the road',
              title: `${community.displayName} in other cities`,
            }}
          >
            {relatedCities.map(item => (
              <Link
                key={item.citySlug}
                href={`/community/${item.communitySlug}/${item.citySlug}`}
                className={`group block ${STANDARD_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {item.image ? (
                    <CityTileImage src={item.image} alt={`${item.communityLabel} in ${item.cityLabel}`} layout="rail-standard-tile" />
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
                    <p className="font-display text-sm font-semibold text-white">
                      {item.communityLabel}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                      in {item.cityLabel}
                    </p>
                  </TileCaption>
                </div>
              </Link>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S11b Other communities in [city] */}
      {relatedCommunities.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`Other communities in ${cityName}`}
            header={{
              eyebrow: 'Wander next door',
              title: `Other communities in ${cityName}`,
            }}
          >
            {relatedCommunities.map(item => (
              <Link
                key={item.slug}
                href={`/community/${item.slug}/${citySlug}`}
                className={`group flex h-full flex-col ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg motion-reduce:transition-none`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {item.image ? (
                    <CityTileImage src={item.image} alt={`${item.label} in ${cityName}`} layout="rail-wide-tile" />
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
                  {/* The tagline moved below the image: on this 16:10 tile the
                    *  two together measured 93px against 161px, 72.6 per cent of
                    *  a picture the rail exists to show. */}
                  <TileCaption className="p-4">
                    <p className="font-display text-base font-semibold text-white drop-shadow-sm">
                      {item.label}
                    </p>
                  </TileCaption>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <p className="line-clamp-2 text-xs leading-snug text-[var(--text-secondary)]">
                    {item.tagline}
                  </p>
                </div>
              </Link>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S12 Organiser CTA + Newsletter. The panel headline reads
       *  "Throwing an event in {cityName}?" - using just the city name
       *  reads cleanly. The intersection (community × city) is already
       *  implicit from where the user is on the page. */}
      <CityOrganiserCtaPanel cityName={cityName} citySlug={citySlug} />

      {/* S13 Mobile sticky bar - keep the community context here since
       *  the bar's CTA copy is "Browse all X events" and the user
       *  benefits from the more specific label. */}
      <MobileStickyBar
        cityName={`${community.displayName} ${cityName}`}
        weekendCount={thisWeekendEvents.length}
        anchorId="all-events"
      />
    </PageShell>
  )
}
