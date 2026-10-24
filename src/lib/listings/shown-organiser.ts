/**
 * WHO A PAGE NAMES AS AN EVENT'S ORGANISER (WI2, ruling A of 23 October 2026:
 * "the listings organisation is Lawal's and is never shown ... every artefact of
 * an EventLinqs listing names its host").
 *
 * An organiser's own event names its organisation, links its page and can be
 * followed. An EventLinqs listing (events.listing_source 'eventlinqs', written by
 * the city listings import) is held by the listings organisation until its host
 * claims it, and that organisation is shown NOWHERE: not on a card, not on the
 * event page, not in the structured data, not as an organiser page or a sitemap
 * entry. The listing names its HOST, the venue whose night it is, with no
 * organiser page to link and no organiser to follow (a claimed host gets those
 * in WI2 Part 3). artefactOrganiser (src/lib/broadcast/artefact-organiser.ts)
 * holds the same rule for the Launch Kit's artefacts.
 *
 * A leaf, so every rule here is tested without a database.
 */

/** The organisation that holds EventLinqs listings (scripts/ops/make-listings-organisation.mjs). */
export const LISTINGS_ORGANISATION_SLUG = 'eventlinqs-listings'

export function isEventLinqsListing(event: { listing_source?: string | null } | null | undefined): boolean {
  return event?.listing_source === 'eventlinqs'
}

/** Whether an organisation is the listings organisation, by its slug. */
export function isListingsOrganisation(slug: string | null | undefined): boolean {
  return slug === LISTINGS_ORGANISATION_SLUG
}

export type ShownOrganiser = {
  /** The name a reader sees. */
  name: string
  /** The organiser page's slug, or null when there is no organiser page to link. */
  slug: string | null
  shortName: string | null
  website: string | null
  instagram: string | null
  /** Whether a Follow button for this organiser belongs on the page. */
  followable: boolean
}

export function shownOrganiser(
  event: { listing_source?: string | null; venue_name?: string | null },
  organisation: {
    name?: string | null
    slug?: string | null
    short_name?: string | null
    website?: string | null
    instagram_handle?: string | null
  } | null,
): ShownOrganiser {
  if (isEventLinqsListing(event) || isListingsOrganisation(organisation?.slug)) {
    return {
      name: event.venue_name?.trim() || 'The venue',
      slug: null,
      shortName: null,
      website: null,
      instagram: null,
      followable: false,
    }
  }
  return {
    name: organisation?.name?.trim() || 'the organiser',
    slug: organisation?.slug ?? null,
    shortName: organisation?.short_name ?? null,
    website: organisation?.website ?? null,
    instagram: organisation?.instagram_handle ?? null,
    followable: Boolean(organisation),
  }
}
