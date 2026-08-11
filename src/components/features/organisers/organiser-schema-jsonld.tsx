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

interface UpcomingEventLite {
  slug: string
  title: string
  startDate: string
  endDate: string
  venueCity: string | null
  coverImageUrl: string | null
}

/**
 * The publicly publishable organisation fields, and ONLY those.
 *
 * Deliberately NOT `Organisation` from @/types/database. This component
 * serialises its input into JSON-LD in the page HTML, where it is read by
 * anyone viewing source AND actively harvested and republished by search
 * engines. Accepting the full row made it trivially easy to emit a column that
 * was never meant to be public, which is exactly what happened: this file used
 * to emit `email: organisation.email` and `telephone: organisation.phone`,
 * putting every organiser's contact details into structured data on a public,
 * indexable page (docs/security/AUDIT-2026-08-08.md CRITICAL-1, second vector).
 *
 * Narrowing the prop type is the control. A future edit cannot reach for
 * `organisation.email` here, because the type does not carry it.
 */
interface PublicOrganisationSchemaFields {
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  website: string | null
}

interface Props {
  organisation: PublicOrganisationSchemaFields
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
    // email and telephone are deliberately absent. Founder ruling 2026-08-08:
    // the public organisation fields are name, slug, description, logo and
    // website. Publishing contact details here put them in the page source and
    // in Google's structured-data index.
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
