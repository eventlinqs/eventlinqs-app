import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { getAllCultures } from '@/lib/cultures/data'

interface Props {
  citySlug: string
  cityName: string
  /** Map of culture slug -> Pexels landscape URL (null when not available). */
  images: Record<string, string | null>
}

/**
 * BrowseByCultureRail - 14 photographic culture tiles for /city/[slug]
 * (the S5 section in the Batch 6 spec). Each tile routes to the
 * culture-city intersection page at /culture/[culture]/[citySlug] for
 * cross-discovery between city and cultural-scene catalogues.
 *
 * Tiles are 4:5 portrait (matches the homepage rail pattern), sit in
 * a SnapRailScroller (arrows + drag + native swipe), and fall back to
 * the navy-gradient placeholder when no Pexels image is available.
 */
export function BrowseByCultureRail({ citySlug, cityName, images }: Props) {
  const cultures = getAllCultures()
  return (
    <ContentSection surface="base" width="wide" topBorder>
      <SnapRailScroller
        railLabel={`${cityName} by community`}
        header={{
          eyebrow: 'By community',
          title: `${cityName} by community`,
        }}
      >
        {cultures.map(culture => {
          const img = images[culture.slug] ?? null
          return (
            <Link
              key={culture.slug}
              href={`/culture/${culture.slug}/${citySlug}`}
              className="group relative block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                {img ? (
                  <CityTileImage
                    src={img}
                    alt={`${culture.displayName} events in ${cityName}`}
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
                    {culture.displayName}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
                    in {cityName}
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
