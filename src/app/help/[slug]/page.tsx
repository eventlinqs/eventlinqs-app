import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { getHelpTopic, helpTopics } from '@/lib/help-content'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return helpTopics.map(t => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const topic = getHelpTopic(slug)
  if (!topic) return { title: 'Not Found — Help Centre — EventLinqs' }
  return {
    title: `${topic.title} — Help Centre — EventLinqs`,
    description: topic.description,
  }
}

export default async function HelpSlugPage({ params }: Props) {
  const { slug } = await params
  const topic = getHelpTopic(slug)

  if (!topic) notFound()

  return (
    <PageShell>
      <PageHero
        eyebrow="HELP CENTRE"
        title={topic.title}
        subtitle={topic.description}
      />

      <ContentSection surface="base" width="prose">
        <div className="space-y-3">
          {topic.articles.map((article, i) => (
            <details
              key={i}
              className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {article.q}
                </span>
                <svg
                  className="h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-[var(--surface-2)] px-6 pb-6 pt-4">
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {article.a}
                </p>
              </div>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-6 text-center">
          <p className="font-display text-base font-semibold text-[var(--text-primary)]">
            Still need help?
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Our team replies within 1 business day, Monday to Friday.
          </p>
          <a
            href="/contact"
            className="mt-4 inline-flex text-sm font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)] transition-colors"
          >
            Contact support &rsaquo;
          </a>
        </div>
      </ContentSection>
    </PageShell>
  )
}
