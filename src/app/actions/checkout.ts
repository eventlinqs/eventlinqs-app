'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { getDefaultGateway } from '@/lib/payments/gateway-factory'
import { createPlatformCharge } from '@/lib/payments/create-platform-charge'
import { buildPaymentIntentIdempotencyKey } from '@/lib/payments/idempotency'
import { ChargePreconditionError } from '@/lib/payments/application-fee'
import { validateDiscountCode } from './discount-codes'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { pickUnitPriceCents, resolveSeatUnitPriceCents } from '@/lib/checkout/pricing'
import { getGuestSessionId } from '@/lib/auth/guest-session'
import { cookies } from 'next/headers'
import {
  recordOrganiserMarketingConsent,
  recordPlatformDigestConsent,
} from '@/lib/consent/record'
import { sendConfirmationEmail } from '@/lib/email/order-confirmation'
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
  // min(0) allows seat-mode checkouts where attendee info is not collected per-seat
  attendees: z.array(AttendeeSchema).min(0),
  discount_code: z.string().optional(),
  addon_quantities: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
  // Marketing consent (Spam Act 2003). Both optional and default false: the
  // purchase succeeds whether or not they are given. Never a purchase condition.
  organiser_marketing_consent: z.boolean().optional(),
  platform_updates_consent: z.boolean().optional(),
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

/**
 * Persist marketing consent for a completed checkout. Best-effort and fully
 * isolated from the payment path: a consent write failure must never fail an
 * order. Records nothing when no box was ticked, so a no-consent purchase
 * leaves no consent (the lawful default).
 */
async function recordCheckoutConsents(params: {
  adminClient: ReturnType<typeof createAdminClient>
  organisationId: string
  organiserName: string
  email: string
  userId: string | null
  orderId: string
  eventId: string
  organiserConsent: boolean
  platformConsent: boolean
}): Promise<void> {
  const at = new Date().toISOString()
  if (params.organiserConsent) {
    await recordOrganiserMarketingConsent(params.adminClient, {
      organisationId: params.organisationId,
      organiserName: params.organiserName,
      email: params.email,
      userId: params.userId,
      orderId: params.orderId,
      eventId: params.eventId,
      source: 'checkout',
      at,
    })
  }
  if (params.platformConsent) {
    // The digest consent is city scoped (SPEC 3.1): the buyer's chosen city
    // cookie wins, falling back to the event's city. Both are validated
    // against the cities taxonomy so the FK can never fail the write.
    const citySlug = await resolveDigestCity(params.adminClient, params.eventId)
    await recordPlatformDigestConsent(params.adminClient, {
      email: params.email,
      userId: params.userId,
      citySlug,
      source: 'checkout',
      at,
    })
  }
}

/** Resolve the digest locality: el_city cookie if it is a real city, else the
 * event's primary city, else null (national digest scope decided later). */
async function resolveDigestCity(
  adminClient: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<string | null> {
  try {
    const jar = await cookies()
    const cookieCity = jar.get('el_city')?.value ?? null
    if (cookieCity) {
      const { data } = await adminClient
        .from('cities')
        .select('slug')
        .eq('slug', cookieCity)
        .maybeSingle()
      if (data?.slug) return data.slug
    }
    const { data: event } = await adminClient
      .from('events')
      .select('city_primary')
      .eq('id', eventId)
      .maybeSingle()
    return event?.city_primary ?? null
  } catch {
    return null
  }
}

export async function processCheckout(data: CheckoutFormData): Promise<CheckoutResult> {
  // Throttle by IP. Defends the PaymentIntent-creation path against card-testing
  // and repeated charge attempts even if a caller skips the reservation step.
  const rl = await actionRateLimit('checkout-reserve')
  if (!rl.ok) return { error: 'Too many attempts. Please wait a moment and try again.' }

  const parsed = CheckoutSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues
    return { error: issues[0]?.message ?? 'Invalid checkout data' }
  }

  const {
    reservation_id,
    buyer_email,
    buyer_name,
    attendees,
    discount_code,
    addon_quantities: _addon_quantities,
    organiser_marketing_consent = false,
    platform_updates_consent = false,
  } = parsed.data

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Verify reservation is still active - load via admin client so guest
  // carts (no auth session, RLS-denied) can still find their row. Ownership
  // is then enforced in app code against the guest_session cookie.
  const { data: reservation } = await adminClient
    .from('reservations')
    .select('*')
    .eq('id', reservation_id)
    .eq('status', 'active')
    .single()

  if (!reservation) {
    return { error: 'Your reservation has expired. Please select tickets again.' }
  }

  const guestSessionId = await getGuestSessionId()
  const ownedByUser = reservation.user_id && user && reservation.user_id === user.id
  const ownedByGuest = reservation.session_id && guestSessionId && reservation.session_id === guestSessionId
  if (!ownedByUser && !ownedByGuest) {
    return { error: 'Your reservation has expired. Please select tickets again.' }
  }

  if (new Date(reservation.expires_at) < new Date()) {
    return { error: 'Your reservation has expired. Please select tickets again.' }
  }

  // 2. Load event and ticket tiers
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, organisation_id, fee_pass_type')
    .eq('id', reservation.event_id)
    .single()

  if (!event) return { error: 'Event not found' }

  // Organiser name for the marketing-consent wording (names the sender, per the
  // Spam Act). Best-effort: consent recording never blocks the purchase.
  const { data: organisation } = await adminClient
    .from('organisations')
    .select('name')
    .eq('id', event.organisation_id)
    .maybeSingle()
  const organiserName = organisation?.name ?? ''

  // ── Seat reservation path ──────────────────────────────────────────────────
  // Seat reservations store items as { seat_ids: string[] } instead of the
  // GA format [ { ticket_tier_id, quantity } ].
  const rawItems = reservation.items as
    | { seat_ids: string[] }
    | { ticket_tier_id?: string; addon_id?: string; quantity: number }[]

  const isSeatReservation = !Array.isArray(rawItems) && Array.isArray((rawItems as { seat_ids?: unknown }).seat_ids)

  if (isSeatReservation) {
    const seatIds = (rawItems as { seat_ids: string[] }).seat_ids
    return await processSeatCheckout({
      reservation_id,
      reservation,
      seatIds,
      event,
      buyer_email,
      buyer_name,
      attendees,
      adminClient,
      supabase,
      organiserName,
      userId: user?.id ?? null,
      organiserConsent: organiser_marketing_consent,
      platformConsent: platform_updates_consent,
    })
  }
  // ── End seat path ──────────────────────────────────────────────────────────

  const reservationItems = rawItems as { ticket_tier_id?: string; addon_id?: string; quantity: number }[]

  const tierIds = reservationItems
    .filter(i => i.ticket_tier_id)
    .map(i => i.ticket_tier_id!)

  const { data: tiers, error: tiersError } = await supabase
    .from('ticket_tiers')
    .select('id, name, price, currency')
    .in('id', tierIds)

  if (tiersError || !tiers) {
    console.error('[checkout] Failed to load ticket tiers:', tiersError)
    return { error: 'Failed to load ticket information' }
  }

  // 3. Resolve dynamic price for each tier (locks price at reservation time)
  const dynamicPriceMap = await getDynamicPriceMap(tierIds)

  const tierMap = new Map(tiers.map(t => [t.id, t]))

  const cartTickets = reservationItems
    .filter(i => i.ticket_tier_id)
    .map(i => {
      const tier = tierMap.get(i.ticket_tier_id!)
      // FUN-01: single-sourced price rule (shared with the checkout page so
      // displayed == charged). Dynamic price overrides base.
      const unit_price_cents = pickUnitPriceCents(dynamicPriceMap.get(i.ticket_tier_id!), tier?.price)
      return {
        tier_id: i.ticket_tier_id!,
        tier_name: tier?.name ?? 'Ticket',
        quantity: i.quantity,
        unit_price_cents,
      }
    })

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
  const fees = await calculator.calculate(
    cartTickets,
    cartAddons,
    currency,
    fee_pass_type,
    discount_cents,
    event.organisation_id,
    event.id
  )

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
      // Free orders insert as 'pending' too, then confirm_order UPDATEs them to
      // 'confirmed'. Ticket issuance fires on the pending->confirmed UPDATE
      // (trigger trg_issue_tickets_on_confirm), so an inline 'confirmed' INSERT
      // would confirm the order but never issue a ticket.
      status: 'pending',
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
      confirmed_at: null,
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
    // FUN-04: fail closed. issue_tickets_for_order expands tickets FROM
    // order_items, so an order with no items confirms and issues zero tickets:
    // the buyer pays and gets nothing scannable. Roll back the just-created
    // order and abort BEFORE any PaymentIntent is created, rather than
    // swallowing the error and charging.
    console.error('Order items error, rolling back order:', itemsError)
    await adminClient.from('orders').delete().eq('id', order_id)
    return { error: 'We could not set up your order. Please try again.' }
  }

  // Record marketing consent at the point of collection (Spam Act). Tied to the
  // event's organiser and the buyer email. Best-effort, never blocks the order.
  await recordCheckoutConsents({
    adminClient,
    organisationId: event.organisation_id,
    organiserName,
    email: buyer_email,
    userId: user?.id ?? null,
    orderId: order_id,
    eventId: event.id,
    organiserConsent: organiser_marketing_consent,
    platformConsent: platform_updates_consent,
  })

  // 8. For free orders - confirm immediately, no payment and no webhook.
  if (isFreeOrder) {
    // confirm_order atomically UPDATEs the order pending->confirmed (which fires
    // the issuance trigger to mint the tickets and QR), converts the reservation,
    // and increments sold_count: exactly the paid path's confirmation gate, minus
    // the payment. This replaces the old inline reservation-convert and
    // increment_sold_count, which left a free order confirmed but ticketless.
    const { error: confirmError } = await adminClient.rpc('confirm_order', {
      p_order_id: order_id,
    })
    if (confirmError) {
      console.error('[checkout] free confirm_order error:', confirmError)
      return { error: 'Order created but could not be confirmed. Please try again.' }
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

    // Send the confirmation email with the ticket QR, exactly as the paid path
    // does after payment. Best-effort: a mail fault must never fail the order.
    try {
      await sendConfirmationEmail(adminClient, order_id, null)
    } catch (emailErr) {
      console.error('[checkout] free confirmation email failed (non-fatal):', emailErr)
    }

    return { order_id, is_free: true }
  }

  // 9. Create payment record
  const payment_id = crypto.randomUUID()
  // P2-8: composite key (order id + amount + attempt) instead of a bare
  // order id, so a corrected amount cannot replay a stale Stripe intent.
  // attempt defaults to 1; a persisted retry counter is a documented
  // follow-up (docs/TRIAD-REFACTOR-DESIGN.md section 5).
  const idempotency_key = buildPaymentIntentIdempotencyKey({
    orderId: order_id,
    amountCents: fees.total_cents,
  })

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

  // 10. Create Stripe PLATFORM charge (funds-holding model: platform is merchant
  //     of record, funds held in the platform balance until post-event transfer)
  try {
    const gateway = getDefaultGateway()
    const charge = await createPlatformCharge({
      gateway,
      organisationId: event.organisation_id,
      eventId: event.id,
      fees,
      customerEmail: buyer_email,
      idempotencyKey: idempotency_key,
      transferGroup: order_id,
      metadata: {
        order_id,
        event_id: event.id,
        organisation_id: event.organisation_id,
        buyer_email,
        reservation_id,
      },
    })
    const intentResult = charge.intent

    // Save gateway_payment_id and client_secret - use admin client so guest
    // checkouts (no auth session, RLS-denied) can persist the Stripe intent
    // id. Webhook matches payments by gateway_payment_id; if this UPDATE is
    // silently swallowed the order can never be confirmed.
    await adminClient
      .from('payments')
      .update({
        gateway_payment_id: intentResult.gateway_payment_id,
        client_secret: intentResult.client_secret,
        status: 'processing',
      })
      .eq('id', payment_id)

    // Update order with payment ID
    await adminClient
      .from('orders')
      .update({ metadata: { payment_id } })
      .eq('id', order_id)

    return { client_secret: intentResult.client_secret, order_id }
  } catch (err) {
    if (err instanceof ChargePreconditionError) {
      console.error('[checkout] Connect pre-condition failed:', err.reason, err.message)
      return { error: chargePreconditionMessage(err.reason) }
    }
    console.error('Stripe PaymentIntent error:', err)
    return { error: 'Payment system error. Please try again.' }
  }
}

function chargePreconditionMessage(reason: ChargePreconditionError['reason']): string {
  switch (reason) {
    case 'org_not_connected':
      return 'This organiser has not finished payment setup. Please try again later.'
    case 'org_charges_disabled':
      return 'This organiser cannot accept payments right now. Please try again later.'
    case 'org_payouts_restricted':
      return 'Payments for this organiser are temporarily paused. Please try again later.'
    case 'org_country_unsupported':
      return 'Payments for this region are not yet supported.'
    case 'fee_breakdown_invalid':
      return 'There was a pricing issue with this checkout. Please refresh and try again.'
  }
}

// ── Seat reservation checkout helper ──────────────────────────────────────────

interface SeatCheckoutArgs {
  reservation_id: string
  reservation: {
    id: string
    event_id: string
    expires_at: string
  }
  seatIds: string[]
  event: { id: string; title: string; slug: string | null; organisation_id: string; fee_pass_type: string | null }
  buyer_email: string
  buyer_name: string
  attendees: { ticket_tier_id: string; first_name: string; last_name: string; email: string }[]
  adminClient: ReturnType<typeof createAdminClient>
  supabase: Awaited<ReturnType<typeof createClient>>
  organiserName: string
  userId: string | null
  organiserConsent: boolean
  platformConsent: boolean
}

async function processSeatCheckout({
  reservation_id,
  reservation: _reservation,
  seatIds,
  event,
  buyer_email,
  buyer_name,
  adminClient,
  supabase,
  organiserName,
  userId,
  organiserConsent,
  platformConsent,
}: SeatCheckoutArgs): Promise<CheckoutResult> {
  // Load seats
  const { data: seats, error: seatsError } = await adminClient
    .from('seats')
    .select('id, seat_number, row_label, seat_type, status, price_cents, ticket_tier_id')
    .in('id', seatIds)
    .eq('event_id', event.id)

  if (seatsError || !seats || seats.length === 0) {
    console.error('[checkout-seats] failed to load seats:', seatsError)
    return { error: 'Failed to load seat information' }
  }

  // Verify all seats are still reserved (not sold/released)
  const unavailable = seats.filter(s => s.status !== 'reserved')
  if (unavailable.length > 0) {
    return { error: 'One or more seats are no longer available. Please start over.' }
  }

  // Get unique tier IDs from seats
  const tierIdsFromSeats = [...new Set(seats.map(s => s.ticket_tier_id).filter(Boolean) as string[])]

  // Load tiers for currency and name
  let tierMap = new Map<string, { id: string; name: string; price: number; currency: string }>()
  if (tierIdsFromSeats.length > 0) {
    const { data: tiers } = await adminClient
      .from('ticket_tiers')
      .select('id, name, price, currency')
      .in('id', tierIdsFromSeats)
    if (tiers) tierMap = new Map(tiers.map(t => [t.id, t]))
  }

  // Fallback: load first tier of the event for currency
  let fallbackTier: { id: string; name: string; price: number; currency: string } | null = null
  if (tierMap.size === 0) {
    const { data: firstTiers } = await adminClient
      .from('ticket_tiers')
      .select('id, name, price, currency')
      .eq('event_id', event.id)
      .eq('is_active', true)
      .order('sort_order')
      .limit(1)
    fallbackTier = firstTiers?.[0] ?? null
  }

  const currency = tierMap.values().next().value?.currency ?? fallbackTier?.currency ?? 'AUD'
  const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

  // Price each seat via get_current_tier_price if tier_id set; else seat.price_cents or fallback
  // FUN-03: single-sourced seat pricing (shared resolver with the checkout
  // page so displayed == charged). Tier-bound seats price by the current
  // dynamic-aware tier price; same fallback ordering on both paths.
  const seatFallbackCents = fallbackTier?.price ?? 0
  const priceResults = await Promise.all(
    seats.map(async seat => ({
      seat_id: seat.id,
      price_cents: await resolveSeatUnitPriceCents(
        seat,
        async (tierId) => {
          const { data } = await adminClient.rpc('get_current_tier_price', { p_tier_id: tierId })
          return data as number | null
        },
        seatFallbackCents,
      ),
    }))
  )

  const priceBySeatId = new Map(priceResults.map(r => [r.seat_id, r.price_cents]))

  // Build cartTickets (one "item" per unique tier, aggregated by price - for fee calculator)
  // Use the cheapest price for the fee tier if mixed
  const aggregatedForFee = [{
    tier_id: tierIdsFromSeats[0] ?? fallbackTier?.id ?? 'seat-ticket',
    tier_name: 'Reserved Seat',
    quantity: seats.length,
    unit_price_cents: Math.round(
      Array.from(priceBySeatId.values()).reduce((s, p) => s + p, 0) / seats.length
    ),
  }]

  const calculator = new PaymentCalculator()
  const computedSeatFees = await calculator.calculate(
    aggregatedForFee,
    [],
    currency,
    fee_pass_type,
    0,
    event.organisation_id,
    event.id
  )
  // FUN-03: charge the EXACT seat sum, not the rounded-average subtotal the
  // fee aggregate produces. The checkout page displays this exact-sum total, so
  // overriding here keeps displayed == charged to the cent (same override the
  // page applies).
  const exactSeatSubtotalCents = Array.from(priceBySeatId.values()).reduce((s, p) => s + p, 0)
  const fees = {
    ...computedSeatFees,
    subtotal_cents: exactSeatSubtotalCents,
    total_cents:
      exactSeatSubtotalCents +
      computedSeatFees.platform_fee_cents +
      computedSeatFees.payment_processing_fee_cents +
      computedSeatFees.tax_cents,
  }
  const isFreeOrder = fees.total_cents === 0

  // Create order
  const order_id = crypto.randomUUID()
  let order_number = generateOrderNumber()
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
      user_id: null,
      guest_email: buyer_email,
      guest_name: buyer_name,
      reservation_id,
      // Free orders insert as 'pending' too, then confirm_order UPDATEs them to
      // 'confirmed'. Ticket issuance fires on the pending->confirmed UPDATE
      // (trigger trg_issue_tickets_on_confirm), so an inline 'confirmed' INSERT
      // would confirm the order but never issue a ticket.
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
      confirmed_at: null,
    })

  if (orderError) {
    console.error('[checkout-seats] order insert failed:', orderError)
    return { error: 'Failed to create order. Please try again.' }
  }

  // Bust caches now that order exists and seat states are committed
  if (event.slug) revalidatePath(`/events/${event.slug}`)
  revalidatePath(`/dashboard/events/${event.id}/seats`)

  // Create one order_item per seat
  const orderItems = seats.map(seat => ({
    order_id,
    ticket_tier_id: seat.ticket_tier_id ?? (tierIdsFromSeats[0] ?? null),
    addon_id: null,
    item_type: 'ticket' as const,
    item_name: `Row ${seat.row_label} Seat ${seat.seat_number}${seat.seat_type !== 'standard' ? ` (${seat.seat_type})` : ''}`,
    quantity: 1,
    unit_price_cents: priceBySeatId.get(seat.id) ?? 0,
    total_cents: priceBySeatId.get(seat.id) ?? 0,
    attendee_first_name: buyer_name.split(' ')[0] ?? buyer_name,
    attendee_last_name: buyer_name.split(' ').slice(1).join(' ') ?? '',
    attendee_email: buyer_email,
    metadata: { seat_id: seat.id, row: seat.row_label, seat_number: seat.seat_number },
  }))

  const { error: itemsError } = await adminClient.from('order_items').insert(orderItems)
  if (itemsError) {
    // FUN-04: fail closed (seat path). Same rationale as the GA path: a paid
    // order with no order_items issues zero tickets. Roll back and abort before
    // any PaymentIntent / seat-sold mutation.
    console.error('[checkout-seats] order_items insert failed, rolling back order:', itemsError)
    await adminClient.from('orders').delete().eq('id', order_id)
    return { error: 'We could not set up your order. Please try again.' }
  }

  // Record marketing consent at the point of collection (Spam Act). Best-effort.
  await recordCheckoutConsents({
    adminClient,
    organisationId: event.organisation_id,
    organiserName,
    email: buyer_email,
    userId,
    orderId: order_id,
    eventId: event.id,
    organiserConsent,
    platformConsent,
  })

  if (isFreeOrder) {
    // confirm_order UPDATEs the order pending->confirmed (firing the issuance
    // trigger to mint the seat tickets and QR) and converts the reservation:
    // the same gate the paid path uses, minus payment. Without it a free
    // reserved-seating order confirmed but issued no ticket.
    const { error: confirmError } = await adminClient.rpc('confirm_order', {
      p_order_id: order_id,
    })
    if (confirmError) {
      console.error('[checkout-seats] free confirm_order error:', confirmError)
      return { error: 'Order created but could not be confirmed. Please try again.' }
    }

    // Mark seats as sold (seat-mode specific; confirm_order handles the order
    // confirmation, ticket issuance, and reservation conversion).
    await adminClient
      .from('seats')
      .update({ status: 'sold', updated_at: new Date().toISOString() })
      .in('id', seatIds)
      .eq('event_id', event.id)

    // Send the confirmation email with the ticket QR. Best-effort.
    try {
      await sendConfirmationEmail(adminClient, order_id, null)
    } catch (emailErr) {
      console.error('[checkout-seats] free confirmation email failed (non-fatal):', emailErr)
    }

    return { order_id, is_free: true }
  }

  // Paid: create payment record and Stripe PaymentIntent
  const payment_id = crypto.randomUUID()
  // P2-8: composite key, same rationale as the standard checkout flow.
  // Both flows go through buildPaymentIntentIdempotencyKey so they cannot
  // drift (docs/TRIAD-REFACTOR-DESIGN.md section 5).
  const idempotency_key = buildPaymentIntentIdempotencyKey({
    orderId: order_id,
    amountCents: fees.total_cents,
  })
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
    console.error('[checkout-seats] payment insert failed:', paymentError)
    return { error: 'Failed to initialise payment' }
  }

  try {
    const gateway = getDefaultGateway()
    const charge = await createPlatformCharge({
      gateway,
      organisationId: event.organisation_id,
      eventId: event.id,
      fees,
      customerEmail: buyer_email,
      idempotencyKey: idempotency_key,
      transferGroup: order_id,
      metadata: {
        order_id,
        event_id: event.id,
        organisation_id: event.organisation_id,
        buyer_email,
        reservation_id,
        seat_ids: JSON.stringify(seatIds),
      },
    })
    const intentResult = charge.intent

    await adminClient
      .from('payments')
      .update({
        gateway_payment_id: intentResult.gateway_payment_id,
        client_secret: intentResult.client_secret,
        status: 'processing',
      })
      .eq('id', payment_id)

    await adminClient
      .from('orders')
      .update({ metadata: { payment_id } })
      .eq('id', order_id)

    return { client_secret: intentResult.client_secret, order_id }
  } catch (err) {
    if (err instanceof ChargePreconditionError) {
      console.error('[checkout-seats] Connect pre-condition failed:', err.reason, err.message)
      return { error: chargePreconditionMessage(err.reason) }
    }
    console.error('[checkout-seats] Stripe PaymentIntent error:', err)
    return { error: 'Payment system error. Please try again.' }
  }
}
