import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ScopeResult } from '@/lib/events/search-scopes'
import type { SearchTab } from '@/lib/events/url-filters'

/**
 * Both forms are spelled out. Stripping a trailing "s" produces "citie" and
 * "communitie", which is exactly the kind of almost-right copy Law 1 exists to
 * stop, and it is invisible until a search happens to return precisely one
 * result.
 */
const SCOPE_LABEL: Record<Exclude<SearchTab, 'events'>, { one: string; many: string; index: string }> = {
  communities: { one: 'community', many: 'communities', index: '/communities' },
  cities: { one: 'city', many: 'cities', index: '/cities' },
  organisers: { one: 'organiser', many: 'organisers', index: '/organisers' },
}

/**
 * Results for the three header-search tabs that are not events.
 *
 * The tabs routed to /events and /events answered with events, so searching
 * "Melbourne" under Cities returned events with Melbourne in the title and no
 * cities at all. Each result here is a whole-tile link to the real landing page
 * (Law 5 and the interactive-affordance law: the entire card is the touch
 * target, never a bare label beside a link), and the empty state names what was
 * searched and offers the one move that always works rather than a dead end.
 */
export function SearchScopeResults({
  tab,
  query,
  results,
}: {
  tab: Exclude<SearchTab, 'events'>
  query: string
  results: ScopeResult[]
}) {
  const label = SCOPE_LABEL[tab]
  const noun = results.length === 1 ? label.one : label.many

  return (
    <section aria-label={`${label.many} matching your search`} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          {label.many}
        </p>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {results.length > 0
            ? `${results.length} ${noun} matching "${query}"`
            : `No ${label.many} matching "${query}"`}
        </h2>
      </div>

      {results.length > 0 ? (
        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => (
            <li key={result.slug}>
              <Link
                href={result.href}
                className="group flex h-full min-h-[88px] items-start justify-between gap-3 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-[var(--text-primary)]">
                    {result.name}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--text-secondary)]">{result.meta}</span>
                </span>
                <ArrowRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent-strong)]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Nothing here yet under that name. Try a shorter search, or browse every {label.many} we
            list.
          </p>
          <Link
            href={label.index}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-navy-950)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-accent-strong)]"
          >
            Browse all {label.many}
          </Link>
        </div>
      )}
    </section>
  )
}
