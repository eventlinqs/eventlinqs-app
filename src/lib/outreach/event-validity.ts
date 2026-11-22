import { afterYourNightRefusal } from './after-your-night'

/**
 * A LETTER IS SENT ONLY WHILE THE EVENT IT NAMES MAKES IT TRUE (Lawal, 19:13 of 22 November 2026, section 11: "An
 * organiser invitation for an event that has already finished must not be sent as though the event is upcoming. A
 * reminder must not be sent after its relevant deadline. A completed or expired business opportunity must not remain in
 * an active automation indefinitely."; the PM's 19:13, item 8). Traced at 19:2x: the sender re-read the event at send
 * time only for segment A and the law 49 lifecycle letters (sender.ts segmentATooClose); every other letter naming an
 * /events/ page went on whatever its night had become, and nothing voided a held or queued letter whose event had passed.
 *
 * The rule for every other letter that names an event, from the communication standard's own Part 2 rule 4 ("no message
 * about an event lands on or after its day"):
 *  - an event no longer published (cancelled, postponed, paused, completed, archived) or no longer listed: never sent;
 *  - a letter about the event to come: never on or after the event's own day, in its own zone;
 *  - the after your night report (message 8): only inside its own window (planner.ts afterYourNightRefusal: not after
 *    seven days);
 *  - a reply to the organiser's own message is never held back by its event's date (it answers them; it promotes nothing).
 * The organiser contact itself is never touched: only the letter is voided, with its reason, so the relationship stays
 * for their next event. Pure.
 */

export type LetterEvent = { readonly startDate: string; readonly endDate: string | null; readonly status: string | null; readonly timezone: string | null }

/** The /events/<slug> a letter names, or null. */
export function eventSlugOf(body: string): string | null {
  return body.match(/\/events\/([a-z0-9-]+)/)?.[1] ?? null
}

const dayIn = (at: Date, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/** Why a letter of this template, naming this event, may not go at `now`; null when it may. */
export function letterExpiry(templateKey: string, ev: LetterEvent | null, now: Date): string | null {
  if (templateKey.startsWith('reply_')) return null
  if (ev === null) return 'expired: the event it names is no longer listed; set aside, never sent'
  if (ev.status !== null && ev.status !== 'published') return `expired: the event it names is ${ev.status}; set aside, never sent`
  if (templateKey === 'after_your_night') {
    const why = afterYourNightRefusal(new Date(ev.endDate ?? ev.startDate), now)
    return why && /too late/.test(why) ? `expired: ${why}; set aside, never sent` : null
  }
  const zone = ev.timezone?.trim() || 'Australia/Melbourne'
  if (dayIn(now, zone) >= dayIn(new Date(ev.startDate), zone)) {
    return `expired: the event it names starts ${dayIn(new Date(ev.startDate), zone)}, and no message about an event lands on or after its day (the communication standard, Part 2 rule 4); set aside, never sent`
  }
  return null
}
