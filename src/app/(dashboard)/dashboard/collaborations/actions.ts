'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { answerCollaboration, askVenueToJoin } from '@/lib/events/collaborators'

/*
 * The three presses of a collaboration (item 15 of the locked plan of 27 October
 * 2026): the organiser asks the venue, the venue joins or declines. Each one
 * establishes who is pressing before anything else, refuses an id that is not one,
 * and leaves the ownership check to src/lib/events/collaborators.ts, which reads
 * the organisation the press would act for. Each answers with a code the page
 * turns into its own sentence, never words carried in the address.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function signedInOrSignIn(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
}

function idFrom(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '')
  return UUID.test(value) ? value : null
}

export async function askVenueAction(formData: FormData): Promise<void> {
  await signedInOrSignIn()
  const eventId = idFrom(formData, 'eventId')
  if (eventId === null) redirect('/dashboard/events')
  const result = await askVenueToJoin(eventId)
  redirect(`/dashboard/events/${eventId}?venue=${result.ok ? 'asked' : 'refused'}#venue`)
}

export async function joinCollaborationAction(formData: FormData): Promise<void> {
  await signedInOrSignIn()
  const id = idFrom(formData, 'id')
  const result = id === null ? { ok: false } : await answerCollaboration(id, true)
  redirect(`/dashboard/collaborations?said=${result.ok ? 'joined' : 'refused'}`)
}

export async function declineCollaborationAction(formData: FormData): Promise<void> {
  await signedInOrSignIn()
  const id = idFrom(formData, 'id')
  const result = id === null ? { ok: false } : await answerCollaboration(id, false)
  redirect(`/dashboard/collaborations?said=${result.ok ? 'declined' : 'refused'}`)
}
