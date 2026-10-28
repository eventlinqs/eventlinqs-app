import { isWalkIn } from '@/lib/events/entry-mode'
import { REMIND_ME_CONSENT_VERSION, REMIND_ME_DONE, remindMeConsentText, remindMePurpose } from './remind-me'

/**
 * WHAT HAPPENS WHEN SOMEBODY PRESSES REMIND ME (WI1).
 *
 * The decision is here and the wiring is in src/app/actions/event-reminder.ts,
 * so every branch, the bot trap above all, is tested with the database and the
 * limiter replaced by recorders, and "stores nothing" is proved by counting.
 *
 * THE ORDER IS THE POINT.
 *   1. The bot trap first: a filled trap gets the normal success message and
 *      touches nothing at all, not even the limiter (Lawal, change 4 of
 *      21 October 2026). A bot that learns nothing cannot adapt.
 *   2. The switch: Remind me is dark in production until Lawal approves the
 *      privacy version that names it.
 *   3. The limit, fail-closed, because the row leads to mail.
 *   4. The address, then the event: a published, public, walk-in event that
 *      has not ended. Anything else is refused in words, never stored.
 *   5. One row per event and address. Asking again changes nothing; asking
 *      again after stopping starts again, with the wording read this time.
 */

export type ReminderRequestInput = {
  eventId: string
  email: string
  /** The hidden field. A person never fills it. */
  trap: string
}

export type ReminderRequestResult = { ok: true; message: string } | { ok: false; error: string }

export type ReminderEvent = {
  id: string
  status: string
  visibility: string
  entry_mode: string | null
  end_date: string
  organiser_name: string
  program_published: boolean
}

export type ReminderRow = { id: string; unsubscribed_at: string | null }

export type ReminderDeps = {
  remindMeOn: () => Promise<boolean>
  rateLimitOk: () => Promise<boolean>
  readEvent: (eventId: string) => Promise<ReminderEvent | null>
  readReminder: (eventId: string, email: string) => Promise<ReminderRow | null>
  insertReminder: (row: {
    event_id: string
    email: string
    consent_version: string
    consent_text: string
  }) => Promise<boolean>
  restartReminder: (id: string, consent: { consent_version: string; consent_text: string }) => Promise<boolean>
  now: () => Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// One @, something either side, a dot in the domain, no spaces: the same shape
// the city waitlist accepts. The database checks it is stored normalised.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handleReminderRequest(
  deps: ReminderDeps,
  input: ReminderRequestInput,
): Promise<ReminderRequestResult> {
  if (typeof input.trap === 'string' && input.trap.trim().length > 0) {
    return { ok: true, message: REMIND_ME_DONE }
  }

  if (!(await deps.remindMeOn())) {
    return { ok: false, error: 'Reminders are not open for this event yet.' }
  }

  if (!(await deps.rateLimitOk())) {
    return { ok: false, error: 'Too many requests from here. Please try again in a few minutes.' }
  }

  const email = (input.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (!UUID.test(input.eventId ?? '')) {
    return { ok: false, error: 'This event could not be found.' }
  }

  const event = await deps.readEvent(input.eventId)
  if (
    !event ||
    event.status !== 'published' ||
    event.visibility !== 'public' ||
    !isWalkIn(event)
  ) {
    return { ok: false, error: 'This event could not be found.' }
  }
  if (new Date(event.end_date).getTime() < deps.now().getTime()) {
    return { ok: false, error: 'This event has finished, so there is nothing to remind you of.' }
  }

  const consent = {
    consent_version: REMIND_ME_CONSENT_VERSION,
    consent_text: remindMeConsentText(remindMePurpose(event.organiser_name, event.program_published)),
  }

  const existing = await deps.readReminder(event.id, email)
  if (existing && existing.unsubscribed_at === null) {
    return { ok: true, message: REMIND_ME_DONE }
  }
  const stored = existing
    ? await deps.restartReminder(existing.id, consent)
    : await deps.insertReminder({ event_id: event.id, email, ...consent })
  if (!stored) {
    return { ok: false, error: 'That did not save. Please try again in a moment.' }
  }
  return { ok: true, message: REMIND_ME_DONE }
}
