/**
 * THE END SOMEONE STATED, OR NONE (6 November 2026).
 *
 * public.events.end_date is NOT NULL, so every night has one, but not every end was stated. An organiser enters their
 * own event's end. A listing night's end is its series' ends_at (public.event_series), and when the series states none
 * (every hunted night: the venue's page gave a start only) the occurrence run fills end_date with the next midnight, so
 * the night leaves every list at its end (law 16). That midnight is the platform's housekeeping, never a fact: it was
 * printed as 'Ends Friday 13 November 2026 at 12:00 am AEDT' (Benson Boone, www) and sent to Google as endDate on all
 * 143 hunted one-off nights. Google: "Don't indicate the time if you don't know the time"
 * (developers.google.com/search/docs/appearance/structured-data/event, read 6 November 2026).
 *
 * So the page, the calendar link and the structured data take the end from here: the end_date when it was stated, null
 * when it was not. A listing night whose series cannot be read shows none, because an end never shown is never false.
 * Pure. The guard: tests/unit/events/stated-end.test.ts.
 */
export type EndSource = {
  end_date: string | null
  listing_series_id?: string | null
  listing_series?: { ends_at: string | null } | null
}

export function statedEnd(e: EndSource): string | null {
  if (!e.end_date) return null
  if (!e.listing_series_id) return e.end_date
  return e.listing_series?.ends_at ? e.end_date : null
}
