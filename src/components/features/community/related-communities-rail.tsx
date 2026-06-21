import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { getCommunity, type CommunitySlug } from '@/lib/communities/data'

interface Props {
  related: CommunitySlug[]
  /**
   * Map of related community slug -> Pexels landscape URL (null when not
   * available). Tiles with null images render the navy-gradient fallback
   * so the rail stays visually uniform across all related communities.
   */
  images: Record<string, string | null>
}

/**
 * RelatedCommunitiesRail - cross-discovery between community pages.
 *
 * Batch 5.6: rebuilt from text-only cards to photographic tiles. Each
 * tile carries the related community's hero image with a darkened bottom
 * gradient and the community name + tagline anchored bottom-left in white.
 * Routes to /community/{slug} so users can wander between adjacent scenes
 * (African - Caribbean - Gospel) without dead-ending on a single page.
 */
export function RelatedCommunitiesRail({ related, images }: Props) {
  const items = related
    .map(slug => getCommunity(slug))
    .filter((x): x is NonNullable<typeof x> => x !== null)
  if (items.length === 0) return null
  return (
    <ContentSection surface="alt" width="default" topBorder reveal>
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
        {items.map(community => {
          const img = images[community.slug] ?? null
          return (
            <li key={community.slug}>
              <Link
                href={`/community/${community.slug}`}
                className="group relative block overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {img ? (
                    <CityTileImage
                      src={img}
                      alt={`${community.displayName} on EventLinqs`}
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
                      {community.tier === 1 ? 'Community' : 'Cross-community'}
                    </p>
                    <p className="mt-1 font-display text-lg font-bold text-white drop-shadow-sm sm:text-xl">
                      {community.displayName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/85">
                      {community.tagline}
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
