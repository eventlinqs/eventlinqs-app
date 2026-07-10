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
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CityTileImage } from '@/components/media/CityTileImage'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'
import type { CityContent, SuburbContent } from '@/lib/cities/data'
import { getAllCities, getCity } from '@/lib/cities/data'

interface Props {
  city: CityContent
  heroImage: string | null
  caption: string
  /** Live events filtered by city + future-dated. Already split by date below. */
  thisWeekEvents: EventCardData[]
  thisWeekendEvents: EventCardData[]
  popularEvents: EventCardData[]
  allEvents: EventCardData[]
  /** Map of event-type slug → Pexels landscape URL. */
  eventTypeImages: Record<string, string | null>
  /** Map of related city slug → Pexels portrait URL. */
  relatedCityImages: Record<string, string | null>
  /** Map of suburb slug → Pexels landscape URL. Tier 1 only. */
  suburbImages: Record<string, string | null>
  /** Map of community slug → Pexels landscape URL for the Browse-by-Community rail. */
  communityImages: Record<string, string | null>
  suburbs: SuburbContent[]
  /** Pre-built Mapbox pins (geocoded events). */
  mapPins: MapEventPin[]
  mapboxToken: string
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
  thisWeekEvents,
  thisWeekendEvents,
  popularEvents,
  allEvents,
  eventTypeImages,
  relatedCityImages,
  suburbImages,
  communityImages,
  suburbs,
  mapPins,
  mapboxToken,
}: Props) {
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
        primaryCtaLabel={`Browse all ${city.name} events`}
        secondaryCtaLabel="Sell tickets"
        secondaryCtaHref={`/organisers?city=${city.slug}`}
        caption={caption}
      />

      <Suspense fallback={null}>
        <DateFilterChips anchorId="all-events" />
      </Suspense>

      <CityEditorialSection
        eyebrow={`About ${city.name}`}
        heading={city.descriptor}
        paragraphs={[city.editorial]}
      />

      {thisWeekendEvents.length >= 4 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`Out this weekend in ${city.name}`}
            containerBg="ink-100"
            header={{
              eyebrow: 'This weekend',
              title: `Out this weekend in ${city.name}`,
              headerLink: { href: `/events?city=${city.slug}&date=weekend`, label: 'View all' },
            }}
          >
            {thisWeekendEvents.slice(0, 12).map(e => (
              <div key={e.id} className="w-[280px] shrink-0 snap-start">
                <EventCard event={e} variant="rail" />
              </div>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {thisWeekEvents.length >= 4 ? (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`On this week in ${city.name}`}
            header={{
              eyebrow: 'This week',
              title: `On this week in ${city.name}`,
              headerLink: { href: `/events?city=${city.slug}&date=7d`, label: 'View all' },
            }}
          >
            {thisWeekEvents.slice(0, 12).map(e => (
              <div key={e.id} className="w-[280px] shrink-0 snap-start">
                <EventCard event={e} variant="rail" />
              </div>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S5 Browse by Community rail - 14 photographic community tiles routing
          to /community/[community]/[city] for the cross-community-city
          intersection page added in Batch 5.5. */}
      <BrowseByCommunityRail
        citySlug={city.slug}
        cityName={city.name}
        images={communityImages}
      />

      <EventTypesRail
        citySlug={city.slug}
        cityName={city.name}
        images={eventTypeImages}
      />

      {mapboxToken ? (
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
            accessToken={mapboxToken}
          />
        </ContentSection>
      ) : null}

      {popularEvents.length >= 4 ? (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <SnapRailScroller
            railLabel={`${city.name} highlights`}
            containerBg="ink-100"
            header={{
              eyebrow: 'Popular this month',
              title: `${city.name} highlights`,
            }}
          >
            {popularEvents.slice(0, 12).map(e => (
              <div key={e.id} className="w-[280px] shrink-0 snap-start">
                <EventCard event={e} variant="rail" />
              </div>
            ))}
          </SnapRailScroller>
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
                  className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${s.name} - ${city.name}`} />
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
      <ContentSection id="all-events" surface="base" width="wide" topBorder reveal>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              All upcoming
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              All {city.name} events
            </h2>
          </div>
          {/* gold-800 (--brand-accent-strong) keeps the gold accent
           *  while clearing AA contrast on white. gold-400 fails 4.5:1. */}
          <Link
            href={`/events?city=${city.slug}`}
            className="text-sm font-medium text-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong-hover)]"
          >
            Open in browse view &rsaquo;
          </Link>
        </div>
        {allEvents.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {allEvents.slice(0, 24).map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <CategoryHeroEmpty
            eyebrow={city.name.toUpperCase()}
            headline={`The first ${city.name} event on EventLinqs could be yours.`}
            subhead={`Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
            primaryAction={{
              label: 'Talk to us about listing',
              href: `/contact?topic=organiser&city=${city.slug}`,
            }}
            secondaryAction={{ label: 'Browse all events', href: '/events' }}
            trustPillars={[
              { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in 5 minutes' },
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts in 7 days' },
            ]}
          />
        )}
      </ContentSection>

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
                  className="group block w-[240px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[260px]"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${c.name} on EventLinqs`} />
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
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                      style={{
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0) 100%)',
                      }}
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="font-display text-sm font-semibold text-white">{c.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">
                        {c.state}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </SnapRailScroller>
          <p className="mt-6 text-xs text-[var(--text-secondary)]">
            All {allCities.length} cities on EventLinqs are listed in the
            {' '}
            <Link href="/events" className="underline hover:text-[var(--text-primary)]">events directory</Link>.
          </p>
        </ContentSection>
      ) : null}

      <CityOrganiserCtaPanel cityName={city.name} citySlug={city.slug} />

      <MobileStickyBar
        cityName={city.name}
        weekendCount={thisWeekendEvents.length}
        anchorId="all-events"
      />
    </PageShell>
  )
}
