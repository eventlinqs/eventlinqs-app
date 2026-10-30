import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { TileCaption } from '@/components/media/tile-caption'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { getAllCommunities } from '@/lib/communities/data'
import { WIDE_TILE_CELL } from '@/lib/ui/rhythm'

interface Props {
  citySlug: string
  cityName: string
}

/**
 * BrowseByCommunityRail - the community tiles for /city/[slug] (the S5 section in the Batch 6 spec). Each tile routes
 * to the community-city intersection page at /community/[community]/[citySlug] for cross-discovery between city and
 * community-scene catalogues. Tiles are 4:5 portrait in a SnapRailScroller (arrows + drag + native swipe).
 *
 * NO PHOTO IS EVER REUSED (Lawal, 31 October 2026; C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md P6). These
 * tiles used to borrow each community's own photo, so that photo stood on the community's tile and again on this
 * rail in every city. A community-in-city page has no photo of its own, so each tile draws the navy tile and its
 * name, and this rail takes no photo.
 */
export function BrowseByCommunityRail({ citySlug, cityName }: Props) {
  const communities = getAllCommunities()
  return (
    <ContentSection surface="base" width="wide" topBorder reveal>
      <SnapRailScroller
        railLabel={`${cityName} by community`}
        header={{
          eyebrow: 'By community',
          title: `${cityName} by community`,
        }}
      >
        {communities.map(community => {
          return (
            <Link
              key={community.slug}
              href={`/community/${community.slug}/${citySlug}`}
              className={`group relative block ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-navy-950) 0%, color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)) 100%)',
                  }}
                  aria-hidden
                />
                <TileCaption className="p-4">
                  <p className="font-display text-base font-semibold text-white drop-shadow-sm sm:text-lg">
                    {community.displayName}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
                    in {cityName}
                  </p>
                </TileCaption>
              </div>
            </Link>
          )
        })}
      </SnapRailScroller>
    </ContentSection>
  )
}
