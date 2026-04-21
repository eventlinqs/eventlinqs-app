import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { EventCardData } from '@/components/features/events/event-card'
import type { PublicEventRow } from './types'

// picsum.photos is a seed-script placeholder, not real imagery. When the
// stored cover is missing or still points at picsum, fall through to the
// category Pexels photo so the grid looks populated without ever
// overwriting a real organiser upload. Shared by the server-rendered
// initial grid and the infinite-scroll server action so both paths
// produce identical card shapes.
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

export async function projectToCardData(events: PublicEventRow[]): Promise<EventCardData[]> {
  return Promise.all(events.map(toCardData))
}
