/**
 * A LIST OF EVENTS DESCRIBED AS A LIST, NOT AS A PILE OF EVENTS.
 *
 * WHY THIS EXISTS, AND WHAT IT REPLACED.
 *
 * The organiser profile and the venue profile each emitted their upcoming
 * events as nested `Event` nodes inside their own payload:
 *
 *     { "@type": "Organization", ..., "event": [ { "@type": "Event", ... } x12 ] }
 *     { "@type": "Place",        ..., "event": [ { "@type": "Event", ... } x12 ] }
 *
 * That is Event markup on a page that lists events, and Google is explicit that
 * it does not want it:
 *
 *   "Each event MUST have a unique URL (a leaf page) and markup on that URL.
 *    The event experience on Google only supports pages that focus on a single
 *    event. We recommend focusing on adding markup to your event posting pages
 *    instead of pages that list schedules or multiple events."
 *   https://developers.google.com/search/docs/appearance/structured-data/event
 *   (fetched 2026-09-14, C:\dev\EVIDENCE\SEO1\google-event-docs-2026-09-14.html)
 *
 * SEO1 v2, FAULT THREE, states the same rule in the owner's words and is the
 * reason this module exists: "A page listing many events must not carry Event
 * markup for them."
 *
 * IT WAS ALSO EMITTING INVALID EVENTS, which is the part that makes this a
 * defect rather than a tidy-up. The organiser page built each node from a
 * `venueCity` string alone, so a twelve-event profile published twelve Event
 * nodes whose address carried a locality and a country and no street, and whose
 * `location` was omitted entirely when the city was null. Duplicating a
 * lower-quality copy of the leaf page's markup is the documented way to have the
 * good copy discounted.
 *
 * WHAT IS EMITTED INSTEAD. An `ItemList` of `ListItem`s carrying position, name
 * and the absolute URL of the leaf event page. It describes the same
 * relationship, points a crawler at the pages that DO hold Event markup, and
 * contains no Event node at all. It is the shape
 * src/components/seo/event-collection-jsonld.tsx already uses for every other
 * listing surface on the platform, so a reader meets one answer rather than two.
 *
 * A PURE MODULE, like src/lib/seo/event-schema.ts and for the same reason:
 * scripts/guards/event-structured-data.mjs loads it through the alias loader,
 * which strips types but does not transpile, so it may hold no JSX.
 */

export interface ListedEvent {
  slug: string
  title: string
}

/**
 * Builds the ItemList payload, or null when there is nothing to list.
 *
 * NULL RATHER THAN AN EMPTY LIST, and that is not a style choice either. On
 * 8 September 2026 `scripts/verify/structured-data-validate.mjs` found 488 of
 * 550 published URLs emitting `itemListElement: []` with `numberOfItems: 0`:
 * markup that says "here is a list of events" and then lists none. `<JsonLd>`
 * renders nothing for null, so a caller needs no condition of its own.
 */
export function buildEventItemList({
  events,
  baseUrl,
  name,
  url,
  limit = 12,
}: {
  events: ListedEvent[]
  baseUrl: string
  /** What the list is, for example "Upcoming events at The Corner Hotel". */
  name: string
  /** Absolute URL of the page the list appears on. */
  url: string
  limit?: number
}) {
  const listed = events.slice(0, limit)
  if (listed.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    // The TOTAL the page holds, not the truncated sample, so the number is not
    // quietly wrong on a profile showing more than `limit`.
    numberOfItems: events.length,
    itemListElement: listed.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.title,
      url: `${baseUrl}/events/${e.slug}`,
    })),
  }
}
