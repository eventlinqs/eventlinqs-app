/**
 * WHO AN ARTEFACT NAMES AS THE ORGANISER (WI2, ruling A of 23 October 2026).
 *
 * An organiser's own event names the organisation, with its logo. An EventLinqs
 * listing (events.listing_source 'eventlinqs', made by the city listings import)
 * names its HOST, the venue whose night it is, and carries no logo: the
 * listings organisation that holds it until the host claims it is never shown
 * anywhere, on a page, a cover or a share card.
 *
 * A leaf, so the rule is tested without a database.
 */
export function artefactOrganiser(
  event: {
    listing_source?: string | null
    venue_name: string | null
    organisation: { name: string | null; logo_url: string | null } | null
  },
  fallbackName: string,
): { name: string; logoUrl: string | null } {
  if (event.listing_source === 'eventlinqs') {
    return { name: event.venue_name?.trim() || fallbackName, logoUrl: null }
  }
  return { name: event.organisation?.name ?? fallbackName, logoUrl: event.organisation?.logo_url ?? null }
}
