/**
 * Schema.org Place JSON-LD for /venues/[handle] (Batch 8.3).
 *
 * Place + PostalAddress + GeoCoordinates + maximumAttendeeCapacity +
 * embedded upcoming Event array. Per the brief this is the SEO launch
 * blocker for venue profile pages.
 */

import type { VenueProfile } from '@/lib/venues/resolver'
import { JsonLd } from '@/components/seo/json-ld'
import { buildEventItemList } from '@/lib/seo/event-item-list'

/**
 * SLUG AND TITLE ONLY. See the comment on the ItemList below: the nested Event
 * nodes these fields fed are gone, and the fields go with them so a later edit
 * cannot rebuild them from data that is still lying about.
 */
interface UpcomingEventLite {
  slug: string
  title: string
}

interface Props {
  venue: VenueProfile
  upcomingEvents: UpcomingEventLite[]
  baseUrl: string
}

export function VenueSchemaJsonLd({ venue, upcomingEvents, baseUrl }: Props) {
  const venueUrl = `${baseUrl}/venues/${venue.handle}`

  /*
   * THE UPCOMING EVENTS ARE A LIST, AND THEY USED TO BE TWELVE EVENT NODES.
   *
   * This component published `event: [ { "@type": "Event", ... } x12 ]` inside
   * the Place payload. A venue profile is a page that LISTS events, and Google's
   * event experience "only supports pages that focus on a single event"
   * (SEO1 v2, FAULT THREE; the citation is in src/lib/seo/event-item-list.ts).
   *
   * The careful work that used to live here is not lost, it is obsolete: the
   * empty-organiser-node fix of 8 September 2026 (close-out C19.4) existed
   * because these nodes carried an `organizer`, and a list item carries none.
   * The leaf event page emits the organiser, from the row, and is the one place
   * that claim is now made.
   */
  const eventList = buildEventItemList({
    events: upcomingEvents,
    baseUrl,
    name: `Upcoming events at ${venue.name}`,
    url: venueUrl,
  })

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: venue.name,
    url: venueUrl,
    description: venue.description ?? undefined,
    image: venue.imageUrl ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: venue.address ?? undefined,
      addressLocality: venue.city ?? undefined,
      addressRegion: venue.state ?? undefined,
      postalCode: venue.postalCode ?? undefined,
      addressCountry: venue.country ?? 'AU',
    },
    geo: typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
      ? { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude }
      : undefined,
    maximumAttendeeCapacity: venue.capacity ?? undefined,
  }

  return (
    <>
      <JsonLd payload={payload} />
      <JsonLd payload={eventList} />
    </>
  )
}
