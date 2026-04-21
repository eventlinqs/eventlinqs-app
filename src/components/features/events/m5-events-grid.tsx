import Link from 'next/link'
import type { PublicEventRow } from '@/lib/events/types'
import { EventCard, type EventCardData } from './event-card'

type Props = {
  events: PublicEventRow[]
}

function toCardData(e: PublicEventRow): EventCardData {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    cover_image_url: e.cover_image_url,
    thumbnail_url: e.thumbnail_url,
    start_date: e.start_date,
    venue_name: e.venue_name,
    venue_city: e.venue_city,
    venue_country: e.venue_country,
    created_at: e.created_at,
    category: e.category
      ? { name: e.category.name, slug: e.category.slug }
      : null,
    ticket_tiers: e.ticket_tiers,
    is_free: e.is_free,
    organisation: e.organisation
      ? { name: e.organisation.name, slug: e.organisation.slug }
      : null,
    badge: e.badge,
  }
}

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
        <li key={e.id}>
          <EventCard event={toCardData(e)} />
        </li>
      ))}
    </ul>
  )
}
