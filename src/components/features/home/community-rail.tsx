import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { CommunityTile } from '@/components/features/home/cards'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP } from '@/lib/ui/rhythm'
import { getCommunityIndexEntries } from '@/lib/communities/index-page-data'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getSpineSceneForCommunity } from '@/lib/images/spine'

/**
 * CommunityRail - the homepage community moat (Find your community).
 *
 * The differentiating layer no competitor has, surfaced HIGH (within the first
 * two screens) but never dominant. Carries the canonical heritage communities
 * from `getCommunityIndexEntries()` - the same source as /communities, already sorted
 * by heritageOrder so Aboriginal & Torres Strait Islander leads (positioning
 * law: First Nations first). Each tile links to its REAL `/community/[slug]`
 * landing (zero dead links), photo via getCommunityHeroPhoto with the branded
 * fallback baked into EventCardMedia (no broken images).
 *
 * Community-first language and a gold-accent top divider mark it as the moat,
 * distinct from the general category rails. Variant-B rhythm + the rail control
 * system are inherited unchanged via SnapRail.
 */

// How many communities to surface in the rail before "View all communities".
const RAIL_COUNT = 14

export async function CommunityRail() {
  const entries = (await getCommunityIndexEntries()).slice(0, RAIL_COUNT)
  if (entries.length === 0) return null

  const tiles = await Promise.all(
    entries.map(async (e, i) => {
      // Spine-first for the wired community scenes; the rest keep the Pexels
      // community hero (held scenes await Community->Community Phase 2).
      const spine = getSpineSceneForCommunity(e.slug)
      return {
        slug: e.slug,
        name: e.displayName,
        tagline: e.tagline,
        metaLabel: e.eventCount > 0 ? `${e.eventCount} ${e.eventCount === 1 ? 'event' : 'events'}` : 'Be the first',
        imageSrc: spine ? spine.src : await getCommunityHeroPhoto(e.slug),
        objectPosition: spine?.objectPosition,
        priority: i < 4,
      }
    }),
  )

  return (
    // Founder consistency law 2026-07-12: ONE faint divider weight platform-wide (border-t border-ink-200); the community moat is marked by its gold eyebrow, not a heavier rule.
    <section aria-label="Find your community" className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}>
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="Find your community"
          title="Your people, your events"
          headerLink={{ href: '/communities', label: 'View all communities' }}
          railLabel="Communities"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {tiles.map(t => (
            <div key={t.slug} className="w-[160px] shrink-0 snap-start sm:w-[180px]">
              <CommunityTile
                community={{
                  href: `/community/${t.slug}`,
                  imageSrc: t.imageSrc,
                  alt: `${t.name} community events`,
                  name: t.name,
                  metaLabel: t.metaLabel,
                  priority: t.priority,
                  objectPosition: t.objectPosition,
                }}
              />
            </div>
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
