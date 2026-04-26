import type { ReactNode } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from './Prose'
import { InPageNav } from './InPageNav'

interface LegalSection {
  id: string
  title: string
}

interface LegalPageShellProps {
  title: string
  /** ISO date string or formatted date, e.g. "15 April 2026" */
  lastUpdated: string
  children: ReactNode
  /**
   * Section definitions for the sticky in-page nav (desktop only).
   * Each section corresponds to an <h2 id="..."> in the page content.
   * If omitted, no in-page nav is rendered.
   *
   * Example:
   *   sections={[
   *     { id: 'data-we-collect', title: 'Data We Collect' },
   *     { id: 'how-we-use-data', title: 'How We Use It' },
   *   ]}
   */
  sections?: LegalSection[]
}

/**
 * LegalPageShell - composed shell for Privacy / Terms / Refunds pages.
 *
 * Layout:
 *   PageShell
 *   └── PageHero (eyebrow="LEGAL", title, subtitle="Last updated...")
 *   └── ContentSection surface="base"
 *       └── [InPageNav (desktop sticky, lg:block)] + Prose content
 *
 * The in-page nav auto-highlights sections via IntersectionObserver.
 * Pass a `sections` array matching the h2 IDs in your content.
 */
export function LegalPageShell({
  title,
  lastUpdated,
  children,
  sections = [],
}: LegalPageShellProps) {
  return (
    <PageShell>
      <PageHero
        eyebrow="LEGAL"
        title={title}
        subtitle={`Last updated ${lastUpdated}`}
      />

      <ContentSection surface="base" width="wide">
        {sections.length > 0 ? (
          /* Two-column layout: content + sticky sidebar on lg+ */
          <div className="flex gap-16">
            {/* Main prose content */}
            <div className="min-w-0 flex-1">
              <Prose>{children}</Prose>
            </div>

            {/* Sticky in-page nav - hidden on mobile */}
            <InPageNav sections={sections} />
          </div>
        ) : (
          /* No sections: single-column prose */
          <div className="mx-auto max-w-3xl">
            <Prose>{children}</Prose>
          </div>
        )}
      </ContentSection>
    </PageShell>
  )
}
