import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { getCulture, type CultureSlug } from '@/lib/cultures/data'

interface Props {
  related: CultureSlug[]
  /**
   * Map of related culture slug -> Pexels landscape URL (null when not
   * available). Tiles with null images render the navy-gradient fallback
   * so the rail stays visually uniform across all related cultures.
   */
  images: Record<string, string | null>
}

/**
 * RelatedCulturesRail - cross-discovery between culture pages.
 *
 * Batch 5.6: rebuilt from text-only cards to photographic tiles. Each
 * tile carries the related culture's hero image with a darkened bottom
 * gradient and the culture name + tagline anchored bottom-left in white.
 * Routes to /culture/{slug} so users can wander between adjacent scenes
 * (African - Caribbean - Gospel) without dead-ending on a single page.
 */
export function RelatedCulturesRail({ related, images }: Props) {
  const items = related
    .map(slug => getCulture(slug))
    .filter((x): x is NonNullable<typeof x> => x !== null)
  if (items.length === 0) return null
  return (
    <ContentSection surface="alt" width="default" topBorder>
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          Adjacent scenes
        </p>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          You might also like
        </h2>
      </div>
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map(culture => {
          const img = images[culture.slug] ?? null
          return (
            <li key={culture.slug}>
              <Link
                href={`/culture/${culture.slug}`}
                className="group relative block overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {img ? (
                    <CityTileImage
                      src={img}
                      alt={`${culture.displayName} on EventLinqs`}
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
                        'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0) 100%)',
                    }}
                    aria-hidden
                  />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
                      {culture.tier === 1 ? 'Culture' : 'Cross-cultural'}
                    </p>
                    <p className="mt-1 font-display text-lg font-bold text-white drop-shadow-sm sm:text-xl">
                      {culture.displayName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/85">
                      {culture.tagline}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </ContentSection>
  )
}
