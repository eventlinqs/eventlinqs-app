import { FREE_REGISTRATION_REQUIRED } from '@/lib/events/cta'
import { SUBMISSION_ROLE_WORDS, type SubmissionRole } from './submission'

/**
 * NO SUBMISSION IS EVER MISSED AGAIN (the PM's ruling of 8 November 2026, 15:00, on Lawal's day: three organisers' events
 * sat accepted and text only for hours before anyone saw it). The rules, pure, read by the arrival alert, the hourly
 * backstop, /admin/today, the daily state email (through /api/ops/state) and their tests:
 *
 *   live      self-listed and published, or accepted by hand and joined to the event it became;
 *   late      neither live nor refused an hour after it arrived (waiting, held, or accepted with no event);
 *   told      a late one is raised to Lawal once, recorded in check_result.late_alert_at.
 */

export const SUBMISSION_LIVE_WITHIN_MINUTES = 60

export type WatchedSubmission = {
  readonly id: string
  readonly created_at: string
  readonly status: string
  readonly title: string
  readonly name: string
  readonly role: string
  readonly starts_at: string
  readonly city_slug: string
  readonly entry: string
  readonly price_from_cents: number | null
  readonly photo_path: string | null
  readonly published_event_id: string | null
  readonly held_because?: string | null
  readonly check_result: Record<string, unknown> | null
}

export function isLive(s: Pick<WatchedSubmission, 'status' | 'published_event_id'>): boolean {
  return s.status === 'published' || (s.status === 'accepted' && s.published_event_id !== null)
}

export function isLate(s: Pick<WatchedSubmission, 'status' | 'published_event_id' | 'created_at'>, now: Date): boolean {
  if (isLive(s) || s.status === 'refused') return false
  return now.getTime() - Date.parse(s.created_at) > SUBMISSION_LIVE_WITHIN_MINUTES * 60_000
}

export function lateAndNotYetTold(s: WatchedSubmission, now: Date): boolean {
  return isLate(s, now) && typeof s.check_result?.late_alert_at !== 'string'
}

/** The PostgREST filter for "late" (status, then the hour), shared by /admin/today and /api/ops/state. */
export const NOT_LIVE_FILTER = 'status.in.(waiting,held),and(status.eq.accepted,published_event_id.is.null)'

/** The price in Lawal's words; the free-with-registration wording is cta.ts's own. */
export function priceWords(entry: string, cents: number | null): string {
  if (entry === 'free') return 'Free'
  if (entry === 'free_registration') return FREE_REGISTRATION_REQUIRED
  return cents === null ? 'Paid (no price given)' : `From A$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** The event's start where it happens, e.g. "Saturday 5 December, 6:30 pm". */
export function whenWords(startsAt: string, timezone: string): string {
  return new Date(startsAt).toLocaleString('en-AU', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
}

function roleWords(role: string): string {
  return SUBMISSION_ROLE_WORDS[role as SubmissionRole] ?? role
}

/** The arrival alert: the event, its date, city, organiser, price, photo yes or no, and one link. */
export function arrivalEmail(
  s: WatchedSubmission,
  city: { readonly name: string; readonly timezone: string },
  link: string,
): { subject: string; text: string } {
  return {
    subject: `New organiser event sent in: ${s.title}`,
    text:
      `${s.title} was just sent in to EventLinqs.\n\n` +
      `When: ${whenWords(s.starts_at, city.timezone)}\nCity: ${city.name}\nOrganiser: ${s.name} (${roleWords(s.role)})\n` +
      `Price: ${priceWords(s.entry, s.price_from_cents)}\nPhoto: ${s.photo_path ? 'yes' : 'no'}\n\n` +
      `The self-listing checks run on it now; you hear again when it is live or held.\n\nSee it: ${link}`,
  }
}

/** The exception alert for one submission not live an hour after it arrived. */
export function lateEmail(s: WatchedSubmission, link: string, now: Date): { subject: string; text: string } {
  const minutes = Math.round((now.getTime() - Date.parse(s.created_at)) / 60_000)
  const state =
    s.status === 'held'
      ? `held: ${s.held_because ?? 'no reason recorded'}`
      : s.status === 'accepted'
        ? 'accepted, and not joined to a live event'
        : 'still waiting for its checks'
  return {
    subject: `Not live after an hour: ${s.title}`,
    text:
      `${s.title}, sent in by ${s.name} (${roleWords(s.role)}) ${minutes} minutes ago, is not live on EventLinqs. It is ${state}.\n\n` +
      `Every organiser's event is live within the hour or comes to you (the PM's ruling of 8 November 2026). It is at the top of /admin/today.\n\nSee it: ${link}`,
  }
}
