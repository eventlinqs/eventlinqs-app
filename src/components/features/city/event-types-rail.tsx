import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { CITY_EVENT_TYPES } from '@/lib/cities/data'

interface Props {
  citySlug: string
  cityName: string
  /** Map of event-type slug -> Pexels landscape URL (null when not available). */
  images: Record<string, string | null>
}

/**
 * EventTypesRail - 8 photographic event-type tiles for /city/[slug].
 *
 * Each tile represents one of the city-page event types (concerts, DJ
 * sets, comedy, theatre, workshops, community, food & drink, sports).
 * Photographic top, white card body with type label below. Click routes
 * to /events?city={citySlug}&event_type={typeSlug}.
 */
export function EventTypesRail({ citySlug, cityName, images }: Props) {
  return (
    <ContentSection surface="alt" width="default" topBorder>
      <SnapRailScroller
        railLabel={`${cityName} event types`}
        header={{
          eyebrow: 'By format',
          title: `Browse ${cityName} by event type`,
        }}
      >
        {CITY_EVENT_TYPES.map(t => {
          const img = images[t.slug] ?? null
          return (
            <Link
              key={t.slug}
              href={`/events?city=${citySlug}&event_type=${t.slug}`}
              className="group relative block w-[240px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[260px]"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                {img ? (
                  <CityTileImage
                    src={img}
                    alt={`${t.label} in ${cityName}`}
                    className="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-navy-950) 0%, color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)) 100%)',
                    }}
                    aria-hidden
                  />
                )}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
                  }}
                  aria-hidden
                />
              </div>
              <div className="p-3 sm:p-4">
                <p className="font-display text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                  {t.label}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {cityName}
                </p>
              </div>
            </Link>
          )
        })}
      </SnapRailScroller>
    </ContentSection>
  )
}
