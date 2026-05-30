import { EventCard, type EventCardData } from './event-card'

interface Props {
  events: EventCardData[]
  emptyMessage: string
}

/**
 * Simple responsive grid of EventCards for discovery listings (genre, sub-genre,
 * artist, follow feed). Unlike EventsGrid this takes already-projected
 * EventCardData and adds no infinite-scroll or filter chrome - token-only.
 */
export function EventCardGrid({ events, emptyMessage }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white px-6 py-12 text-center">
        <p className="text-sm text-ink-600">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((event, i) => (
        <li key={event.id}>
          <EventCard event={event} priority={i === 0} />
        </li>
      ))}
    </ul>
  )
}
