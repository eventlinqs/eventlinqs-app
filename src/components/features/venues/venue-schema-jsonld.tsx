/**
 * Schema.org Place JSON-LD for /venues/[handle] (Batch 8.3).
 *
 * Place + PostalAddress + GeoCoordinates + maximumAttendeeCapacity +
 * embedded upcoming Event array. Per the brief this is the SEO launch
 * blocker for venue profile pages.
 */

import type { VenueProfile } from '@/lib/venues/resolver'

interface UpcomingEventLite {
  slug: string
  title: string
  startDate: string
  endDate: string
  organizerName: string
  organizerSlug: string
  coverImageUrl: string | null
}

interface Props {
  venue: VenueProfile
  upcomingEvents: UpcomingEventLite[]
  baseUrl: string
}

export function VenueSchemaJsonLd({ venue, upcomingEvents, baseUrl }: Props) {
  const venueUrl = `${baseUrl}/venues/${venue.handle}`

  const events = upcomingEvents.slice(0, 12).map(e => ({
    '@type': 'Event',
    name: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    url: `${baseUrl}/events/${e.slug}`,
    image: e.coverImageUrl ? [e.coverImageUrl] : undefined,
    location: {
      '@type': 'Place',
      name: venue.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: venue.address ?? undefined,
        addressLocality: venue.city ?? undefined,
        addressRegion: venue.state ?? undefined,
        postalCode: venue.postalCode ?? undefined,
        addressCountry: venue.country ?? 'AU',
      },
    },
    /*
     * NO ORGANISER NODE RATHER THAN AN EMPTY ONE.
     *
     * The page reads `e.organisation?.name ?? ''`, so an event whose
     * organisation join comes back null published
     * `organizer: { "@type": "Organization", "name": "" }` and a url of
     * /organisers/ with nothing after it. Found on 8 September 2026 by
     * scripts/verify/structured-data-validate.mjs (close-out C19.4, "validate
     * it, do not assume it"). A named node with no name is a claim about a
     * publisher we cannot make, and it is worse than saying nothing.
     */
    ...(e.organizerName && e.organizerSlug
      ? {
          organizer: {
            '@type': 'Organization',
            name: e.organizerName,
            url: `${baseUrl}/organisers/${e.organizerSlug}`,
          },
        }
      : {}),
  }))

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
    event: events.length > 0 ? events : undefined,
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
