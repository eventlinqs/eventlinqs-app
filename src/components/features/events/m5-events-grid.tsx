import Link from 'next/link'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { PublicEventRow } from '@/lib/events/types'
import { EventCard, type EventCardData } from './event-card'

type Props = {
  events: PublicEventRow[]
}

// Organiser uploads live on Supabase storage. picsum.photos is a seed-script
// artefact — it's a random-photo service, not real imagery. When the stored
// cover is missing or still points at picsum, fall through to the category
// Pexels photo so the grid looks populated without ever overwriting a real
// organiser upload.
function needsFallback(url: string | null): boolean {
  if (!url) return true
  return /^https:\/\/picsum\.photos\//i.test(url)
}

async function toCardData(e: PublicEventRow): Promise<EventCardData> {
  let cover = e.cover_image_url
  let thumb = e.thumbnail_url
  if (needsFallback(cover)) {
    const photo = await getCategoryPhoto(e.category?.slug)
    cover = photo.src
    if (needsFallback(thumb)) thumb = photo.thumb
  }

  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    cover_image_url: cover,
    thumbnail_url: thumb,
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

export async function EventsGrid({ events }: Props) {
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

  const cards = await Promise.all(events.map(toCardData))

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map(card => (
        <li key={card.id}>
          <EventCard event={card} />
        </li>
      ))}
    </ul>
  )
}
