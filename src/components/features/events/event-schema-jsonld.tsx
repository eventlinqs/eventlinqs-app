/**
 * Schema.org Event JSON-LD for /events/[slug] (Batch 8.1).
 *
 * Renders the structured-data payload Google's rich-results pipeline
 * uses to surface event details directly in search (date, venue,
 * price, availability, organizer). Per the Batch 8.1 brief this is a
 * launch blocker - without it our event pages don't compete in
 * Google's event-rich-results carousel against Ticketmaster, DICE
 * and Eventbrite.
 *
 * The payload follows https://schema.org/Event with the recommended
 * sub-types (MusicEvent, ComedyEvent, etc.) when available, plus
 * Place + PostalAddress for venue, Organization for organizer, and
 * one Offer per available ticket tier with availability state.
 */

import type { Event, TicketTier, Organisation } from '@/types/database'

type EventStatus = 'upcoming' | 'sold-out' | 'cancelled' | 'postponed' | 'past'

interface EventSchemaProps {
  event: Event
  organisation: Pick<Organisation, 'name' | 'slug' | 'description'>
  ticketTiers: Pick<TicketTier, 'id' | 'name' | 'price' | 'currency'>[]
  state: EventStatus
  baseUrl: string
}

/** Map our event_type to a Schema.org sub-type when there's a clean match. */
function schemaEventType(eventCategorySlug: string | null | undefined): string {
  if (!eventCategorySlug) return 'Event'
  const slug = eventCategorySlug.toLowerCase()
  if (slug === 'music' || slug === 'concert') return 'MusicEvent'
  if (slug === 'comedy') return 'ComedyEvent'
  if (slug === 'theatre' || slug === 'theater') return 'TheaterEvent'
  if (slug === 'sport' || slug === 'sports') return 'SportsEvent'
  if (slug === 'festival') return 'Festival'
  if (slug === 'food-drink' || slug === 'food') return 'FoodEvent'
  return 'Event'
}

/** Map our event state to Schema.org eventStatus. */
function schemaEventStatus(state: EventStatus): string {
  switch (state) {
    case 'cancelled': return 'https://schema.org/EventCancelled'
    case 'postponed': return 'https://schema.org/EventPostponed'
    default: return 'https://schema.org/EventScheduled'
  }
}

/** Map per-tier availability. */
function schemaAvailability(state: EventStatus): string {
  if (state === 'sold-out') return 'https://schema.org/SoldOut'
  if (state === 'past') return 'https://schema.org/SoldOut'
  if (state === 'cancelled') return 'https://schema.org/SoldOut'
  return 'https://schema.org/InStock'
}

export function EventSchemaJsonLd({
  event,
  organisation,
  ticketTiers,
  state,
  baseUrl,
}: EventSchemaProps & { event: Event & { category?: { slug: string | null; name: string } | null } }) {
  const eventUrl = `${baseUrl}/events/${event.slug}`
  const sortedTiers = [...ticketTiers].sort((a, b) => a.price - b.price)
  const lowestPrice = sortedTiers.length > 0 ? sortedTiers[0].price / 100 : 0
  const currency = sortedTiers[0]?.currency ?? 'AUD'

  const offers = sortedTiers.map(tier => ({
    '@type': 'Offer',
    name: tier.name,
    price: (tier.price / 100).toFixed(2),
    priceCurrency: tier.currency ?? 'AUD',
    availability: schemaAvailability(state),
    url: eventUrl,
    validFrom: event.created_at,
  }))

  const aggregateOffer = sortedTiers.length > 1
    ? {
        '@type': 'AggregateOffer',
        priceCurrency: currency,
        lowPrice: (sortedTiers[0].price / 100).toFixed(2),
        highPrice: (sortedTiers[sortedTiers.length - 1].price / 100).toFixed(2),
        offerCount: sortedTiers.length,
        availability: schemaAvailability(state),
        url: eventUrl,
      }
    : null

  const payload = {
    '@context': 'https://schema.org',
    '@type': schemaEventType(event.category?.slug),
    name: event.title,
    startDate: event.start_date,
    endDate: event.end_date,
    eventStatus: schemaEventStatus(state),
    eventAttendanceMode: event.event_type === 'virtual'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : event.event_type === 'hybrid'
        ? 'https://schema.org/MixedEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
    location: event.event_type === 'virtual'
      ? {
          '@type': 'VirtualLocation',
          url: eventUrl,
        }
      : {
          '@type': 'Place',
          name: event.venue_name ?? '',
          address: {
            '@type': 'PostalAddress',
            streetAddress: event.venue_address ?? '',
            addressLocality: event.venue_city ?? '',
            addressRegion: event.venue_state ?? '',
            addressCountry: event.venue_country ?? 'AU',
          },
          ...(typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: event.venue_latitude,
                  longitude: event.venue_longitude,
                },
              }
            : {}),
        },
    image: event.cover_image_url ? [event.cover_image_url] : undefined,
    description: event.summary
      ?? (event.description ? event.description.replace(/<[^>]*>/g, '').slice(0, 500) : undefined),
    organizer: {
      '@type': 'Organization',
      name: organisation.name,
      url: `${baseUrl}/organisers/${organisation.slug}`,
    },
    offers: aggregateOffer ?? (offers.length > 0 ? offers[0] : undefined),
    ...(lowestPrice === 0 ? { isAccessibleForFree: true } : {}),
    url: eventUrl,
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
