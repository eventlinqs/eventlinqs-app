import type { EventCardData } from '@/components/features/events/event-card'
import type { PublicEventRow } from './types'

// Batch 4: previous Pexels-collision fallback removed.
// Public-surface fetchers now drop events without a real organiser cover
// (see hasRealCover() in fetchers.ts), so by the time a row reaches the
// projection it carries the organiser's actual image. The projection is
// a pure pass-through that exists only to flatten the row shape into the
// EventCard contract.

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

export async function projectToCardData(events: PublicEventRow[]): Promise<EventCardData[]> {
  return events.map(toCardData)
}
