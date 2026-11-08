import { FREE_REGISTRATION_REQUIRED } from '@/lib/events/cta'

/**
 * NO SUBMISSION IS EVER MISSED, AND NONE GOES THROUGH LAWAL (the PM's ruling of 8 November 2026, 15:00, as Lawal's
 * rulings of 15:48 (2) and (6) changed it: no alert to Lawal, failures are the platform's and the window's to retry and
 * fix, logged in the state report). The rules, pure, read by /admin/today, the daily state email (through
 * /api/ops/state) and their tests:
 *
 *   live      self-listed and published, or accepted by hand and joined to the event it became;
 *   late      neither live nor refused an hour after it arrived (waiting, held, or accepted with no event).
 */

export const SUBMISSION_LIVE_WITHIN_MINUTES = 60

export type WatchedSubmission = {
  readonly status: string
  readonly created_at: string
  readonly published_event_id: string | null
}

export function isLive(s: Pick<WatchedSubmission, 'status' | 'published_event_id'>): boolean {
  return s.status === 'published' || (s.status === 'accepted' && s.published_event_id !== null)
}

export function isLate(s: WatchedSubmission, now: Date): boolean {
  if (isLive(s) || s.status === 'refused') return false
  return now.getTime() - Date.parse(s.created_at) > SUBMISSION_LIVE_WITHIN_MINUTES * 60_000
}

/** The PostgREST filter for "not live" (then the hour), shared by /admin/today and /api/ops/state. */
export const NOT_LIVE_FILTER = 'status.in.(waiting,held),and(status.eq.accepted,published_event_id.is.null)'

/** The price in Lawal's words; the free-with-registration wording is cta.ts's own. */
export function priceWords(entry: string, cents: number | null): string {
  if (entry === 'free') return 'Free'
  if (entry === 'free_registration') return FREE_REGISTRATION_REQUIRED
  return cents === null ? 'Paid (no price given)' : `From A$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** The event's start where it happens, e.g. "Saturday 5 December at 6:30 pm". */
export function whenWords(startsAt: string, timezone: string): string {
  return new Date(startsAt).toLocaleString('en-AU', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
}
