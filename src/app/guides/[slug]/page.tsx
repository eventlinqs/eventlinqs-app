import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Clock } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { GuideBody } from '@/components/guides/guide-body'
import { GuideCard } from '@/components/guides/guide-card'
import { buildGuideIndex } from '@/components/guides/guide-index'
import { GuideShotImage } from '@/components/media'
import { GUIDES, getGuide, getGuideCategory } from '@/lib/guides'
import { getGuideLiveValues } from '@/lib/guides/live-values'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return GUIDES.map(guide => ({ slug: guide.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return { title: 'Guide not found | EventLinqs' }
  return {
    title: `${guide.title} | EventLinqs guides`,
    description: guide.summary,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.summary,
      type: 'article',
      images: [{ url: guide.hero.src }],
    },
  }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  const category = getGuideCategory(guide.category)
  const live = await getGuideLiveValues()
  const index = buildGuideIndex()
  const related = guide.related
    .map(s => index.find(entry => entry.slug === s))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.summary,
    dateModified: guide.updated,
    author: { '@type': 'Organization', name: 'EventLinqs' },
    publisher: { '@type': 'Organization', name: 'EventLinqs' },
    mainEntityOfPage: `https://eventlinqs.com/guides/${guide.slug}`,
  }

  const updatedLabel = new Date(guide.updated).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }}
      />

      {/* Title block: light interior band, matching the platform page chrome. */}
      <section className="relative bg-[var(--surface-0)] pb-10 pt-12 md:pb-12 md:pt-16">
        <div className="mx-auto max-w-3xl px-4 md:px-6 lg:px-8">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <li>
                <Link href="/guides" className="font-semibold hover:text-[var(--text-primary)]">
                  Organiser guides
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-3 w-3" />
              </li>
              <li className="font-semibold text-[var(--brand-accent-strong)]">{category?.title}</li>
            </ol>
          </nav>

          <h1 className="mt-4 font-headline text-3xl font-extrabold leading-[1.08] tracking-[-0.015em] text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {guide.summary}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {guide.minutes} min read
            </span>
            <span>Checked against the live platform on {updatedLabel}</span>
          </p>
        </div>
      </section>

      {/* The lead screenshot: the screen this guide is about. */}
      <div className="mx-auto max-w-3xl px-4 md:px-6 lg:px-8">
        <figure className="overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-md">
          <div className="relative aspect-[16/10] w-full bg-[var(--surface-1)]">
            <GuideShotImage src={guide.hero.src} alt={guide.hero.alt} />
          </div>
          <figcaption className="border-t-2 border-gold-500 px-5 py-3">
            <span className="block text-sm leading-relaxed text-[var(--text-secondary)]">
              {guide.hero.caption}
            </span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Captured from the live platform
              {guide.hero.viewport ? ` at ${guide.hero.viewport}px` : ''}
            </span>
          </figcaption>
        </figure>
      </div>

      <ContentSection surface="base" width="prose">
        <GuideBody blocks={guide.blocks} live={live} />
      </ContentSection>

      {related.length > 0 && (
        <ContentSection surface="alt" width="wide" aria-labelledby="guide-related-heading">
          <div className="border-t border-ink-200 pt-5">
            <h2 id="guide-related-heading" className="type-rail-heading text-[var(--text-primary)]">
              Read next
            </h2>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map(entry => (
              <GuideCard key={entry.slug} guide={entry} />
            ))}
          </div>
        </ContentSection>
      )}

      <ContentSection surface="base" width="prose">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-6">
          <p className="font-display text-lg font-bold text-[var(--text-primary)]">
            Does this match what you are seeing?
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            These guides are checked against the running platform, and every screenshot on this page
            was taken from it. If a screen has moved since, tell us and we will correct the guide as
            well as help you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/guides"
              className="inline-flex h-11 items-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
            >
              All guides
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-11 items-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              Tell us what is different
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  )
}
