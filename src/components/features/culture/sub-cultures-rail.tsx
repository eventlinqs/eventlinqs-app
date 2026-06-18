import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { SubCultureTileImage } from '@/components/media/SubCultureTileImage'
import type { SubCulture } from '@/lib/cultures/data'

interface Props {
  cultureSlug: string
  cultureName: string
  subCultures: SubCulture[]
  /**
   * Map of sub-culture slug → Pexels landscape URL (or null if Pexels
   * returned nothing or PEXELS_API_KEY is missing). Sub-cultures with
   * null images render the brand navy-gradient fallback so the layout
   * stays uniform across all 6 tiles.
   */
  images: Record<string, string | null>
}

/**
 * SubCulturesRail - 6 photographic sub-culture tiles.
 *
 * Each tile is a separated card: photographic image at top (4/3 aspect),
 * white card body below carrying label + blurb. Hover lifts the tile
 * with a soft shadow. Tile click routes to /events?culture={cultureSlug}&sub={subSlug}.
 */
export function SubCulturesRail({ cultureSlug, cultureName, subCultures, images }: Props) {
  if (subCultures.length === 0) return null
  return (
    <ContentSection surface="alt" width="default" topBorder reveal>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Inside {cultureName}
          </p>
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Every sound, every scene
          </h2>
        </div>
      </div>
      <ul
        role="list"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6"
      >
        {subCultures.map((sc) => {
          const img = images[sc.slug] ?? null
          return (
            <li key={sc.slug}>
              <Link
                href={`/events?culture=${cultureSlug}&sub_culture=${sc.slug}`}
                className="group block overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {img ? (
                    <SubCultureTileImage
                      src={img}
                      alt={`${sc.label} - ${cultureName}`}
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
                        'linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)',
                    }}
                    aria-hidden
                  />
                </div>
                <div className="p-3 sm:p-4">
                  <p className="font-display text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                    {sc.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
                    {sc.blurb}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </ContentSection>
  )
}
