import { EventCardLandscape, EventCardSquare, EventCardFeature, type HomeCardEvent } from '@/components/features/home/cards'
import { getEventMedia } from '@/lib/images/event-media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { BentoEvent } from './event-bento-tile'
import { priceLabel } from '@/lib/events/price-label'

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
  return priceLabel(tiers ?? [])
}

export async function ThisWeekCard({
  event,
  variant = 'landscape',
}: {
  event: BentoEvent
  variant?: 'landscape' | 'square' | 'feature'
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
    const photo = await getCategoryPhoto(event.category?.slug ?? null, event.slug ?? event.title)
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
    // Feature cards default to priority=true (built for above-fold hero use).
    // Every homepage feature RAIL is below the fold, so force priority off
    // here - the hero owns LCP and these must not preload as critical.
    priority: variant === 'feature' ? false : undefined,
  }

  const cell =
    variant === 'feature'
      ? 'w-[300px] shrink-0 snap-start sm:w-[420px]'
      : variant === 'square'
        ? 'w-[180px] shrink-0 snap-start sm:w-[200px]'
        : 'w-[240px] shrink-0 snap-start sm:w-[280px]'

  return (
    <div className={cell}>
      {variant === 'feature' ? (
        <EventCardFeature event={card} />
      ) : variant === 'square' ? (
        <EventCardSquare event={card} />
      ) : (
        <EventCardLandscape event={card} />
      )}
    </div>
  )
}
