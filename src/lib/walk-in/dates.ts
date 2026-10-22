/**
 * The calendar dates of a walk-in event, in its own zone (WI1).
 *
 * A leaf with no imports, because the organiser form (a client component) needs
 * these and src/lib/walk-in/guide.ts carries zod, which must not reach the
 * dashboard's first load for two date helpers. guide.ts re-exports both, so
 * there is one definition.
 */

/** The local calendar date of an instant in a zone, as "YYYY-MM-DD". */
export function localDate(iso: string, timezone: string): string | null {
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const get = (t: string) => parts.find((p) => p.type === t)?.value
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return null
  }
}

/**
 * Every calendar date from the event's start to its end, in its own zone. The
 * form offers these as the days to fill in; the organiser may drop a tail day
 * that is only the small hours of the night before.
 */
export function spanDates(startsAt: string, endsAt: string, timezone: string): string[] {
  const first = localDate(startsAt, timezone)
  const last = localDate(endsAt, timezone)
  if (!first || !last || last < first) return first ? [first] : []
  const out: string[] = []
  const cursor = new Date(`${first}T00:00:00Z`)
  const stop = new Date(`${last}T00:00:00Z`)
  while (cursor.getTime() <= stop.getTime() && out.length < 31) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}
