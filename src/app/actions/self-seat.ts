'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFlagEnabled } from '@/lib/flags'

/**
 * Buyer self-service seat change. The ticket holder moves their own ticket to
 * another available seat, but only for events whose organiser enabled it
 * (events.allow_seat_self_service). Reuses the proven reassign_ticket_seat RPC,
 * so the seat moves and the money never does: the ticket keeps its purchased
 * tier and price, and its QR, email surfaces and the door scan reflect the new
 * seat immediately.
 */

export type SelfSeatOption = { id: string; label: string }

export async function getSelfSeatOptions(
  ticketId: string,
): Promise<{ options: SelfSeatOption[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { options: [], error: 'Please sign in.' }

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, user_id, event_id, seat_id, events:event_id(allow_seat_self_service)')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket || ticket.user_id !== user.id) return { options: [], error: 'Ticket not found.' }
  const allowed = (ticket.events as { allow_seat_self_service?: boolean } | null)?.allow_seat_self_service
  if (!allowed) return { options: [], error: 'Seat changes are not enabled for this event.' }

  const { data: seats } = await admin
    .from('seats')
    .select('id, row_label, seat_number, seat_map_section_id, seat_map_sections:seat_map_section_id(name)')
    .eq('event_id', ticket.event_id)
    .eq('status', 'available')
    .order('row_label')
    .order('seat_number')
    .limit(500)

  const options = (seats ?? []).map(s => {
    const section = (s.seat_map_sections as { name?: string } | null)?.name
    const row = /^table/i.test(s.row_label) ? s.row_label : `Row ${s.row_label}`
    return { id: s.id, label: `${section ? `${section} · ` : ''}${row} · Seat ${s.seat_number}` }
  })
  return { options }
}

export async function changeMySeat(
  ticketId: string,
  newSeatId: string,
): Promise<{ ok?: true; newLabel?: string; error?: string }> {
  if (!(await isFlagEnabled('seated_events'))) return { error: 'Seat changes are not available right now.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in.' }

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, user_id, event_id, events:event_id(allow_seat_self_service, slug)')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket || ticket.user_id !== user.id) return { error: 'Ticket not found.' }
  const ev = ticket.events as { allow_seat_self_service?: boolean; slug?: string } | null
  if (!ev?.allow_seat_self_service) return { error: 'Seat changes are not enabled for this event.' }

  const { data: moved, error } = await admin.rpc('reassign_ticket_seat', {
    p_ticket_id: ticketId,
    p_new_seat_id: newSeatId,
  })
  if (error) {
    console.error('[self-seat] reassign failed:', error)
    return { error: error.message ?? 'That seat could not be taken. It may have just been booked.' }
  }

  const result = moved as { new_seat: { row_label: string; seat_number: string } }
  const newLabel = `Row ${result.new_seat.row_label}, Seat ${result.new_seat.seat_number}`

  revalidatePath('/dashboard/tickets')
  if (ev.slug) revalidatePath(`/events/${ev.slug}`)
  return { ok: true, newLabel }
}
