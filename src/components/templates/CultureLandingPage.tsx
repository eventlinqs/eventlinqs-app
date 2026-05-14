import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { PhotographicCultureHero } from '@/components/templates/PhotographicCultureHero'
import { SubCulturesRail } from '@/components/features/culture/sub-cultures-rail'
import { CulturesByCityRail } from '@/components/features/culture/cities-rail'
import { RelatedCulturesRail } from '@/components/features/culture/related-cultures-rail'
import { CultureOrganiserCtaPanel } from '@/components/features/culture/culture-organiser-cta'
import { AllEventsGridByCulture } from '@/components/features/culture/events-by-culture-grid'
import type { CultureContent } from '@/lib/cultures/data'
import type { EventCardData } from '@/components/features/events/event-card'

interface Props {
  culture: CultureContent
  heroImage: string | null
  liveEvents: EventCardData[]
  /** Map of sub-culture slug → Pexels landscape URL (null when not available). */
  subCultureImages: Record<string, string | null>
  /** Map of city slug → Pexels portrait URL (null when not available). */
  cityImages: Record<string, string | null>
  /** Map of city slug → city name (the rail prop expects names). */
  cityCtaImage: string | null
  /** Map of related culture slug → Pexels landscape URL (null when not available). */
  relatedCultureImages: Record<string, string | null>
}

/**
 * CultureLandingPage - the /culture/[slug] template.
 *
 * Section order (light surface → alt → light → dark CTA closer):
 *   1. PhotographicCultureHero (image band + light surface below)
 *   2. Story / Why this culture (Prose intro)
 *   3. SubCulturesRail (alt surface, top border)
 *   4. CulturesByCityRail (light surface)
 *   5. AllEventsGridByCulture (light surface, top border)
 *   6. RelatedCulturesRail (alt surface, top border)
 *   7. CultureOrganiserCtaPanel (dark closer)
 */
export function CultureLandingPage({
  culture,
  heroImage,
  liveEvents,
  subCultureImages,
  cityImages,
  cityCtaImage,
  relatedCultureImages,
}: Props) {
  return (
    <PageShell>
      <PhotographicCultureHero
        eyebrow={culture.displayName.toUpperCase()}
        title={culture.heroHeadline}
        subtitle={culture.heroBody}
        imageSrc={heroImage}
      />

      <ContentSection surface="base" width="default">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Why {culture.displayName} on EventLinqs
          </p>
          <Prose>
            <h2 id="story">{culture.tagline}</h2>
            {culture.storyParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Prose>
        </div>
      </ContentSection>

      <SubCulturesRail
        cultureSlug={culture.slug}
        cultureName={culture.displayName}
        subCultures={culture.subCultures}
        images={subCultureImages}
      />

      <CulturesByCityRail
        cultureSlug={culture.slug}
        cultureName={culture.displayName}
        cities={culture.cities}
        images={cityImages}
      />

      <AllEventsGridByCulture
        cultureSlug={culture.slug}
        cultureName={culture.displayName}
        cultureTagline={culture.tagline}
        events={liveEvents}
      />

      <RelatedCulturesRail
        related={culture.relatedCultures}
        images={relatedCultureImages}
      />

      <CultureOrganiserCtaPanel
        cultureSlug={culture.slug}
        cultureName={culture.displayName}
        organiserPersonas={culture.organiserPersonas}
        backdropImage={cityCtaImage}
      />
    </PageShell>
  )
}
