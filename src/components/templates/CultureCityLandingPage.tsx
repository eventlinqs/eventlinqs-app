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
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'
import type { CultureContent } from '@/lib/cultures/data'
import type { CityContent } from '@/lib/cities/data'

interface RelatedIntersection {
  cultureSlug: string
  cultureLabel: string
  citySlug: string
  cityLabel: string
  image: string | null
}

interface RelatedCulture {
  slug: string
  label: string
  tagline: string
  image: string | null
}

interface Props {
  culture: CultureContent
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

  /** Map of sub-culture slug → Pexels landscape URL (null when not available). */
  subCultureImages: Record<string, string | null>

  /** [Culture] in other cities rail - one card per other listed city. */
  relatedCities: RelatedIntersection[]

  /** Other cultures in [city] rail - one card per other tier-1 culture. */
  relatedCultures: RelatedCulture[]

  /** Pre-built Mapbox pins (geocoded events filtered to this culture+city). */
  mapPins: MapEventPin[]
  mapboxToken: string
}

/**
 * CultureCityLandingPage - the /culture/[culture]/[city] template
 * (Batch 7).
 *
 * 12 sections per spec:
 *   S1  Hero (CityHero with culture+city labels)
 *   S2  DateFilterChips (sticky)
 *   S3  CityEditorialSection (150-200 words generated)
 *   S4  This Week + This Weekend rails (≥4 events to render)
 *   S5  Sub-cultures in [city] rail (Tier 1 cultures only)
 *   S6  Popular this month rail (≥4 events to render)
 *   S7  CityMap (Mapbox)
 *   S8  Featured organisers (hidden until populated)
 *   S9  Featured venues (hidden until populated)
 *   S10 All [culture] events in [city] (paginated grid)
 *   S11 Related intersections - 2 rails:
 *       - [Culture] in other cities
 *       - Other cultures in [city]
 *   S12 Organiser CTA + Newsletter
 *   S13 MobileStickyBar (≤768px)
 */
export function CultureCityLandingPage({
  culture,
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
  subCultureImages,
  relatedCities,
  relatedCultures,
  mapPins,
  mapboxToken,
}: Props) {
  const subCultures = culture.subCultures
  const showSubCulturesRail = culture.tier === 1 && subCultures.length > 0

  return (
    <PageShell>
      {/* S1 Hero */}
      <CityHero
        eyebrow={`${culture.displayName.toUpperCase()} · ${cityName.toUpperCase()}`}
        title={`${culture.displayName} events in ${cityName}`}
        subtitle={heroSubtitle}
        imageSrc={heroImage}
        primaryCtaLabel={`Browse all ${culture.displayName} ${cityName} events`}
        secondaryCtaLabel={`Sell tickets in ${cityName}`}
        secondaryCtaHref={`/organisers?city=${citySlug}&culture=${culture.slug}`}
        caption={caption}
      />

      {/* S2 Date filter chips */}
      <Suspense fallback={null}>
        <DateFilterChips anchorId="all-events" />
      </Suspense>

      {/* S3 Editorial */}
      <CityEditorialSection
        eyebrow={`${culture.displayName} in ${cityName}`}
        heading={`Where ${culture.displayName.toLowerCase()} ${cityName} happens`}
        paragraphs={[editorial]}
      />

      {/* S4 This weekend */}
      {thisWeekendEvents.length >= 4 ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`${culture.displayName} this weekend in ${cityName}`}
            containerBg="ink-100"
            header={{
              eyebrow: 'This weekend',
              title: `${culture.displayName} this weekend in ${cityName}`,
              headerLink: {
                href: `/events?culture=${culture.slug}&city=${citySlug}&date=weekend`,
                label: 'View all',
              },
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

      {/* S4 This week */}
      {thisWeekEvents.length >= 4 ? (
        <ContentSection surface="base" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`${culture.displayName} this week in ${cityName}`}
            header={{
              eyebrow: 'This week',
              title: `${culture.displayName} this week in ${cityName}`,
              headerLink: {
                href: `/events?culture=${culture.slug}&city=${citySlug}&date=7d`,
                label: 'View all',
              },
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

      {/* S5 Sub-cultures in city rail (Tier 1 only) */}
      {showSubCulturesRail ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`${culture.displayName} sub-communities in ${cityName}`}
            containerBg="ink-100"
            header={{
              eyebrow: `${culture.displayName} in ${cityName}`,
              title: `Every ${culture.displayName.toLowerCase()} sound, in ${cityName}`,
            }}
          >
            {subCultures.map(sc => {
              const img = subCultureImages[sc.slug] ?? null
              return (
                <Link
                  key={sc.slug}
                  href={`/events?culture=${culture.slug}&sub_culture=${sc.slug}&city=${citySlug}`}
                  className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${sc.label} in ${cityName}`} />
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
      {popularEvents.length >= 4 ? (
        <ContentSection surface="base" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`${culture.displayName} highlights in ${cityName}`}
            header={{
              eyebrow: 'Popular this month',
              title: `${culture.displayName} highlights in ${cityName}`,
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

      {/* S7 Map - only when we have city coords AND mapbox token */}
      {mapboxToken && cityRecord ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              Map
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              Where {culture.displayName.toLowerCase()} {cityName} is happening
            </h2>
          </div>
          <CityMap
            centerLng={cityRecord.longitude}
            centerLat={cityRecord.latitude}
            zoom={cityRecord.mapZoom}
            pins={mapPins}
            accessToken={mapboxToken}
          />
        </ContentSection>
      ) : null}

      {/* S10 All events in city (paginated grid). S8/S9 organisers/venues
          render conditionally - hidden until populated. */}
      <ContentSection id="all-events" surface="base" width="wide" topBorder>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              All upcoming
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              All {culture.displayName} events in {cityName}
            </h2>
          </div>
          <Link
            href={`/events?culture=${culture.slug}&city=${citySlug}`}
            className="text-sm font-medium text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)]"
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
            eyebrow={`${culture.displayName.toUpperCase()} · ${cityName.toUpperCase()}`}
            headline={`The first ${culture.displayName} ${cityName} event on EventLinqs could be yours.`}
            subhead={`${culture.tagline} Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
            primaryAction={{
              label: 'Talk to us about listing',
              href: `/contact?topic=organiser&culture=${culture.slug}&city=${citySlug}`,
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

      {/* S11a [Culture] in other cities */}
      {relatedCities.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`${culture.displayName} in other cities`}
            containerBg="ink-100"
            header={{
              eyebrow: 'Take it on the road',
              title: `${culture.displayName} in other cities`,
            }}
          >
            {relatedCities.map(item => (
              <Link
                key={item.citySlug}
                href={`/culture/${item.cultureSlug}/${item.citySlug}`}
                className="group block w-[240px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[260px]"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {item.image ? (
                    <CityTileImage src={item.image} alt={`${item.cultureLabel} in ${item.cityLabel}`} />
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
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0) 100%)',
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="font-display text-sm font-semibold text-white">
                      {item.cultureLabel}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                      in {item.cityLabel}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S11b Other cultures in [city] */}
      {relatedCultures.length > 0 ? (
        <ContentSection surface="base" width="wide" topBorder>
          <SnapRailScroller
            railLabel={`Other communities in ${cityName}`}
            header={{
              eyebrow: 'Wander next door',
              title: `Other communities in ${cityName}`,
            }}
          >
            {relatedCultures.map(item => (
              <Link
                key={item.slug}
                href={`/culture/${item.slug}/${citySlug}`}
                className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {item.image ? (
                    <CityTileImage src={item.image} alt={`${item.label} in ${cityName}`} />
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
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0) 100%)',
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-base font-semibold text-white drop-shadow-sm">
                      {item.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/85">
                      {item.tagline}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </SnapRailScroller>
        </ContentSection>
      ) : null}

      {/* S12 Organiser CTA + Newsletter. The panel headline reads
       *  "Throwing an event in {cityName}?" - using just the city name
       *  reads cleanly. The intersection (culture × city) is already
       *  implicit from where the user is on the page. */}
      <CityOrganiserCtaPanel cityName={cityName} citySlug={citySlug} />

      {/* S13 Mobile sticky bar - keep the culture context here since
       *  the bar's CTA copy is "Browse all X events" and the user
       *  benefits from the more specific label. */}
      <MobileStickyBar
        cityName={`${culture.displayName} ${cityName}`}
        weekendCount={thisWeekendEvents.length}
        anchorId="all-events"
      />
    </PageShell>
  )
}
