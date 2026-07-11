'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageOrganisationSeating } from '@/lib/organisations/access'
import { sendEmail } from '@/lib/email/send'
import { revalidatePath } from 'next/cache'

/**
 * Verify the calling user may manage this event's seating: the organisation
 * owner OR a member with the owner/admin/manager role (the same trust level
 * the door scanner grants). The event read runs on the admin client so a
 * manager is never blocked by owner-scoped RLS on draft events; the
 * authority check itself runs under the caller's session (RLS applies).
 */
async function getEventWithAuth(eventId: string, userId: string) {
  const admin = createAdminClient()
  const { data: event, error } = await admin
    .from('events')
    .select('id, organisation_id, slug, title, timezone, start_date')
    .eq('id', eventId)
    .single()

  if (error || !event) return null

  const supabase = await createClient()
  const allowed = await canManageOrganisationSeating(supabase, userId, event.organisation_id)
  if (!allowed) return null
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

export type ReassignResult = {
  error?: string
  moved?: { from: string | null; to: string; holder: string | null; emailed: boolean }
}

/**
 * Move the ticket sitting on one seat to another AVAILABLE seat of the same
 * event, atomically (reassign_ticket_seat RPC: old seat freed, new seat sold,
 * ticket repointed; the door scan and digital ticket reflect the move
 * immediately). The seat moves, the money never does: the ticket keeps its
 * purchased tier and price. The holder is emailed about the change,
 * best-effort - a mail failure never voids the move, it is reported instead.
 */
export async function reassignSeatOccupant(
  eventId: string,
  fromSeatId: string,
  toSeatId: string
): Promise<ReassignResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const event = await getEventWithAuth(eventId, user.id)
  if (!event) return { error: 'Event not found or access denied' }

  const admin = createAdminClient()

  // Resolve the ticket occupying the source seat.
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, holder_name, holder_email, event_id')
    .eq('seat_id', fromSeatId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!ticket) return { error: 'No ticket found on that seat.' }

  const { data: moved, error: rpcError } = await admin.rpc('reassign_ticket_seat', {
    p_ticket_id: ticket.id,
    p_new_seat_id: toSeatId,
  })
  if (rpcError) {
    console.error('[seats] reassign_ticket_seat failed:', rpcError)
    return { error: rpcError.message ?? 'Failed to move the attendee.' }
  }

  const result = moved as {
    old_seat: { row_label: string; seat_number: string } | null
    new_seat: { row_label: string; seat_number: string }
  }
  const fromLabel = result.old_seat
    ? `Row ${result.old_seat.row_label}, Seat ${result.old_seat.seat_number}`
    : null
  const toLabel = `Row ${result.new_seat.row_label}, Seat ${result.new_seat.seat_number}`

  // Tell the holder (best-effort; the competitor-standard is NO notification,
  // so a failure here degrades to parity, never below).
  let emailed = false
  if (ticket.holder_email) {
    try {
      await sendEmail({
        to: ticket.holder_email,
        subject: `Your seat for ${event.title} has been updated`,
        text: `Hi ${ticket.holder_name ?? 'there'},\n\nThe organiser has updated your seat for ${event.title}.\n\nYour new seat: ${toLabel}${fromLabel ? `\nPrevious seat: ${fromLabel}` : ''}\n\nYour ticket and its QR code stay exactly the same - the seat shown on it has already been updated, and the door scanner knows. Nothing else about your order changes.\n\nEventLinqs`,
        html: `<p>Hi ${ticket.holder_name ?? 'there'},</p><p>The organiser has updated your seat for <strong>${event.title}</strong>.</p><p><strong>Your new seat: ${toLabel}</strong>${fromLabel ? `<br/>Previous seat: ${fromLabel}` : ''}</p><p>Your ticket and its QR code stay exactly the same - the seat shown on it has already been updated, and the door scanner knows. Nothing else about your order changes.</p><p>EventLinqs</p>`,
      })
      emailed = true
    } catch (err) {
      console.error('[seats] seat-change email failed (move still applied):', err)
    }
  }

  revalidatePath(`/dashboard/events/${eventId}/seats`)
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  return { moved: { from: fromLabel, to: toLabel, holder: ticket.holder_name, emailed } }
}

/**
 * Assign a seat to a paid ticket that has none yet (organiser-assigns mode,
 * or any unseated ticket on a seated event). Rides the same atomic
 * reassign_ticket_seat RPC as Move attendee - the RPC's no-old-seat path -
 * so the ticket, QR and door scan reflect the seat immediately. The holder
 * is emailed their seat, best-effort.
 */
export async function assignTicketToSeat(
  eventId: string,
  ticketId: string,
  toSeatId: string
): Promise<ReassignResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const event = await getEventWithAuth(eventId, user.id)
  if (!event) return { error: 'Event not found or access denied' }

  const admin = createAdminClient()

  const { data: ticket } = await admin
    .from('tickets')
    .select('id, holder_name, holder_email, event_id, seat_id, status')
    .eq('id', ticketId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!ticket) return { error: 'Ticket not found for this event.' }
  if (ticket.seat_id) return { error: 'This ticket already has a seat - use Move attendee instead.' }
  if (ticket.status !== 'valid') return { error: 'Only a valid ticket can be assigned a seat.' }

  const { data: moved, error: rpcError } = await admin.rpc('reassign_ticket_seat', {
    p_ticket_id: ticket.id,
    p_new_seat_id: toSeatId,
  })
  if (rpcError) {
    console.error('[seats] assignTicketToSeat failed:', rpcError)
    return { error: rpcError.message ?? 'Failed to assign the seat.' }
  }

  const result = moved as {
    new_seat: { row_label: string; seat_number: string }
  }
  const toLabel = `Row ${result.new_seat.row_label}, Seat ${result.new_seat.seat_number}`

  let emailed = false
  if (ticket.holder_email) {
    try {
      await sendEmail({
        to: ticket.holder_email,
        subject: `Your seat for ${event.title} has been assigned`,
        text: `Hi ${ticket.holder_name ?? 'there'},\n\nThe organiser has assigned your seat for ${event.title}.\n\nYour seat: ${toLabel}\n\nYour ticket and its QR code stay exactly the same - the seat now shows on the ticket, and the door scanner knows. Nothing else about your order changes.\n\nEventLinqs`,
        html: `<p>Hi ${ticket.holder_name ?? 'there'},</p><p>The organiser has assigned your seat for <strong>${event.title}</strong>.</p><p><strong>Your seat: ${toLabel}</strong></p><p>Your ticket and its QR code stay exactly the same - the seat now shows on the ticket, and the door scanner knows. Nothing else about your order changes.</p><p>EventLinqs</p>`,
      })
      emailed = true
    } catch (err) {
      console.error('[seats] seat-assignment email failed (assignment still applied):', err)
    }
  }

  revalidatePath(`/dashboard/events/${eventId}/seats`)
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  return { moved: { from: null, to: toLabel, holder: ticket.holder_name, emailed } }
}

/**
 * Sync a LIVE event with its edited seating chart, additively: new seats are
 * added, free seats repositioned, never-sold seats missing from the chart
 * removed. Reserved, sold, and held seats are provably untouched (the RPC
 * refuses to alter their status or references), so an organiser can fix a
 * room mid-sale without any risk to sold inventory.
 */
export async function syncChartChanges(
  eventId: string
): Promise<{ error?: string; added?: number; updated?: number; removed?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const event = await getEventWithAuth(eventId, user.id)
  if (!event) return { error: 'Event not found or access denied' }

  const admin = createAdminClient()
  const { data: eventRow } = await admin
    .from('events')
    .select('seat_map_id')
    .eq('id', eventId)
    .single()
  if (!eventRow?.seat_map_id) return { error: 'This event has no seating chart attached.' }

  const { data, error } = await admin.rpc('rematerialize_seats_additive', {
    p_event_id: eventId,
    p_seat_map_id: eventRow.seat_map_id,
  })
  if (error) {
    console.error('[seats] rematerialize_seats_additive failed:', error)
    return { error: error.message ?? 'Failed to sync the chart.' }
  }

  const counts = data as { added: number; updated: number; removed: number }
  revalidatePath(`/dashboard/events/${eventId}/seats`)
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  return counts
}
