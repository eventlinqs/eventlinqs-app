import Link from 'next/link'
import { buildEventsUrl, type EventsSearchParams } from '@/lib/events/search-params'

type Props = {
  params: EventsSearchParams
  page: number
  totalPages: number
}

/**
 * Step 2 placeholder numbered pagination. Step 5 replaces this with the
 * full SEO + infinite-scroll pattern.
 */
export function EventsPagination({ params, page, totalPages }: Props) {
  if (totalPages <= 1) return null

  const pages = buildPageWindow(page, totalPages)
  const prev = page > 1 ? buildEventsUrl(params, { page: String(page - 1) }) : null
  const next = page < totalPages ? buildEventsUrl(params, { page: String(page + 1) }) : null

  return (
    <nav
      aria-label="Events pagination"
      className="mt-8 flex items-center justify-center gap-2"
    >
      {prev ? (
        <Link
          href={prev}
          rel="prev"
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
        >
          Previous
        </Link>
      ) : (
        <span className="rounded-md border border-ink-100 px-3 py-1.5 text-sm font-medium text-ink-400">
          Previous
        </span>
      )}

      {pages.map((p, i) =>
        p === null ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-1 text-sm text-ink-400"
          >
            …
          </span>
        ) : p === page ? (
          <span
            key={p}
            aria-current="page"
            className="rounded-md bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white"
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={buildEventsUrl(params, { page: p === 1 ? undefined : String(p) })}
            className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
          >
            {p}
          </Link>
        ),
      )}

      {next ? (
        <Link
          href={next}
          rel="next"
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
        >
          Next
        </Link>
      ) : (
        <span className="rounded-md border border-ink-100 px-3 py-1.5 text-sm font-medium text-ink-400">
          Next
        </span>
      )}
    </nav>
  )
}

function buildPageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push(null)
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total - 1) pages.push(null)
  pages.push(total)
  return pages
}
