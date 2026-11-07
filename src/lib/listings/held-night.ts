/**
 * A HELD TITLE STAYS HELD AS ITS DATES ROLL ON (7 November 2026). A night hold (the resolver's, the CONTROLLER's 10:50
 * and 15:20: a start, venue or session in doubt holds the night) is written on each dated night, and the hourly occurrence
 * run makes the next date of a weekly series as the window moves. Without this the new date was born public, so a held
 * title grew a public night every week. With it, a new date of a series with an open night hold is born private and
 * carries its own hold row; releasing the series' holds (a read official page) is what makes its nights public again.
 * Pure.
 */
export type OpenNightHold = { field: string; reason: string } | null

export function bornVisibility(hold: OpenNightHold): 'private' | 'public' {
  return hold ? 'private' : 'public'
}

export function holdRowFor(eventId: string, seriesId: string, hold: NonNullable<OpenNightHold>) {
  return { event_id: eventId, series_id: seriesId, field: hold.field, scope: 'night' as const, reason: hold.reason, readings: [] as never[] }
}
