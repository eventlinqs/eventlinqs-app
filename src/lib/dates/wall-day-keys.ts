/**
 * WALL-DAY KEYS ('YYYY-MM-DD'), already in the city's own zone, as the directory rows carry them. Pure string-to-string
 * steps: no clock and no zone are read here, so the server's UTC never moves a day. Which days count as which part of the
 * week stays with the shared definition in src/lib/events/listing-window.ts; this file only counts calendar days.
 */
export function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The same wall day n months on, clamped to the month's last day (31 January plus one month is 28 or 29 February). */
export function addMonthsKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return first.toISOString().slice(0, 10)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The name of a wall day ('Saturday'). */
export function dayNameOfKey(key: string): string {
  return DAY_NAMES[new Date(`${key}T00:00:00Z`).getUTCDay()]
}
