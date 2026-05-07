import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { SnapRailScroller } from '@/components/ui/snap-rail'

export function citySlugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface Props {
  cultureSlug: string
  cultureName: string
  cities: string[]
  /**
   * Map of city slug -> Pexels portrait URL (null when not available).
   * Tiles with null images render the navy-gradient fallback so the
   * rail stays visually uniform.
   */
  images: Record<string, string | null>
}

/**
 * CulturesByCityRail - photographic city tiles for /culture/[culture].
 *
 * Batch 5.6: rebuilt from a static grid into the SnapRailScroller pattern
 * used on the homepage. Arrow nav + drag-scroll on desktop, native swipe
 * snap on mobile, scroll-progress indicator below.
 *
 * Each tile is 280px wide (the SnapRail card contract), 4/5 portrait
 * aspect, photographic city image with a darkened bottom-up gradient and
 * the city name anchored bottom-left in white. Click routes to
 * /culture/{cultureSlug}/{citySlug} - the intersection landing page.
 */
export function CulturesByCityRail({ cultureSlug, cultureName, cities, images }: Props) {
  if (cities.length === 0) return null
  return (
    <ContentSection surface="base" width="default" topBorder>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Where it lives
          </p>
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            {cultureName} in cities everywhere
          </h2>
        </div>
      </div>
      <SnapRailScroller railLabel={`${cultureName} cities`}>
        {cities.map((city) => {
          const slug = citySlugify(city)
          const img = images[slug] ?? null
          return (
            <Link
              key={city}
              href={`/culture/${cultureSlug}/${slug}`}
              className="group relative block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                {img ? (
                  <CityTileImage
                    src={img}
                    alt={`${cultureName} events in ${city}`}
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
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0) 100%)',
                  }}
                  aria-hidden
                />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="font-display text-base font-semibold text-white drop-shadow-sm sm:text-lg">
                    {city}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
                    {cultureName} events
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </SnapRailScroller>
    </ContentSection>
  )
}
