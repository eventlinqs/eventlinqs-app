'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventAccess } from '@/lib/organisations/event-access'

/**
 * THE ORGANISER'S SIDE OF THE ROOM (Scope v5, 3.11): answer a question, hide
 * or restore a message, post as the organiser.
 *
 * AUTHORISATION. Every action proves the caller may act for the event through
 * resolveEventAccess (owner, or a member holding owner, admin or manager), the
 * same gate the attendee list and the refund controls use, BEFORE the service
 * role touches stream_messages. The message id alone proves nothing: it is
 * matched against the event the caller was admitted to, so an id from another
 * organiser's room cannot be answered or hidden from here.
 *
 * EVERY PATH ENDS ON THE SCREEN THE PERSON IS ON, with a sentence. These are
 * plain form actions in a server component, so the result is carried back as
 * `done` or `error` on the address and rendered at the top of the room. A
 * control that completes with no result and no error is the class the
 * no-silent-submit guard exists to stop.
 */
export type StreamRoomError =
  | 'not_signed_in'
  | 'not_yours'
  | 'which_question'
  | 'answer_length'
  | 'not_in_room'
  | 'save_failed'
  | 'which_message'
  | 'post_length'

function back(eventId: string, outcome: { done?: string; error?: StreamRoomError }): never {
  revalidatePath(`/dashboard/events/${eventId}/stream`)
  const q = outcome.done ? `done=${outcome.done}` : `error=${outcome.error ?? 'save_failed'}`
  redirect(`/dashboard/events/${eventId}/stream?${q}`)
}

async function admitted(eventId: string): Promise<{ ok: true; userId: string } | { ok: false; error: StreamRoomError }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) return { ok: false, error: 'not_yours' }
  return { ok: true, userId: user.id }
}

export async function answerStreamQuestion(formData: FormData): Promise<void> {
  const eventId = String(formData.get('event_id') ?? '')
  const messageId = String(formData.get('message_id') ?? '')
  const answer = String(formData.get('answer') ?? '').trim()
  if (!eventId) redirect('/dashboard/events')
  if (!messageId) back(eventId, { error: 'which_question' })
  if (answer.length === 0 || answer.length > 1000) back(eventId, { error: 'answer_length' })

  const gate = await admitted(eventId)
  if (!gate.ok) back(eventId, { error: gate.error })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stream_messages')
    .update({ answer_body: answer, answered_at: new Date().toISOString(), answered_by: gate.userId })
    .eq('id', messageId)
    .eq('event_id', eventId)
    .eq('kind', 'question')
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[stream-room] answer failed:', error)
    back(eventId, { error: 'save_failed' })
  }
  if (!data) back(eventId, { error: 'not_in_room' })
  back(eventId, { done: 'answered' })
}

export async function setStreamMessageHidden(formData: FormData): Promise<void> {
  const eventId = String(formData.get('event_id') ?? '')
  const messageId = String(formData.get('message_id') ?? '')
  const hidden = String(formData.get('hidden') ?? '') === '1'
  if (!eventId) redirect('/dashboard/events')
  if (!messageId) back(eventId, { error: 'which_message' })

  const gate = await admitted(eventId)
  if (!gate.ok) back(eventId, { error: gate.error })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stream_messages')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', messageId)
    .eq('event_id', eventId)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[stream-room] hide failed:', error)
    back(eventId, { error: 'save_failed' })
  }
  if (!data) back(eventId, { error: 'not_in_room' })
  back(eventId, { done: hidden ? 'hidden' : 'shown' })
}

export async function postOrganiserMessage(formData: FormData): Promise<void> {
  const eventId = String(formData.get('event_id') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  const authorName = String(formData.get('author_name') ?? '').trim().slice(0, 80) || 'Organiser'
  if (!eventId) redirect('/dashboard/events')
  if (body.length === 0 || body.length > 500) back(eventId, { error: 'post_length' })

  const gate = await admitted(eventId)
  if (!gate.ok) back(eventId, { error: gate.error })

  const admin = createAdminClient()
  const { error } = await admin.from('stream_messages').insert({
    event_id: eventId,
    ticket_id: null,
    author_kind: 'organiser',
    author_name: authorName,
    kind: 'chat',
    body,
  })
  if (error) {
    console.error('[stream-room] post failed:', error)
    back(eventId, { error: 'save_failed' })
  }
  back(eventId, { done: 'posted' })
}
