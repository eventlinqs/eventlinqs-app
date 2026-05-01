'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { getOrCreateGuestSessionId } from '@/lib/auth/guest-session'

const RegisterFreeSchema = z.object({
  event_id: z.string().uuid(),
  ticket_items: z.array(
    z.object({
      ticket_tier_id: z.string().uuid(),
      quantity: z.number().int().min(1).max(20),
    })
  ).min(1),
})

export interface RegisterFreeResult {
  order_id?: string
  reservation_id?: string // fallback: redirect to /checkout for guest email capture
  error?: string
}

function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'EL-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Registers free tickets in a single server round-trip.
 *
 * - Logged-in users: creates order immediately and returns order_id.
 * - Guest users: creates the reservation and returns reservation_id so the
 *   caller can redirect to /checkout where email collection happens.
 */
export async function registerFreeTickets(
  input: z.infer<typeof RegisterFreeSchema>
): Promise<RegisterFreeResult> {
  const parsed = RegisterFreeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Invalid input' }
  }

  const { event_id, ticket_items } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Verify all requested tiers are genuinely free (server-side check)
  const tierIds = ticket_items.map(i => i.ticket_tier_id)
  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price, currency')
    .in('id', tierIds)

  if (!tiers || tiers.length !== tierIds.length) {
    return { error: 'One or more ticket tiers could not be found.' }
  }

  const allFree = tiers.every(t => t.price === 0)
  if (!allFree) {
    return { error: 'This action is only valid for free tickets.' }
  }

  // 2. Create reservation
  const items = ticket_items.map(i => ({
    ticket_tier_id: i.ticket_tier_id,
    quantity: i.quantity,
  }))

  const sessionId = user ? null : await getOrCreateGuestSessionId()

  const { data: resData, error: resError } = await supabase.rpc('create_reservation', {
    p_event_id: event_id,
    p_user_id: user?.id ?? null,
    p_session_id: sessionId,
    p_items: items,
  })

  if (resError || !resData) {
    console.error('[registerFreeTickets] FAIL: create_reservation error:', resError)
    return { error: resError?.message ?? 'Failed to reserve tickets. They may have sold out.' }
  }

  const resResult = resData as {
    success: boolean
    reservation_id?: string
    expires_at?: string
    error?: string
  }

  if (!resResult.success || !resResult.reservation_id) {
    return { error: resResult.error ?? 'Unable to reserve tickets. Please try again.' }
  }

  const reservation_id = resResult.reservation_id

  // 3. Guest fallback - redirect to checkout page for email capture
  if (!user) {
    return { reservation_id }
  }

  // 4. Logged-in user - complete the free order immediately
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const buyerEmail = profile?.email ?? user.email ?? ''
  const buyerName = profile?.full_name ?? buyerEmail

  const adminClient = createAdminClient()
  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, title, organisation_id, fee_pass_type')
    .eq('id', event_id)
    .single()

  if (!event) {
    console.error('[registerFreeTickets] Event not found. event_id:', event_id, '| supabase error:', eventError)
    return { error: 'Event not found' }
  }

  const currency = tiers[0]?.currency ?? 'AUD'

  const tierMap = new Map(tiers.map(t => [t.id, t]))
  const cartTickets = ticket_items.map(i => ({
    tier_id: i.ticket_tier_id,
    tier_name: tierMap.get(i.ticket_tier_id)?.name ?? 'Ticket',
    quantity: i.quantity,
    unit_price_cents: 0,
  }))

  const order_id = crypto.randomUUID()
  let order_number = generateOrderNumber()

  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('order_number', order_number)
    .maybeSingle()
  if (existingOrder) order_number = generateOrderNumber()

  const { error: orderError } = await adminClient.from('orders').insert({
    id: order_id,
    order_number,
    event_id: event.id,
    organisation_id: event.organisation_id,
    user_id: user.id,
    guest_email: null,
    guest_name: null,
    reservation_id,
    status: 'pending',
    subtotal_cents: 0,
    addon_total_cents: 0,
    platform_fee_cents: 0,
    processing_fee_cents: 0,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    currency,
    fee_pass_type: event.fee_pass_type ?? 'pass_to_buyer',
    discount_code_id: null,
    confirmed_at: null,
  })

  if (orderError) {
    console.error('Free order insert error:', orderError)
    return { error: 'Failed to create order. Please try again.' }
  }

  // 5. Create order_items
  const orderItems = cartTickets.flatMap(ticket =>
    Array.from({ length: ticket.quantity }, () => ({
      order_id,
      ticket_tier_id: ticket.tier_id,
      addon_id: null,
      item_type: 'ticket' as const,
      item_name: ticket.tier_name,
      quantity: 1,
      unit_price_cents: 0,
      total_cents: 0,
      attendee_first_name: buyerName.split(' ')[0] ?? buyerName,
      attendee_last_name: buyerName.split(' ').slice(1).join(' ') ?? '',
      attendee_email: buyerEmail,
    }))
  )

  await adminClient.from('order_items').insert(orderItems)

  // 6. Confirm the order - sets status, converts reservation, increments sold_count
  const { error: confirmError } = await adminClient.rpc('confirm_order', { p_order_id: order_id })
  if (confirmError) {
    console.error('[registerFreeTickets] confirm_order error:', confirmError)
    return { error: 'Order created but could not be confirmed. Please contact support.' }
  }

  return { order_id }
}
