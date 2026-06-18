import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { CommunityTile } from '@/components/features/home/cards'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP } from '@/lib/ui/rhythm'
import { getCultureIndexEntries } from '@/lib/cultures/index-page-data'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getSpineSceneForCulture } from '@/lib/images/spine'

/**
 * CommunityRail - the homepage community moat (Find your community).
 *
 * The differentiating layer no competitor has, surfaced HIGH (within the first
 * two screens) but never dominant. Carries the canonical heritage communities
 * from `getCultureIndexEntries()` - the same source as /cultures, already sorted
 * by heritageOrder so Aboriginal & Torres Strait Islander leads (positioning
 * law: First Nations first). Each tile links to its REAL `/culture/[slug]`
 * landing (zero dead links), photo via getCultureHeroPhoto with the branded
 * fallback baked into EventCardMedia (no broken images).
 *
 * Community-first language and a gold-accent top divider mark it as the moat,
 * distinct from the general category rails. Variant-B rhythm + the rail control
 * system are inherited unchanged via SnapRail.
 */

// How many communities to surface in the rail before "View all communities".
const RAIL_COUNT = 14

export async function CommunityRail() {
  const entries = (await getCultureIndexEntries()).slice(0, RAIL_COUNT)
  if (entries.length === 0) return null

  const tiles = await Promise.all(
    entries.map(async (e, i) => {
      // Spine-first for the wired community scenes; the rest keep the Pexels
      // culture hero (held scenes await Culture->Community Phase 2).
      const spine = getSpineSceneForCulture(e.slug)
      return {
        slug: e.slug,
        name: e.displayName,
        tagline: e.tagline,
        metaLabel: e.eventCount > 0 ? `${e.eventCount} ${e.eventCount === 1 ? 'event' : 'events'}` : 'Be the first',
        imageSrc: spine ? spine.src : await getCultureHeroPhoto(e.slug),
        objectPosition: spine?.objectPosition,
        priority: i < 4,
      }
    }),
  )

  return (
    // Gold-accent top divider marks the community moat as its own moment.
    <section aria-label="Find your community" className={`border-t-2 border-[var(--brand-accent-strong)]/30 bg-canvas ${SECTION_RAIL}`}>
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="Find your community"
          title="Your people, your events"
          headerLink={{ href: '/cultures', label: 'View all communities' }}
          railLabel="Communities"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {tiles.map(t => (
            <div key={t.slug} className="w-[160px] shrink-0 snap-start sm:w-[180px]">
              <CommunityTile
                community={{
                  href: `/culture/${t.slug}`,
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
