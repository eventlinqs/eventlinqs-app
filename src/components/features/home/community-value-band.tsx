import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { CommunityTile } from '@/components/features/home/cards'
import { getCultureIndexEntries } from '@/lib/cultures/index-page-data'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'

/**
 * CommunityValueBand - the ONE community value moment on the homepage.
 *
 * A single tinted (surface=alt) band carrying the locked tagline, a short line,
 * a row of real community tiles linking into the /culture/[slug] landings, and a
 * CTA into the /cultures hub. Treated surface with a gold top divider - never a
 * bare band (Law 1 / premium bar). This is the lower bookend of the community
 * moat (the CommunityRail is the higher one); together with the Browse-by-
 * Category doorway they keep community at ~10-20% of the page, never dominant.
 */

const BAND_COUNT = 6

export async function CommunityValueBand() {
  const entries = (await getCultureIndexEntries()).slice(0, BAND_COUNT)
  if (entries.length === 0) return null

  const tiles = await Promise.all(
    entries.map(async e => ({
      slug: e.slug,
      name: e.displayName,
      metaLabel: e.eventCount > 0 ? `${e.eventCount} ${e.eventCount === 1 ? 'event' : 'events'}` : 'Be the first',
      imageSrc: await getCultureHeroPhoto(e.slug),
    })),
  )

  return (
    // pad="rail" matches the SECTION_RAIL beat so the band's seams equal every
    // rail's 64px seam - no oversized gap after the Sounds rail (the tinted
    // surface + gold divider give it presence without extra padding).
    <ContentSection surface="alt" width="wide" pad="rail" topBorder>
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          The community moat
        </p>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
          Every community. Every event. One platform.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          The events your community actually shows up for, led by Aboriginal and
          Torres Strait Islander peoples, with a home for every heritage across
          Australia.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {tiles.map(t => (
          <CommunityTile
            key={t.slug}
            community={{
              href: `/culture/${t.slug}`,
              imageSrc: t.imageSrc,
              alt: `${t.name} community events`,
              name: t.name,
              metaLabel: t.metaLabel,
            }}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Button href="/cultures" variant="primary" size="lg">
          Browse all communities
        </Button>
      </div>
    </ContentSection>
  )
}
