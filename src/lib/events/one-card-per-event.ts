/**
 * ONE CARD PER EVENT PER PAGE (Lawal's ruling of 31 October 2026, 00:14: "never reused twice on the same platform"; the
 * photo system's P5). An event never appears twice on one page, whatever sections it qualifies for: the first section
 * that shows it keeps it. Sections are given in the order the page draws them; each takes up to its cap from the events
 * no earlier section showed, so a later rail fills its places from the events not yet shown instead of coming up short.
 *
 * A RECURRING SERIES IS ONE EVENT (P4): its first night shown is its one card, and every later night of it the page was
 * given is named on that card (also_on, by start), so no published night leaves the page; it is told, not drawn twice.
 *
 * ONE LISTING, ONE CARD (the CONTROLLER's 20:58 of 31 October 2026: 'The Melbourne Book Market' twice in one rail on
 * live). The import made a Saturday series and a Sunday series of one market, and split six listings so; a card stands
 * for the listing, so the same title at the same venue is one card whatever its series ids, and a series stays one card
 * when its nights' titles differ. Every key a night carries finds the same card.
 */
export type SeriesNights = { readonly also_on?: string[] }

type Listed = { readonly id: string; readonly listing_series_id?: string | null; readonly title?: string | null; readonly venue_name?: string | null }

/** The keys that make two nights one listing: its series, and its title at its venue. */
function listingKeys(e: Listed): string[] {
  const keys: string[] = []
  if (e.listing_series_id) keys.push(`series:${e.listing_series_id}`)
  const title = e.title?.trim().toLowerCase()
  const venue = e.venue_name?.trim().toLowerCase()
  if (title && venue) keys.push(`listing:${title}|${venue}`)
  return keys
}

export function oneCardPerEvent<E extends Listed & { readonly start_date?: string }>(
  sections: readonly { readonly events: readonly E[]; readonly cap: number }[],
): (E & SeriesNights)[][] {
  const shownEvents = new Set<string>()
  const cardOfListing = new Map<string, E & { also_on?: string[] }>()
  const cards = new Set<E & { also_on?: string[] }>()
  const out = sections.map(({ events, cap }) => {
    const kept: (E & SeriesNights)[] = []
    for (const e of events) {
      if (shownEvents.has(e.id)) continue
      const keys = listingKeys(e)
      const card = keys.map((k) => cardOfListing.get(k)).find(Boolean)
      if (card) {
        // A later night of a listing already on the page: named on its card, never drawn again.
        shownEvents.add(e.id)
        for (const k of keys) if (!cardOfListing.has(k)) cardOfListing.set(k, card)
        if (e.start_date) card.also_on = [...(card.also_on ?? []), e.start_date]
        continue
      }
      if (kept.length >= cap) continue
      shownEvents.add(e.id)
      if (keys.length > 0) {
        const first: E & { also_on?: string[] } = { ...e }
        for (const k of keys) cardOfListing.set(k, first)
        cards.add(first)
        kept.push(first)
      } else {
        kept.push(e)
      }
    }
    return kept
  })
  for (const card of cards) if (card.also_on) card.also_on.sort()
  return out
}

/**
 * A RAIL ABOVE A RESULTS LIST (/events, /events/browse/<city>): the list is the complete answer to the visitor's search
 * and keeps its count and its pages, so it is never thinned; the rail shows only what the list does not already draw,
 * a listing (its series, or its title at its venue) counting as one event. With nothing left the rail draws as the
 * founder ruled on 26 August 2026.
 */
export function notAlreadyListed<E extends Listed>(rail: readonly E[], listed: readonly Listed[]): E[] {
  const ids = new Set(listed.map((l) => l.id))
  const keys = new Set(listed.flatMap(listingKeys))
  return rail.filter((e) => !ids.has(e.id) && !listingKeys(e).some((k) => keys.has(k)))
}
