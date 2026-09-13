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

import { stripMarkdown } from '@/lib/prose/markdown-subset'
import { JsonLd } from '@/components/seo/json-ld'
import { buildEventItemList } from '@/lib/seo/event-item-list'

/**
 * SLUG AND TITLE ONLY, and the narrowing is the control rather than tidiness.
 *
 * This type used to carry startDate, endDate, venueCity and coverImageUrl,
 * because the component built a nested `Event` node per upcoming event out of
 * them. Those nodes are gone (SEO1 v2, FAULT THREE: a page that lists events
 * must not carry Event markup for them), and the fields go with them so a later
 * edit cannot reach for data that is no longer here. The same reasoning, and
 * the same shape of fix, as PublicOrganisationSchemaFields below.
 */
interface UpcomingEventLite {
  slug: string
  title: string
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

  /*
   * THE UPCOMING EVENTS ARE A LIST, AND THEY USED TO BE TWELVE EVENT NODES.
   *
   * This component published `event: [ { "@type": "Event", ... } x12 ]` inside
   * the Organization payload. An organiser profile is a page that LISTS events,
   * and Google's event experience "only supports pages that focus on a single
   * event" (SEO1 v2, FAULT THREE; the citation is in
   * src/lib/seo/event-item-list.ts). Worse, each node was built from a
   * `venueCity` string, so it was a lower-quality duplicate of the leaf page's
   * markup, which is the documented way to have the good copy discounted.
   *
   * The ItemList says the same thing, points at the leaf pages that hold the
   * real Event markup, and carries no Event node.
   */
  const eventList = buildEventItemList({
    events: upcomingEvents,
    baseUrl,
    name: `Upcoming events by ${organisation.name}`,
    url: profileUrl,
  })

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: organisation.name,
    url: profileUrl,
    // Structured data is machine-read plain text. Markdown syntax in a
    // Schema.org description is syntax a search engine shows verbatim.
    description: stripMarkdown(organisation.description) || undefined,
    logo: organisation.logo_url ?? undefined,
    image: organisation.logo_url ?? undefined,
    // email and telephone are deliberately absent. Founder ruling 2026-08-08:
    // the public organisation fields are name, slug, description, logo and
    // website. Publishing contact details here put them in the page source and
    // in Google's structured-data index.
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  }

  return (
    <>
      <JsonLd payload={payload} />
      <JsonLd payload={eventList} />
    </>
  )
}
