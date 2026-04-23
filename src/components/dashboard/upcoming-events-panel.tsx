import Link from 'next/link'
import { Calendar, MapPin, PlusCircle } from 'lucide-react'

export type UpcomingEvent = {
  id: string
  slug: string
  title: string
  start_date: string
  venue_city: string | null
  cover_image_url: string | null
  timezone: string
  ticketsSold: number
  ticketsCapacity: number
}

function formatDate(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export function UpcomingEventsPanel({ events }: { events: UpcomingEvent[] }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">Upcoming events</h2>
        {events.length > 0 && (
          <Link
            href="/dashboard/events"
            className="text-sm font-medium text-ink-600 transition-colors hover:text-gold-600"
          >
            View all
          </Link>
        )}
      </header>

      {events.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-ink-100">
          {events.map((event) => {
            const pct =
              event.ticketsCapacity > 0
                ? Math.min(100, Math.round((event.ticketsSold / event.ticketsCapacity) * 100))
                : 0

            return (
              <li key={event.id}>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="block px-5 py-4 transition-colors hover:bg-ink-100/60"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                      {event.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={event.cover_image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-ink-400">
                          <Calendar className="h-5 w-5" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{event.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-600">
                        <span>{formatDate(event.start_date, event.timezone)}</span>
                        {event.venue_city && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {event.venue_city}
                            </span>
                          </>
                        )}
                      </p>

                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-gold-500 transition-all"
                            style={{ width: `${pct}%` }}
                            role="progressbar"
                            aria-valuenow={event.ticketsSold}
                            aria-valuemin={0}
                            aria-valuemax={event.ticketsCapacity}
                            aria-label={`${pct}% of tickets sold`}
                          />
                        </div>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-600">
                          {event.ticketsSold}/{event.ticketsCapacity || ':'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function EmptyState() {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
        <Calendar className="h-6 w-6 text-gold-600" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-semibold text-ink-900">No upcoming events yet</p>
      <p className="mt-1 text-xs text-ink-600">
        Host your first event and start selling tickets in minutes.
      </p>
      <Link
        href="/dashboard/events/create"
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-gold-500"
      >
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        Create event
      </Link>
    </div>
  )
}
