import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ContentSection } from '@/components/layout/ContentSection'
import { getCulture, type CultureSlug } from '@/lib/cultures/data'

interface Props {
  related: CultureSlug[]
}

/**
 * RelatedCulturesRail - cross-discovery between culture pages.
 *
 * Each tile is a card with the culture display name + tagline that
 * links to its /culture/[slug] page. Helps users wander between
 * adjacent cultures (African ↔ Caribbean ↔ Gospel) instead of
 * dead-ending on a single page.
 */
export function RelatedCulturesRail({ related }: Props) {
  const items = related.map(slug => getCulture(slug)).filter((x): x is NonNullable<typeof x> => x !== null)
  if (items.length === 0) return null
  return (
    <ContentSection surface="alt" width="default" topBorder>
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          Adjacent scenes
        </p>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          You might also like
        </h2>
      </div>
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map(culture => (
          <li key={culture.slug}>
            <Link
              href={`/culture/${culture.slug}`}
              className="group flex h-full flex-col rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-md"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                {culture.tier === 1 ? 'Culture' : 'Cross-cultural'}
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold text-[var(--text-primary)] sm:text-xl">
                {culture.displayName}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {culture.tagline}
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-accent)] group-hover:text-[var(--brand-accent-hover)]">
                Explore {culture.displayName}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </ContentSection>
  )
}
