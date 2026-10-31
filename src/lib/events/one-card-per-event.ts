/**
 * ONE CARD PER EVENT PER PAGE (Lawal's ruling of 31 October 2026, 00:14: "never reused twice on the same platform"; the
 * photo system's P5). An event never appears twice on one page, whatever sections it qualifies for: the first section
 * that shows it keeps it. Sections are given in the order the page draws them; each takes up to its cap from the events
 * no earlier section showed, so a later rail fills its places from the events not yet shown instead of coming up short.
 *
 * A RECURRING SERIES IS ONE EVENT (P4): its first night shown is its one card, and every later night of it the page was
 * given is named on that card (also_on, by start), so no published night leaves the page; it is told, not drawn twice.
 */
export type SeriesNights = { readonly also_on?: string[] }

export function oneCardPerEvent<E extends { readonly id: string; readonly listing_series_id?: string | null; readonly start_date?: string }>(
  sections: readonly { readonly events: readonly E[]; readonly cap: number }[],
): (E & SeriesNights)[][] {
  const shownEvents = new Set<string>()
  const cardOfSeries = new Map<string, E & { also_on?: string[] }>()
  const out = sections.map(({ events, cap }) => {
    const kept: (E & SeriesNights)[] = []
    for (const e of events) {
      if (shownEvents.has(e.id)) continue
      const series = e.listing_series_id ?? null
      const card = series ? cardOfSeries.get(series) : undefined
      if (card) {
        // A later night of a series already on the page: named on its card, never drawn again.
        shownEvents.add(e.id)
        if (e.start_date) card.also_on = [...(card.also_on ?? []), e.start_date]
        continue
      }
      if (kept.length >= cap) continue
      shownEvents.add(e.id)
      if (series) {
        const first: E & { also_on?: string[] } = { ...e }
        cardOfSeries.set(series, first)
        kept.push(first)
      } else {
        kept.push(e)
      }
    }
    return kept
  })
  for (const card of cardOfSeries.values()) if (card.also_on) card.also_on.sort()
  return out
}

/**
 * A RAIL ABOVE A RESULTS LIST (/events, /events/browse/<city>): the list is the complete answer to the visitor's search
 * and keeps its count and its pages, so it is never thinned; the rail shows only what the list does not already draw,
 * a recurring series counting as one event (P4). With nothing left the rail draws as the founder ruled on 26 August 2026.
 */
export function notAlreadyListed<E extends { readonly id: string; readonly listing_series_id?: string | null }>(
  rail: readonly E[],
  listed: readonly { readonly id: string; readonly listing_series_id?: string | null }[],
): E[] {
  const ids = new Set(listed.map((l) => l.id))
  const series = new Set(listed.flatMap((l) => (l.listing_series_id ? [l.listing_series_id] : [])))
  return rail.filter((e) => !ids.has(e.id) && !(e.listing_series_id && series.has(e.listing_series_id)))
}
