'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFlagEnabled } from '@/lib/flags'
import { guardedDestinations, type SelfMoveSeat } from '@/lib/seating/self-move'

/**
 * Buyer self-service seat change. The ticket holder moves their own ticket
 * to another available seat, but only for events whose organiser enabled
 * it (events.allow_seat_self_service) and while the seated_events flag is
 * on. Reuses the proven reassign_ticket_seat RPC, so the seat moves and
 * the money never does: the ticket keeps its purchased tier and price, and
 * its QR, email surfaces and the door scan reflect the new seat
 * immediately.
 *
 * The exceed over the strongest competitor implementation: the buyer is
 * only ever OFFERED seats that keep price parity (same tier) and that the
 * orphan guard clears, and the guard is re-run server-side at move time,
 * so a self-move can never strand a lone seat even from a tampered client.
 */

export type SelfSeatOption = {
  id: string
  label: string
  section: string | null
  row: string
  number: string
}

export type SelfSeatOptionsResult = {
  options: SelfSeatOption[]
  /** Seats withheld because taking them would strand a single. */
  guardedCount?: number
  currentLabel?: string
  error?: string
}

type TicketForMove = {
  id: string
  order_id: string
  event_id: string
  seat_id: string | null
  orders: { user_id?: string | null } | null
  events: { allow_seat_self_service?: boolean; slug?: string } | null
}

async function loadOwnedTicket(
  ticketId: string,
  userId: string,
): Promise<{ ticket?: TicketForMove; error?: string }> {
  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, order_id, event_id, seat_id, orders:order_id(user_id), events:event_id(allow_seat_self_service, slug)')
    .eq('id', ticketId)
    .maybeSingle()

  // Ownership is via the order's buyer (tickets carry no user_id).
  const ownerId = (ticket?.orders as { user_id?: string | null } | null)?.user_id
  if (!ticket || ownerId !== userId) return { error: 'Ticket not found.' }
  const allowed = (ticket.events as { allow_seat_self_service?: boolean } | null)
    ?.allow_seat_self_service
  if (!allowed) return { error: 'Seat changes are not enabled for this event.' }
  return { ticket: ticket as unknown as TicketForMove }
}

type SeatRow = SelfMoveSeat

export async function getSelfSeatOptions(
  ticketId: string,
): Promise<SelfSeatOptionsResult> {
  if (!(await isFlagEnabled('seated_events'))) {
    return { options: [], error: 'Seat changes are not available right now.' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { options: [], error: 'Please sign in.' }

  const { ticket, error } = await loadOwnedTicket(ticketId, user.id)
  if (!ticket || error) return { options: [], error: error ?? 'Ticket not found.' }
  if (!ticket.seat_id) return { options: [], error: 'This ticket has no seat yet.' }

  const admin = createAdminClient()
  const [{ data: seats }, { data: sections }] = await Promise.all([
    admin
      .from('seats')
      .select('id, row_label, seat_number, seat_type, status, x, y, seat_map_section_id, ticket_tier_id')
      .eq('event_id', ticket.event_id)
      .range(0, 9999),
    admin.from('seat_map_sections').select('id, name'),
  ])
  if (!seats || seats.length === 0) return { options: [], error: 'No seats found.' }

  const sectionName = new Map((sections ?? []).map(s => [s.id as string, s.name as string]))
  const { safe, guardedCount } = guardedDestinations(seats as SeatRow[], ticket.seat_id)

  const current = (seats as SeatRow[]).find(s => s.id === ticket.seat_id)
  const currentLabel = current
    ? `${/^table/i.test(current.row_label) ? current.row_label : `Row ${current.row_label}`} · Seat ${current.seat_number}`
    : undefined

  const options = safe
    .sort((a, b) => a.row_label.localeCompare(b.row_label) || Number(a.seat_number) - Number(b.seat_number))
    .slice(0, 300)
    .map(s => {
      const section = s.seat_map_section_id ? (sectionName.get(s.seat_map_section_id) ?? null) : null
      const row = /^table/i.test(s.row_label) ? s.row_label : `Row ${s.row_label}`
      return {
        id: s.id,
        label: `${section ? `${section} · ` : ''}${row} · Seat ${s.seat_number}`,
        section,
        row: s.row_label,
        number: s.seat_number,
      }
    })
  return { options, guardedCount, currentLabel }
}

export async function changeMySeat(
  ticketId: string,
  newSeatId: string,
): Promise<{ ok?: true; newLabel?: string; error?: string }> {
  if (!(await isFlagEnabled('seated_events'))) return { error: 'Seat changes are not available right now.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in.' }

  const { ticket, error: loadError } = await loadOwnedTicket(ticketId, user.id)
  if (!ticket || loadError) return { error: loadError ?? 'Ticket not found.' }

  const admin = createAdminClient()

  // The orphan guard is a server guarantee, not a client courtesy: the
  // destination must be on the same tier and must strand nobody, checked
  // again here against the live room.
  if (ticket.seat_id) {
    const { data: seats } = await admin
      .from('seats')
      .select('id, row_label, seat_number, seat_type, status, x, y, seat_map_section_id, ticket_tier_id')
      .eq('event_id', ticket.event_id)
      .range(0, 9999)
    if (seats && seats.length > 0) {
      const { safe } = guardedDestinations(seats as SeatRow[], ticket.seat_id)
      const target = (seats as SeatRow[]).find(s => s.id === newSeatId)
      if (!target || target.status !== 'available') {
        return { error: 'That seat has just been taken. Pick another.' }
      }
      if (!safe.some(s => s.id === newSeatId)) {
        return {
          error:
            'That move would leave a single seat stranded on its own, so it is not offered. Pick any seat from the list: every one of those is safe.',
        }
      }
    }
  }

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

  const ev = ticket.events
  revalidatePath('/dashboard/tickets')
  revalidatePath('/tickets')
  if (ev?.slug) revalidatePath(`/events/${ev.slug}`)
  return { ok: true, newLabel }
}
