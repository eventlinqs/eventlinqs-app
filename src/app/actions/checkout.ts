'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { getDefaultGateway } from '@/lib/payments/gateway-factory'
import { validateDiscountCode } from './discount-codes'
import type { FeePassType } from '@/types/database'

const AttendeeSchema = z.object({
  ticket_tier_id: z.string().uuid(),
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  email: z.string().email('Valid email required'),
})

const CheckoutSchema = z.object({
  reservation_id: z.string().uuid(),
  buyer_email: z.string().email('Valid email required'),
  buyer_name: z.string().min(1, 'Name required'),
  attendees: z.array(AttendeeSchema).min(1),
  discount_code: z.string().optional(),
  addon_quantities: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
})

export type CheckoutFormData = z.infer<typeof CheckoutSchema>

export interface CheckoutResult {
  client_secret?: string
  order_id?: string
  is_free?: boolean
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

export async function processCheckout(data: CheckoutFormData): Promise<CheckoutResult> {
  const parsed = CheckoutSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues
    return { error: issues[0]?.message ?? 'Invalid checkout data' }
  }

  const { reservation_id, buyer_email, buyer_name, attendees, discount_code, addon_quantities } = parsed.data

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Verify reservation is still active
  const { data: reservation } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservation_id)
    .eq('status', 'active')
    .single()

  if (!reservation) {
    return { error: 'Your reservation has expired. Please select tickets again.' }
  }

  if (new Date(reservation.expires_at) < new Date()) {
    return { error: 'Your reservation has expired. Please select tickets again.' }
  }

  // 2. Load event and ticket tiers
  const { data: event } = await supabase
    .from('events')
    .select('id, title, organisation_id, fee_pass_type')
    .eq('id', reservation.event_id)
    .single()

  if (!event) return { error: 'Event not found' }

  const reservationItems = reservation.items as { ticket_tier_id?: string; addon_id?: string; quantity: number }[]

  const tierIds = reservationItems
    .filter(i => i.ticket_tier_id)
    .map(i => i.ticket_tier_id!)

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price, currency')
    .in('id', tierIds)

  if (!tiers) return { error: 'Failed to load ticket information' }

  // 3. Build cart items from reservation
  const tierMap = new Map(tiers.map(t => [t.id, t]))

  const cartTickets = reservationItems
    .filter(i => i.ticket_tier_id)
    .map(i => ({
      tier_id: i.ticket_tier_id!,
      tier_name: tierMap.get(i.ticket_tier_id!)?.name ?? 'Ticket',
      quantity: i.quantity,
      unit_price_cents: tierMap.get(i.ticket_tier_id!)?.price ?? 0,
    }))

  // Load addons if any
  const addonItemsInReservation = reservationItems.filter(i => i.addon_id)
  const cartAddons = []

  if (addonItemsInReservation.length > 0) {
    const addonIds = addonItemsInReservation.map(i => i.addon_id!)
    const { data: addons } = await supabase
      .from('event_addons')
      .select('id, name, price')
      .in('id', addonIds)

    if (addons) {
      const addonMap = new Map(addons.map(a => [a.id, a]))
      for (const item of addonItemsInReservation) {
        const addon = addonMap.get(item.addon_id!)
        if (addon) {
          cartAddons.push({
            addon_id: item.addon_id!,
            addon_name: addon.name,
            quantity: item.quantity,
            unit_price_cents: addon.price,
          })
        }
      }
    }
  }

  const currency = tiers[0]?.currency ?? 'AUD'
  const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

  // 4. Validate discount code
  let discount_cents = 0
  let discount_code_id: string | undefined

  if (discount_code && discount_code.trim()) {
    const subtotal = cartTickets.reduce((s, t) => s + t.unit_price_cents * t.quantity, 0) +
      cartAddons.reduce((s, a) => s + a.unit_price_cents * a.quantity, 0)

    const dcResult = await validateDiscountCode(
      discount_code,
      event.id,
      user?.id ?? null,
      subtotal,
      tierIds
    )

    if (dcResult.valid) {
      discount_cents = dcResult.discount_cents
      discount_code_id = dcResult.discount_code_id
    }
    // If invalid, we silently ignore (frontend validates first, but we don't error here on stale codes)
  }

  // 5. Calculate fees
  const calculator = new PaymentCalculator()
  const fees = await calculator.calculate(cartTickets, cartAddons, currency, fee_pass_type, discount_cents)

  const isFreeOrder = fees.total_cents === 0

  // 6. Create order
  const order_id = crypto.randomUUID()
  let order_number = generateOrderNumber()

  // Ensure uniqueness (retry once)
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('order_number', order_number)
    .maybeSingle()
  if (existingOrder) order_number = generateOrderNumber()

  const { error: orderError } = await adminClient
    .from('orders')
    .insert({
      id: order_id,
      order_number,
      event_id: event.id,
      organisation_id: event.organisation_id,
      user_id: user?.id ?? null,
      guest_email: user ? null : buyer_email,
      guest_name: user ? null : buyer_name,
      reservation_id,
      status: isFreeOrder ? 'confirmed' : 'pending',
      subtotal_cents: fees.subtotal_cents,
      addon_total_cents: fees.addon_total_cents,
      platform_fee_cents: fees.platform_fee_cents,
      processing_fee_cents: fees.payment_processing_fee_cents,
      tax_cents: fees.tax_cents,
      discount_cents: fees.discount_cents,
      total_cents: fees.total_cents,
      currency,
      fee_pass_type,
      discount_code_id: discount_code_id ?? null,
      confirmed_at: isFreeOrder ? new Date().toISOString() : null,
    })

  if (orderError) {
    console.error('Order insert error:', orderError)
    return { error: 'Failed to create order. Please try again.' }
  }

  // 7. Create order_items
  const orderItems = []

  for (const ticket of cartTickets) {
    const attendeesForTier = attendees.filter(a => a.ticket_tier_id === ticket.tier_id)
    for (let i = 0; i < ticket.quantity; i++) {
      const attendee = attendeesForTier[i]
      orderItems.push({
        order_id,
        ticket_tier_id: ticket.tier_id,
        addon_id: null,
        item_type: 'ticket' as const,
        item_name: ticket.tier_name,
        quantity: 1,
        unit_price_cents: ticket.unit_price_cents,
        total_cents: ticket.unit_price_cents,
        attendee_first_name: attendee?.first_name ?? buyer_name.split(' ')[0] ?? buyer_name,
        attendee_last_name: attendee?.last_name ?? buyer_name.split(' ').slice(1).join(' ') ?? '',
        attendee_email: attendee?.email ?? buyer_email,
      })
    }
  }

  for (const addon of cartAddons) {
    orderItems.push({
      order_id,
      ticket_tier_id: null,
      addon_id: addon.addon_id,
      item_type: 'addon' as const,
      item_name: addon.addon_name,
      quantity: addon.quantity,
      unit_price_cents: addon.unit_price_cents,
      total_cents: addon.unit_price_cents * addon.quantity,
      attendee_first_name: null,
      attendee_last_name: null,
      attendee_email: null,
    })
  }

  const { error: itemsError } = await adminClient.from('order_items').insert(orderItems)
  if (itemsError) {
    console.error('Order items error:', itemsError)
    // Order is created, don't fail — items issue should be investigated
  }

  // 8. For free orders — confirm immediately
  if (isFreeOrder) {
    // Mark reservation as converted
    await supabase
      .from('reservations')
      .update({ status: 'converted', converted_at: new Date().toISOString() })
      .eq('id', reservation_id)

    // Increment sold_count for each tier
    for (const ticket of cartTickets) {
      await supabase.rpc('increment_sold_count', {
        p_tier_id: ticket.tier_id,
        p_quantity: ticket.quantity,
      })
    }

    // Record discount usage
    if (discount_code_id && user?.id) {
      await supabase.from('discount_code_usages').insert({
        discount_code_id,
        order_id,
        user_id: user.id,
        discount_amount_cents: fees.discount_cents,
      })
      await supabase.rpc('increment_discount_uses', { p_code_id: discount_code_id })
    }

    return { order_id, is_free: true }
  }

  // 9. Create payment record
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
    console.error('Payment record error:', paymentError)
    return { error: 'Failed to initialise payment' }
  }

  // 10. Create Stripe PaymentIntent
  try {
    const gateway = getDefaultGateway()
    const intentResult = await gateway.createPaymentIntent({
      amount_cents: fees.total_cents,
      currency,
      customer_email: buyer_email,
      idempotency_key,
      metadata: {
        order_id,
        event_id: event.id,
        organisation_id: event.organisation_id,
        buyer_email,
      },
    })

    // Save gateway_payment_id and client_secret
    await supabase
      .from('payments')
      .update({
        gateway_payment_id: intentResult.gateway_payment_id,
        client_secret: intentResult.client_secret,
        status: 'processing',
      })
      .eq('id', payment_id)

    // Update order with payment ID
    await supabase
      .from('orders')
      .update({ metadata: { payment_id } })
      .eq('id', order_id)

    return { client_secret: intentResult.client_secret, order_id }
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err)
    return { error: 'Payment system error. Please try again.' }
  }
}
