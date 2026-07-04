import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { PhotographicCommunityHero } from '@/components/templates/PhotographicCommunityHero'
import { SubCommunitiesRail } from '@/components/features/community/sub-communities-rail'
import { CommunitiesByCityRail } from '@/components/features/community/cities-rail'
import { RelatedCommunitiesRail } from '@/components/features/community/related-communities-rail'
import { CommunityOrganiserCtaPanel } from '@/components/features/community/community-organiser-cta'
import { AllEventsGridByCommunity } from '@/components/features/community/events-by-community-grid'
import type { CommunityContent } from '@/lib/communities/data'
import type { EventCardData } from '@/components/features/events/event-card'

interface Props {
  community: CommunityContent
  heroImage: string | null
  liveEvents: EventCardData[]
  /** Map of sub-community slug → Pexels landscape URL (null when not available). */
  subCommunityImages: Record<string, string | null>
  /** Map of city slug → Pexels portrait URL (null when not available). */
  cityImages: Record<string, string | null>
  /** Map of city slug → city name (the rail prop expects names). */
  cityCtaImage: string | null
  /** Map of related community slug → Pexels landscape URL (null when not available). */
  relatedCommunityImages: Record<string, string | null>
}

/**
 * CommunityLandingPage - the /community/[slug] template.
 *
 * Section order (light surface → alt → light → dark CTA closer):
 *   1. PhotographicCommunityHero (image band + light surface below)
 *   2. Story / Why this community (Prose intro)
 *   3. SubCommunitiesRail (alt surface, top border)
 *   4. CommunitiesByCityRail (light surface)
 *   5. AllEventsGridByCommunity (light surface, top border)
 *   6. RelatedCommunitiesRail (alt surface, top border)
 *   7. CommunityOrganiserCtaPanel (dark closer)
 */
export function CommunityLandingPage({
  community,
  heroImage,
  liveEvents,
  subCommunityImages,
  cityImages,
  cityCtaImage,
  relatedCommunityImages,
}: Props) {
  return (
    <PageShell>
      <PhotographicCommunityHero
        eyebrow={community.displayName.toUpperCase()}
        title={community.heroHeadline}
        subtitle={community.heroBody}
        imageSrc={heroImage}
      />

      <ContentSection surface="base" width="default" reveal>
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Why {community.displayName} on EventLinqs
          </p>
          <Prose>
            <h2 id="story">{community.tagline}</h2>
            {community.storyParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Prose>
        </div>
      </ContentSection>

      <SubCommunitiesRail
        communitySlug={community.slug}
        communityName={community.displayName}
        subCommunities={community.subCommunities}
        images={subCommunityImages}
      />

      <CommunitiesByCityRail
        communitySlug={community.slug}
        communityName={community.displayName}
        cities={community.cities}
        images={cityImages}
      />

      <AllEventsGridByCommunity
        communitySlug={community.slug}
        communityName={community.displayName}
        communityTagline={community.tagline}
        events={liveEvents}
      />

      <RelatedCommunitiesRail
        related={community.relatedCommunities}
        images={relatedCommunityImages}
      />

      <CommunityOrganiserCtaPanel
        communitySlug={community.slug}
        communityName={community.displayName}
        organiserPersonas={community.organiserPersonas}
        backdropImage={cityCtaImage}
      />
    </PageShell>
  )
}
