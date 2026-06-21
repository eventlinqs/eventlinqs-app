import { CULTURAL_MOMENTS, type CommunityMoment } from './calendar'

/**
 * Returns the next `count` community moments whose end-date is on or after
 * today. Sort key: start-date ascending (so a moment that starts in 3
 * days outranks a moment that starts in 30 days even if both are in
 * progress).
 *
 * Server-only. Pure function over the static calendar; no DB hit.
 */
export function getMomentsAhead(count = 4, now: Date = new Date()): CommunityMoment[] {
  const today = now.toISOString().slice(0, 10)
  return CULTURAL_MOMENTS
    .filter(m => m.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, count)
}

/**
 * Format a moment date or date-range for display under a card.
 *   - Single day: "Sat 21 March"
 *   - Multi day:  "21-29 March" (within month) / "21 March - 5 April" (spans)
 */
export function formatMomentDates(m: CommunityMoment): string {
  const start = new Date(`${m.start}T00:00:00Z`)
  const end   = new Date(`${m.end}T00:00:00Z`)
  const monthLong = (d: Date) => d.toLocaleDateString('en-AU', { month: 'long', timeZone: 'UTC' })
  const day = (d: Date) => d.getUTCDate()
  const weekday = (d: Date) => d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })

  if (m.start === m.end) return `${weekday(start)} ${day(start)} ${monthLong(start)}`
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${day(start)} to ${day(end)} ${monthLong(start)}`
  }
  return `${day(start)} ${monthLong(start)} to ${day(end)} ${monthLong(end)}`
}
