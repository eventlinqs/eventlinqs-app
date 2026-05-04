import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import type { SubCulture } from '@/lib/cultures/data'

interface Props {
  cultureSlug: string
  cultureName: string
  subCultures: SubCulture[]
}

/**
 * SubCulturesRail - 6 cross-genre tiles for a Tier 1 culture.
 *
 * Each tile links to /events?culture={cultureSlug}&sub={subSlug} so the
 * search surface can filter to that breakdown. Currently the search
 * surface ignores `sub` (no sub-culture column yet) but the link is
 * stable for future filtering and SEO crawl depth.
 */
export function SubCulturesRail({ cultureSlug, cultureName, subCultures }: Props) {
  if (subCultures.length === 0) return null
  return (
    <ContentSection surface="alt" width="default" topBorder>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Inside {cultureName}
          </p>
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Every sound, every scene
          </h2>
        </div>
      </div>
      <ul
        role="list"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6"
      >
        {subCultures.map((sc) => (
          <li key={sc.slug}>
            <Link
              href={`/events?culture=${cultureSlug}&sub=${sc.slug}`}
              className="group block rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-md"
            >
              <p className="font-display text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                {sc.label}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
                {sc.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </ContentSection>
  )
}
