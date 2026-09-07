import Link from 'next/link'
import { CalendarPlus, SearchX } from 'lucide-react'

/**
 * The /events grid with nothing to show. Three emptinesses, three sets of words
 * (close-out C17.6, 7 September 2026): driven on production with no upcoming
 * events, this said "No events match these filters" and offered "Clear filters"
 * when no filter was set, which is the wrong reading of a platform waiting for
 * its first listing. With no query and no filter the page now says so and offers
 * the two real next steps: put an event on, or explore by city.
 */
export function EventsEmptyState({ query, filtered = false }: { query?: string; filtered?: boolean }) {
  if (!query && !filtered) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-accent)]/15 text-[var(--brand-accent-strong)]">
          <CalendarPlus aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2 className="font-display text-lg font-bold text-ink-900">No events listed yet</h2>
        <p className="mt-1 max-w-sm text-pretty text-sm text-ink-500">
          EventLinqs is open right across Australia, so the first one here could be yours. Put your event on for free, or explore what is coming by city.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/organisers"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            Put on an event
          </Link>
          <Link
            href="/cities"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            Explore by city
          </Link>
        </div>
      </div>
    )
  }

  const heading = query ? `No results for "${query}"` : 'No events match these filters'
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <SearchX aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="font-display text-lg font-bold text-ink-900">
        {heading}
      </h2>
      <p className="mt-1 max-w-sm text-pretty text-sm text-ink-400">
        Try widening your search, picking a different date, or clearing a filter.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/events"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ink-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
        >
          Clear filters
        </Link>
        <Link
          href="/events"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
        >
          Browse all events
        </Link>
      </div>
    </div>
  )
}
