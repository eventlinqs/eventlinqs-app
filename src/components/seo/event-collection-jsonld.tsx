/**
 * Schema.org CollectionPage + ItemList for a page that LISTS events.
 *
 * WHY THIS EXISTS. A 23 August 2026 production audit of every page type found
 * two listing surfaces emitting no structured data at all:
 *
 *   /events/browse/[city]   21 URLs in the sitemap, 0 JSON-LD blocks
 *   /categories/[slug]      not in the sitemap either, 0 JSON-LD blocks
 *
 * Those are the surfaces that answer the head queries this platform lives on,
 * "comedy tickets", "what is on in Brisbane". Every other listing page already
 * emitted CollectionPage + ItemList (community, community-by-city, city), each
 * hand-rolled inline. Rather than hand-roll it a fourth and fifth time, this is
 * the one implementation, so a change to how we describe a list of events
 * happens once.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not emit a nested `Event` node per
 * item. Google is explicit that the event experience wants one event per page:
 *
 *   "Each event MUST have a unique URL (a leaf page) and markup on that URL.
 *    The event experience on Google only supports pages that focus on a single
 *    event. We recommend focusing on adding markup to your event posting pages
 *    instead of pages that list schedules or multiple events."
 *   https://developers.google.com/search/docs/appearance/structured-data/event
 *   (page last updated 2025-12-10 UTC, fetched 2026-08-23)
 *
 * So the ItemList carries POSITION, NAME and URL only, pointing at the leaf
 * event page that holds the real Event markup. Duplicating full Event nodes
 * onto a listing page is the documented way to get the markup discounted, not
 * a shortcut to more rich results.
 */

interface CollectionEvent {
  slug: string
  title: string
}

interface Props {
  /** Absolute URL of the listing page itself. */
  url: string
  /** Human-readable page title, for example "Comedy events in Australia". */
  name: string
  /** One-line description of what the collection holds. */
  description?: string
  /** The events shown, in the order the page shows them. */
  events: CollectionEvent[]
  /** Absolute site origin, used to build each event's leaf URL. */
  baseUrl: string
  /** How many items to list. Google needs a representative sample, not all. */
  limit?: number
}

export function EventCollectionJsonLd({
  url,
  name,
  description,
  events,
  baseUrl,
  limit = 12,
}: Props) {
  const listed = events.slice(0, limit)

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url,
    name,
    ...(description ? { description } : {}),
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      // The TOTAL the page holds, not the truncated sample, so the number is
      // not quietly wrong on a page showing more than `limit`.
      numberOfItems: events.length,
      itemListElement: listed.map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${baseUrl}/events/${e.slug}`,
        name: e.title,
      })),
    },
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
