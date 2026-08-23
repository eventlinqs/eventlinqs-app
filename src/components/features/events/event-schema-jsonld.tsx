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
  /**
   * The confirmed lineup, in billing order, for the `performer` property.
   *
   * Google documents `performer` as recommended: "The participants performing
   * at the event, such as artists and comedians. Use a nested PerformingGroup
   * or Person, one for each performer."
   * (developers.google.com/search/docs/appearance/structured-data/event,
   * fetched 2026-08-23.)
   *
   * A production audit on 23 August 2026 found this property missing on 36 of
   * 36 event pages, while the event page was ALREADY loading the lineup to
   * render it visibly. The data was on the page and simply never reached the
   * markup, so every event we publish was leaving its richest recommended
   * property empty on a platform whose lead category is music.
   */
  performers?: { id: string; slug: string; name: string }[]
}

/**
 * Drops keys whose value is null, undefined, or an empty/whitespace string.
 *
 * WHY. The emitter used `?? ''` on every optional venue field, so an event with
 * no street address published `"streetAddress": ""` rather than omitting it. An
 * empty string is not "absent": it is a positive claim that the value is empty,
 * and validators read it as a malformed value rather than a missing optional
 * one. Omission is the honest encoding.
 */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = v
  }
  return out as Partial<T>
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

/**
 * Builds the JSON-LD payload. Exported as a PURE FUNCTION, separately from the
 * component, so the markup an event page will actually ship can be validated in
 * a unit test against Google's published required set rather than eyeballed or
 * grepped for in the source.
 *
 * tests/unit/seo/event-structured-data.test.ts runs the output of this function
 * through the same validator the production audit script uses
 * (scripts/verify/event-structured-data-audit.mjs), so the test and the audit
 * cannot drift into disagreeing about what "valid" means.
 */
export function buildEventSchemaPayload({
  event,
  organisation,
  ticketTiers,
  state,
  baseUrl,
  performers = [],
}: EventSchemaProps & { event: Event & { category?: { slug: string | null; name: string } | null } }) {
  const eventUrl = `${baseUrl}/events/${event.slug}`

  /**
   * The date this event was originally scheduled for, when it has since been
   * moved to a new one. Read defensively because `previous_start_date` is added
   * by migration 20260823000002 and the generated database types trail it.
   *
   * A STILL-POSTPONED event is excluded on purpose: it has been moved off its
   * old date but has no new one, so `startDate` is not yet "the newly scheduled
   * start date" that Google requires alongside previousStartDate.
   */
  const rescheduledFromDate =
    state !== 'postponed' && state !== 'cancelled'
      ? (event as { previous_start_date?: string | null }).previous_start_date ?? null
      : null

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
        // validFrom was on the single-Offer branch only, so every event with
        // two or more tiers dropped it. Measured on production, 23 August
        // 2026: missing on 26 of 36 event pages, and every one of those 26 was
        // a multi-tier event. The property is recommended by Google and is the
        // same value either branch would use.
        validFrom: event.created_at,
      }
    : null

  const payload = {
    '@context': 'https://schema.org',
    '@type': schemaEventType(event.category?.slug),
    name: event.title,
    startDate: event.start_date,
    endDate: event.end_date,
    /*
     * RESCHEDULED, WITH ITS REQUIRED PARTNER PROPERTY.
     *
     * Google states the pairing as a hard requirement, not a suggestion: "If you
     * add previousStartDate, you must also add the eventStatus property and set
     * the eventStatus to EventRescheduled. Don't use other event statuses. For
     * rescheduled events, the startDate property must only be used for the newly
     * scheduled start date."
     * (developers.google.com/search/docs/appearance/structured-data/event,
     * fetched 2026-08-23)
     *
     * So the two are emitted from ONE expression rather than two independent
     * ones. Emitting either alone is a documented violation, and two separate
     * conditions are how they end up disagreeing.
     *
     * A still-postponed event is NOT rescheduled and correctly keeps
     * EventPostponed: it has no new date to point at yet.
     */
    ...(rescheduledFromDate
      ? {
          eventStatus: 'https://schema.org/EventRescheduled',
          previousStartDate: rescheduledFromDate,
        }
      : { eventStatus: schemaEventStatus(state) }),
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
          ...compact({ name: event.venue_name }),
          address: compact({
            '@type': 'PostalAddress',
            streetAddress: event.venue_address,
            addressLocality: event.venue_city,
            addressRegion: event.venue_state,
            addressCountry: event.venue_country ?? 'AU',
          }),
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
    // One node per performer, in billing order, each linking to its own artist
    // profile so the entity is resolvable rather than a bare string. Omitted
    // entirely when the lineup is empty: an empty array is a claim that nobody
    // is performing.
    ...(performers.length > 0
      ? {
          performer: performers.map(a => ({
            '@type': 'PerformingGroup',
            name: a.name,
            url: `${baseUrl}/artists/${a.slug}`,
          })),
        }
      : {}),
    offers: aggregateOffer ?? (offers.length > 0 ? offers[0] : undefined),
    ...(lowestPrice === 0 ? { isAccessibleForFree: true } : {}),
    url: eventUrl,
  }

  return payload
}

export function EventSchemaJsonLd(
  props: EventSchemaProps & { event: Event & { category?: { slug: string | null; name: string } | null } },
) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(buildEventSchemaPayload(props)) }}
    />
  )
}
