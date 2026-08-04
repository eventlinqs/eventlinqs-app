'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { GuideCard } from './guide-card'
import { filterGuideIndex, type GuideIndexEntry } from './guide-index'
import type { GuideCategory } from '@/lib/guides/types'

/**
 * The hub browser: search across every guide, or browse the taxonomy.
 *
 * Server-rendered from the `?q=` parameter and then instant on the client, so
 * the page works with no JavaScript (the form submits), works for a crawler
 * (results are in the HTML), and filters as you type once hydrated. The index
 * carries body prose, so a phrase written inside a guide finds it.
 */
export function GuidesBrowser({
  index,
  categories,
  initialQuery = '',
}: {
  index: GuideIndexEntry[]
  categories: GuideCategory[]
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const trimmed = query.trim()
  const results = useMemo(() => filterGuideIndex(index, query), [index, query])

  return (
    <div>
      <form
        method="get"
        action="/guides"
        role="search"
        onSubmit={e => e.preventDefault()}
        className="mx-auto max-w-2xl"
      >
        <label htmlFor="guide-search" className="sr-only">
          Search the organiser guides
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            id="guide-search"
            name="q"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search guides: seating, payouts, refunds, the door"
            autoComplete="off"
            className="h-12 w-full rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] pl-11 pr-11 text-sm text-[var(--text-primary)] shadow-sm placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          />
          {trimmed.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear the search"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      <p aria-live="polite" className="sr-only">
        {trimmed.length > 0
          ? `${results.length} ${results.length === 1 ? 'guide' : 'guides'} match ${trimmed}`
          : ''}
      </p>

      {trimmed.length > 0 ? (
        <div className="mt-10">
          <h2 className="type-rail-heading text-[var(--text-primary)]">
            {results.length} {results.length === 1 ? 'guide' : 'guides'} for &ldquo;{trimmed}&rdquo;
          </h2>
          {results.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--surface-2)] bg-[var(--surface-0)] px-6 py-10 text-center">
              <p className="font-display text-base font-bold text-[var(--text-primary)]">
                Nothing matches that yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
                Try a plainer word: seating, tiers, payout, refund, transfer, poster, scanner. Or
                clear the search and browse the categories below.
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-5 inline-flex h-11 items-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                Browse every guide
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(guide => (
                <GuideCard key={guide.slug} guide={guide} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-12 space-y-14">
          {categories.map(category => {
            const guides = index.filter(g => g.category === category.id)
            if (guides.length === 0) return null
            return (
              <section key={category.id} aria-labelledby={`guide-cat-${category.id}`}>
                <div className="border-t border-ink-200 pt-5">
                  <h2
                    id={`guide-cat-${category.id}`}
                    className="type-rail-heading text-[var(--text-primary)]"
                  >
                    {category.title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{category.blurb}</p>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {guides.map(guide => (
                    <GuideCard key={guide.slug} guide={guide} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
