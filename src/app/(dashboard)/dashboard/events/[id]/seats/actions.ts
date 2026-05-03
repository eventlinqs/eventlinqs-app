'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Verify the calling user owns this event's organisation.
 * Returns the event row or null if access is denied.
 */
async function getEventWithAuth(eventId: string, userId: string) {
  const supabase = await createClient()
  const { data: event, error } = await supabase
    .from('events')
    .select('id, organisation_id, slug')
    .eq('id', eventId)
    .single()

  if (error || !event) return null

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', userId)
    .single()

  if (!org) return null
  return event
}

export async function holdSeat(
  eventId: string,
  seatId: string,
  reason: string,
  notes: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const event = await getEventWithAuth(eventId, user.id)
  if (!event) return { error: 'Event not found or access denied' }

  const admin = createAdminClient()

  // Mark seat as held
  const { error: seatError } = await admin
    .from('seats')
    .update({
      status: 'held',
      held_by_user_id: user.id,
      held_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', seatId)
    .eq('event_id', eventId)
    .eq('status', 'available') // Only hold available seats

  if (seatError) {
    console.error('[seats] holdSeat update failed:', seatError)
    return { error: `Failed to hold seat: ${seatError.message}` }
  }

  // Insert seat_holds record
  const { error: holdError } = await admin
    .from('seat_holds')
    .insert({
      event_id: eventId,
      seat_id: seatId,
      held_by_user_id: user.id,
      reason: reason || null,
      notes: notes || null,
    })

  if (holdError) {
    console.error('[seats] seat_holds insert failed:', holdError)
    // Non-fatal - seat is already marked held
  }

  revalidatePath(`/dashboard/events/${eventId}/seats`)
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  return {}
}

export async function releaseSeat(
  eventId: string,
  seatId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const event = await getEventWithAuth(eventId, user.id)
  if (!event) return { error: 'Event not found or access denied' }

  const admin = createAdminClient()

  const { error: seatError } = await admin
    .from('seats')
    .update({
      status: 'available',
      held_by_user_id: null,
      held_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', seatId)
    .eq('event_id', eventId)
    .eq('status', 'held')

  if (seatError) {
    console.error('[seats] releaseSeat failed:', seatError)
    return { error: `Failed to release seat: ${seatError.message}` }
  }

  // Remove seat_holds record
  await admin
    .from('seat_holds')
    .delete()
    .eq('seat_id', seatId)
    .eq('event_id', eventId)

  revalidatePath(`/dashboard/events/${eventId}/seats`)
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  return {}
}
