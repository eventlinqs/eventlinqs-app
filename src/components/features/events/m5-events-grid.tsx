import Link from 'next/link'
import type { PublicEventRow } from '@/lib/events/types'

type Props = {
  events: PublicEventRow[]
}

/**
 * Step 2 placeholder grid. Renders a minimal typed card per event so we
 * can verify the fetcher output and URL-driven refetch. Full styling +
 * real EventCard integration lands in Step 5.
 */
export function EventsGrid({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white py-16 text-center">
        <p className="text-sm font-medium text-ink-900">No events match your filters.</p>
        <Link
          href="/events"
          className="mt-2 text-sm font-medium text-gold-500 hover:text-gold-600 hover:underline"
        >
          Clear filters
        </Link>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map(e => (
        <li key={e.id} className="rounded-xl border border-ink-100 bg-white p-4">
          <Link href={`/events/${e.slug}`} className="block">
            <p className="text-xs font-medium uppercase tracking-wide text-gold-500">
              {e.category?.name ?? 'Uncategorised'}
            </p>
            <p className="mt-1 truncate font-display text-base font-bold text-ink-900">
              {e.title}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {new Date(e.start_date).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {[e.venue_name, e.venue_city].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-ink-600">
                {e.is_free ? 'Free' : e.ticket_tiers.length > 0 ? `From ${e.ticket_tiers[0].currency} ${(Math.min(...e.ticket_tiers.map(t => t.price)) / 100).toFixed(2)}` : '—'}
              </span>
              {e.badge && (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
                  {e.badge.replace('_', ' ')}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
