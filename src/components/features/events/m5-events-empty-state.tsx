import Link from 'next/link'
import { SearchX } from 'lucide-react'

export function EventsEmptyState({ query }: { query?: string }) {
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
