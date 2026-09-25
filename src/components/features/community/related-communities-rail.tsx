import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityTileImage } from '@/components/media/CityTileImage'
import { TileCaption } from '@/components/media/tile-caption'
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
 * tile carries the related community's hero image with the community NAME
 * alone on it, inside <TileCaption>, and the eyebrow and tagline below the
 * image on canvas. The three of them used to share the picture under a wash
 * that was a percentage of the tile, which measured 130px of caption on a
 * 223px tile - 69 per cent of the photograph darkened - and left the words
 * wherever the ramp happened to be. See src/components/media/tile-photo-scrim.ts.
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
                className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg motion-reduce:transition-none"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-navy-950)]">
                  {img ? (
                    <CityTileImage
                      layout="grid-one-two-three-sm"
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
                  {/* THE NAME AND NOTHING ELSE ON THE PICTURE. The eyebrow and
                    *  the tagline used to sit here too, and on a 16:10 tile that
                    *  caption measured 130px against 223px: 69 per cent of the
                    *  tile darkened, on a rail whose whole job is to show a
                    *  photograph. The design system asks for exactly this
                    *  ("Image alone, all details below the image"), and the
                    *  measurement agrees with it. */}
                  <TileCaption className="p-5">
                    <p className="font-display text-lg font-bold text-white drop-shadow-sm sm:text-xl">
                      {community.displayName}
                    </p>
                  </TileCaption>
                </div>
                <div className="p-5 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                    {community.tier === 1 ? 'Community' : 'Cross-community'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-[var(--text-secondary)]">
                    {community.tagline}
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
