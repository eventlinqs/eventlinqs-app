'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDefaultGateway } from '@/lib/payments/gateway-factory'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import type { FeePassType } from '@/types/database'

function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'EL-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export interface SquadMemberPaymentResult {
  client_secret?: string
  order_id?: string
  error?: string
}

/**
 * Creates a Stripe PaymentIntent for one squad member paying their share (1 ticket).
 * The squad's shared reservation is held at the squad level — this order has no reservation.
 * On payment success, the webhook marks the member as paid and completes the squad if full.
 */
export async function createSquadMemberPaymentIntent(
  memberId: string
): Promise<SquadMemberPaymentResult> {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load member with squad + tier + event
  const { data: member, error: memberError } = await adminClient
    .from('squad_members')
    .select(`
      id, user_id, status, order_id,
      attendee_first_name, attendee_last_name, attendee_email, guest_email,
      squad:squads!squad_id (
        id, status, expires_at, ticket_tier_id, event_id, total_spots,
        ticket_tier:ticket_tiers!ticket_tier_id ( id, name, price, currency ),
        event:events!event_id ( id, title, organisation_id, fee_pass_type )
      )
    `)
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    return { error: 'Squad membership not found' }
  }

  // Ownership check: logged-in user must match, OR guest (user_id null) with email match
  if (member.user_id && member.user_id !== user?.id) {
    return { error: 'Unauthorised' }
  }

  if (member.status === 'paid') {
    return { error: 'You have already paid for this squad spot' }
  }

  if (member.status !== 'invited') {
    return { error: 'Your squad membership is no longer active' }
  }

  const squad = (member.squad as unknown) as {
    id: string
    status: string
    expires_at: string
    ticket_tier_id: string
    event_id: string
    total_spots: number
    ticket_tier: { id: string; name: string; price: number; currency: string }
    event: { id: string; title: string; organisation_id: string; fee_pass_type: string }
  } | null

  if (!squad) return { error: 'Squad not found' }
  if (squad.status !== 'forming') return { error: 'This squad is no longer active' }
  if (new Date(squad.expires_at) < new Date()) return { error: 'This squad has expired' }

  // If member already has an order (incomplete previous payment attempt), reuse it
  if (member.order_id) {
    const { data: existingPayment } = await adminClient
      .from('payments')
      .select('client_secret, status')
      .eq('order_id', member.order_id)
      .in('status', ['initiated', 'processing'])
      .maybeSingle()

    if (existingPayment?.client_secret) {
      return { client_secret: existingPayment.client_secret, order_id: member.order_id }
    }
  }

  const tier = squad.ticket_tier
  const event = squad.event
  const currency = tier.currency
  const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

  // Calculate fees for 1 ticket
  const calculator = new PaymentCalculator()
  const fees = await calculator.calculate(
    [{ tier_id: tier.id, tier_name: tier.name, quantity: 1, unit_price_cents: tier.price }],
    [],
    currency,
    fee_pass_type,
    0
  )

  // Create order
  let order_number = generateOrderNumber()
  const { data: existing } = await adminClient.from('orders').select('id').eq('order_number', order_number).maybeSingle()
  if (existing) order_number = generateOrderNumber()

  const order_id = crypto.randomUUID()
  const buyerEmail = member.attendee_email ?? member.guest_email ?? ''
  const buyerName = [member.attendee_first_name, member.attendee_last_name].filter(Boolean).join(' ')

  const { error: orderError } = await adminClient
    .from('orders')
    .insert({
      id: order_id,
      order_number,
      event_id: event.id,
      organisation_id: event.organisation_id,
      user_id: user?.id ?? null,
      guest_email: user ? null : buyerEmail,
      guest_name: user ? null : buyerName,
      reservation_id: null,
      status: 'pending',
      subtotal_cents: fees.subtotal_cents,
      addon_total_cents: 0,
      platform_fee_cents: fees.platform_fee_cents,
      processing_fee_cents: fees.payment_processing_fee_cents,
      tax_cents: fees.tax_cents,
      discount_cents: 0,
      total_cents: fees.total_cents,
      currency,
      fee_pass_type,
      discount_code_id: null,
    })

  if (orderError) {
    console.error('[squad-checkout] order insert error:', orderError)
    return { error: 'Failed to create order. Please try again.' }
  }

  // Create order item (1 ticket)
  const { error: itemError } = await adminClient
    .from('order_items')
    .insert({
      order_id,
      ticket_tier_id: tier.id,
      addon_id: null,
      item_type: 'ticket',
      item_name: tier.name,
      quantity: 1,
      unit_price_cents: tier.price,
      total_cents: tier.price,
      attendee_first_name: member.attendee_first_name,
      attendee_last_name: member.attendee_last_name,
      attendee_email: buyerEmail,
    })

  if (itemError) {
    console.error('[squad-checkout] order_item insert error:', itemError)
    // Non-fatal — continue
  }

  // Create payment record
  const payment_id = crypto.randomUUID()
  const idempotency_key = order_id

  const { error: paymentError } = await adminClient
    .from('payments')
    .insert({
      id: payment_id,
      order_id,
      gateway: 'stripe',
      status: 'initiated',
      amount_cents: fees.total_cents,
      currency,
      idempotency_key,
    })

  if (paymentError) {
    console.error('[squad-checkout] payment insert error:', paymentError)
    return { error: 'Failed to initialise payment' }
  }

  // Link order to squad member so webhook can update member status
  const { error: memberUpdateError } = await adminClient
    .from('squad_members')
    .update({ order_id })
    .eq('id', memberId)

  if (memberUpdateError) {
    console.error('[squad-checkout] member order_id update error:', memberUpdateError)
  }

  // Create Stripe PaymentIntent with squad metadata
  try {
    const gateway = getDefaultGateway()
    const intentResult = await gateway.createPaymentIntent({
      amount_cents: fees.total_cents,
      currency,
      customer_email: buyerEmail,
      idempotency_key,
      metadata: {
        order_id,
        event_id: event.id,
        organisation_id: event.organisation_id,
        buyer_email: buyerEmail,
        squad_id: squad.id,
        squad_member_id: memberId,
      },
    })

    await adminClient
      .from('payments')
      .update({
        gateway_payment_id: intentResult.gateway_payment_id,
        client_secret: intentResult.client_secret,
        status: 'processing',
      })
      .eq('id', payment_id)

    return { client_secret: intentResult.client_secret, order_id }
  } catch (err) {
    console.error('[squad-checkout] Stripe createPaymentIntent error:', err)
    return { error: 'Payment provider error. Please try again.' }
  }
}
