import Link from 'next/link'
import { SearchX } from 'lucide-react'

export function EventsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <SearchX aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="font-display text-base font-semibold text-ink-900">
        No events match these filters
      </h2>
      <p className="mt-1 max-w-sm text-sm text-ink-400">
        Try widening your search, picking a different date, or clearing a filter.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/events"
          className="rounded-lg bg-ink-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
        >
          Clear filters
        </Link>
        <Link
          href="/events"
          className="rounded-lg border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100"
        >
          Browse all events
        </Link>
      </div>
    </div>
  )
}
