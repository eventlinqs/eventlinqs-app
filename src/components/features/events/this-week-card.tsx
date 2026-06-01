import { EventCardLandscape, EventCardSquare, type HomeCardEvent } from '@/components/features/home/cards'
import { getEventMedia } from '@/lib/images/event-media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { BentoEvent } from './event-bento-tile'

/**
 * ThisWeekCard - the shared rail card used across the homepage rails.
 *
 * It resolves event media on the server, maps the event onto the
 * presentational HomeCardEvent shape, and renders the new separated card
 * family inside a fixed-width, snap-start rail cell.
 *
 *   variant 'landscape' (default) - standard rails.
 *   variant 'square'              - genre and trending rails (compact tile).
 *
 * No branded placeholder: a missing cover falls back to a real category
 * stock photo (getCategoryPhoto), so the image is always real photography.
 * The card itself never paints text on the image - details sit below it.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatPrice(tiers: BentoEvent['ticket_tiers']): string {
  if (!tiers || tiers.length === 0) return 'Free'
  const cheapest = tiers.reduce((m, t) => (t.price < m.price ? t : m), tiers[0])
  if (cheapest.price === 0) return 'Free'
  const dollars = cheapest.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${cheapest.currency ?? 'AUD'} ${formatted}`
}

export async function ThisWeekCard({
  event,
  variant = 'landscape',
}: {
  event: BentoEvent
  variant?: 'landscape' | 'square'
}) {
  const media = await getEventMedia(event)

  let imageSrc: string | null = null
  let imageAlt = event.title ?? 'Event'
  if (media.kind === 'video') {
    imageSrc = media.poster
  } else if (media.kind === 'carousel') {
    imageSrc = media.images[0] ?? null
    imageAlt = media.alts[0] ?? imageAlt
  } else if (media.kind === 'still-kenburns') {
    imageSrc = media.src
    imageAlt = media.alt ?? imageAlt
  }
  if (!imageSrc) {
    const photo = await getCategoryPhoto(event.category?.slug ?? null)
    imageSrc = photo.src
    imageAlt = photo.alt ?? imageAlt
  }

  const card: HomeCardEvent = {
    href: `/events/${event.slug}`,
    imageSrc,
    alt: imageAlt,
    label: event.category?.name ?? 'Event',
    title: event.title ?? 'Event',
    venue: event.venue_name ?? '',
    city: event.venue_city ?? '',
    dateLabel: formatDate(event.start_date),
    priceLabel: formatPrice(event.ticket_tiers ?? null),
  }

  const cell =
    variant === 'square'
      ? 'w-[180px] shrink-0 snap-start sm:w-[200px]'
      : 'w-[240px] shrink-0 snap-start sm:w-[280px]'

  return (
    <div className={cell}>
      {variant === 'square' ? <EventCardSquare event={card} /> : <EventCardLandscape event={card} />}
    </div>
  )
}
