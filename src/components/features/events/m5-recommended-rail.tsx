import type { PublicEventRow } from '@/lib/events/types'

type Props = {
  events: PublicEventRow[]
  headline: 'recommended' | 'popular' | null
}

/**
 * Step 2 placeholder for the recommended-for-you rail. Real data + styling
 * land in Step 7 of M5 Phase 1 — this renders a typed stub so the page
 * shape is correct and the data path compiles end-to-end.
 */
export function RecommendedRail({ events, headline }: Props) {
  if (headline === null || events.length === 0) return null

  const title = headline === 'recommended' ? 'Recommended for you' : 'Popular this week'

  return (
    <section aria-labelledby="m5-rec-heading" className="border-b border-ink-100 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 id="m5-rec-heading" className="font-display text-lg font-bold text-ink-900 sm:text-xl">
            {title}
          </h2>
          <span className="text-xs text-ink-400">{events.length} events · placeholder (Step 7)</span>
        </div>
        <ul className="mt-3 -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {events.map(e => (
            <li
              key={e.id}
              className="w-60 shrink-0 rounded-lg border border-ink-100 bg-white p-3"
            >
              <p className="truncate text-sm font-semibold text-ink-900">{e.title}</p>
              <p className="mt-1 truncate text-xs text-ink-400">{e.venue_city ?? '—'}</p>
              <p className="mt-1 text-xs text-ink-400">
                {new Date(e.start_date).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
