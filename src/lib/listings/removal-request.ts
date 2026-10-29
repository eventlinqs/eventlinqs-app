import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * REPORT OR REMOVE THIS LISTING (the release checklist's I5; the project manager's ruling of 29 October 2026, 14:20).
 * Anyone, with no account, picks one reason and may leave an email; the request becomes one removal_requests row
 * naming the night (20261029150201) and waits in /admin/today for a person. Nothing here hides or deletes a listing:
 * a listing comes down only through the event lifecycle that already exists (docs/EVENT-LIFECYCLE.md).
 */

/** The one reason a visitor picks, in the words stored and shown to Lawal. */
export const REMOVAL_REASONS = [
  { key: 'mine', words: 'I run this event or venue and want it taken down' },
  { key: 'wrong', words: 'The details are wrong' },
  { key: 'not_on', words: 'It is cancelled or not happening' },
  { key: 'photo', words: 'A photo or words are used without permission' },
  { key: 'other', words: 'Something else is wrong with it' },
] as const

export type RemovalReasonKey = (typeof REMOVAL_REASONS)[number]['key']

export type RemovalJudged =
  | { ok: true; reason: string; email: string | null }
  | { ok: false; problem: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The form's two answers judged, as the database will judge them (removal_requests_reason, removal_requests_email). */
export function judgeRemovalRequest(input: { reason: string; email: string }): RemovalJudged {
  const picked = REMOVAL_REASONS.find((r) => r.key === input.reason)
  if (!picked) return { ok: false, problem: 'Choose the reason that fits best.' }
  const email = input.email.trim()
  if (email !== '' && (email.length > 254 || !EMAIL.test(email))) {
    return { ok: false, problem: 'That email address does not look right. Leave it empty if you would rather not give one.' }
  }
  return { ok: true, reason: picked.words, email: email === '' ? null : email }
}

/** One removal_requests row for the night. The database says no to anything the judgement above let through. */
export async function recordRemovalRequest(
  db: SupabaseClient<Database>,
  eventId: string,
  judged: { reason: string; email: string | null },
): Promise<{ state: 'done' } | { state: 'refused'; reason: string }> {
  const { error } = await db.from('removal_requests').insert({
    event_id: eventId,
    reason: judged.reason,
    requester_email: judged.email,
    requester_name: null,
    note: 'Sent from the event page (Report or remove this listing)',
  })
  if (error) {
    console.warn('[removal-request] not written', error.message)
    return { state: 'refused', reason: 'We could not take your report just now. Try again in a minute, or email hello@eventlinqs.com.' }
  }
  return { state: 'done' }
}
