/**
 * A HELD TITLE STAYS HELD AS ITS DATES ROLL ON (7 November 2026). A night hold (the resolver's, the CONTROLLER's 10:50
 * and 15:20: a start, venue or session in doubt holds the night) is written on each dated night, and the hourly occurrence
 * run makes the next date of a weekly series as the window moves. Without this the new date was born public, so a held
 * title grew a public night every week. With it, a new date of a series with an open night hold is born private and
 * carries its own hold row; releasing the series' holds (a read official page) is what makes its nights public again.
 *
 * THE NEW NIGHT'S HOLD CARRIES ITS SERIES' NEXT ACTION (WINDOW 5A, 20 November 2026, the listings run's 'eight failed'):
 * every open hold names the next source the resolver reads and when (listing_holds_open_carries_its_next_action,
 * 20261107170001, written the same day as this file and later). The row here named neither, so the database refused it
 * and the run took the new night away again, every hour, for each held weekly series at its horizon date. The new hold
 * now copies its series' open hold whole: its state, next source, next check and the sources already tried, so the
 * resolver reads it on the series' own schedule. A series hold without a next action makes no night (fail closed; the
 * next run retries), never a row the database refuses.
 * Pure.
 */
export type OpenNightHold = {
  field: string
  reason: string
  state: string
  next_source: string | null
  next_check_at: string | null
  sources_tried: unknown[]
} | null

/** The columns the occurrence run reads from a series' open night hold, so its new night's hold can carry them. */
export const SERIES_HOLD_COLUMNS = 'field, reason, state, next_source, next_check_at, sources_tried'

export function bornVisibility(hold: object | null): 'private' | 'public' {
  return hold ? 'private' : 'public'
}

/** True when the hold names the next source the resolver reads and when, as every open hold must. */
export function holdCarriesItsNextAction(hold: NonNullable<OpenNightHold>): boolean {
  return typeof hold.next_source === 'string' && hold.next_source.length > 0 && typeof hold.next_check_at === 'string' && hold.next_check_at.length > 0
}

export function holdRowFor(eventId: string, seriesId: string, hold: NonNullable<OpenNightHold>) {
  return {
    event_id: eventId,
    series_id: seriesId,
    field: hold.field,
    scope: 'night' as const,
    reason: hold.reason,
    readings: [] as never[],
    state: hold.state,
    next_source: hold.next_source,
    next_check_at: hold.next_check_at,
    sources_tried: hold.sources_tried,
  }
}
