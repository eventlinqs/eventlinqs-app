/**
 * Schema.org Organization JSON-LD for /organisers/[handle] (Batch 8.2).
 *
 * Renders the structured-data payload Google's organisation rich-results
 * pipeline reads to surface organiser identity (name, description, url,
 * logo, contact) and the upcoming events array. Per the Batch 8.2 brief
 * this is the SEO launch blocker for the organiser profile page.
 *
 * Schema.org/Organization is the base type; we use the simpler base
 * (vs PerformingGroup / EventOrganizer sub-types) because EventLinqs
 * organisers span community groups, promoters, venues and individual
 * artists - one common Organization payload is more accurate than
 * picking a wrong sub-type per organiser.
 */

import type { Organisation } from '@/types/database'

interface UpcomingEventLite {
  slug: string
  title: string
  startDate: string
  endDate: string
  venueCity: string | null
  coverImageUrl: string | null
}

interface Props {
  organisation: Organisation
  upcomingEvents: UpcomingEventLite[]
  baseUrl: string
}

export function OrganiserSchemaJsonLd({ organisation, upcomingEvents, baseUrl }: Props) {
  const profileUrl = `${baseUrl}/organisers/${organisation.slug}`

  const sameAs: string[] = []
  if (organisation.website) sameAs.push(organisation.website)
  // metadata can hold social URLs; skip until the M7 admin panel
  // surfaces a typed schema. We don't read raw record fields blindly.

  const events = upcomingEvents.slice(0, 12).map(e => ({
    '@type': 'Event',
    name: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    url: `${baseUrl}/events/${e.slug}`,
    image: e.coverImageUrl ? [e.coverImageUrl] : undefined,
    location: e.venueCity
      ? {
          '@type': 'Place',
          name: e.venueCity,
          address: { '@type': 'PostalAddress', addressLocality: e.venueCity, addressCountry: 'AU' },
        }
      : undefined,
    organizer: {
      '@type': 'Organization',
      name: organisation.name,
      url: profileUrl,
    },
  }))

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: organisation.name,
    url: profileUrl,
    description: organisation.description ?? undefined,
    logo: organisation.logo_url ?? undefined,
    image: organisation.logo_url ?? undefined,
    email: organisation.email ?? undefined,
    telephone: organisation.phone ?? undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
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
