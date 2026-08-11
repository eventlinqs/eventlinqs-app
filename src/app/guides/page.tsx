import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy, MessagesSquare } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { GuidesBrowser } from '@/components/guides/guides-browser'
import { buildGuideIndex } from '@/components/guides/guide-index'
import { getSiteUrl } from '@/lib/site-url'
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Organiser guides | EventLinqs',
  description:
    'Step-by-step guides for running events on EventLinqs: creating your first event, building a seating chart, mapping ticket tiers to seats, promoting it, getting paid, and running the door.',
  alternates: { canonical: '/guides' },
}

/**
 * The organiser guide hub.
 *
 * Evergreen documentation, not a blog: no dates in the URL, no reverse
 * chronology, no feed. Guides are grouped by the order the work actually
 * happens, every tile carries a real screenshot of the screen it teaches, and
 * search runs over the full body of every guide.
 *
 * The Help Centre (/help) stays what it is: short question-and-answer support
 * for buyers and organisers. This is the long-form teaching beside it, and the
 * two link to each other rather than competing.
 */
export default async function GuidesHubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const index = buildGuideIndex()

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'EventLinqs organiser guides',
    itemListElement: GUIDES.map((guide, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${getSiteUrl()}/guides/${guide.slug}`,
      name: guide.title,
    })),
  }

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <PageHero
        eyebrow="ORGANISER GUIDES"
        title="Run your event like you have done it a hundred times."
        subtitle="Written walkthroughs of every screen you will use, illustrated with the real platform, kept in step with what the product actually does."
        variant="premium"
      />

      <ContentSection surface="base" width="wide">
        <GuidesBrowser
          index={index}
          categories={GUIDE_CATEGORIES}
          initialQuery={typeof q === 'string' ? q : ''}
        />
      </ContentSection>

      <ContentSection surface="alt" width="default">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Link
            href="/help"
            className="group flex items-start gap-4 rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 shadow-md transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-1)]">
              <LifeBuoy className="h-5 w-5 text-[var(--brand-accent-strong)]" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display text-lg font-bold text-[var(--text-primary)]">
                Help Centre
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">
                Quick answers to specific questions about tickets, accounts and policies, plus an
                assistant that answers from the same knowledge.
              </span>
            </span>
          </Link>

          <Link
            href="/contact"
            className="group flex items-start gap-4 rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 shadow-md transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-1)]">
              <MessagesSquare className="h-5 w-5 text-[var(--brand-accent-strong)]" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display text-lg font-bold text-[var(--text-primary)]">
                Talk to our team
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">
                Something here not matching what you see on your screen? Tell us and we will fix the
                guide as well as your problem.
              </span>
            </span>
          </Link>
        </div>
      </ContentSection>
    </PageShell>
  )
}
