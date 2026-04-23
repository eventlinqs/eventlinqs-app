import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StripeAdapter } from '@/lib/payments/stripe-adapter'
import { Resend } from 'resend'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { promoteWaitlist } from '@/lib/waitlist/promote'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Disable body parsing so we get the raw body for signature verification
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const adapter = new StripeAdapter()
  let event: Stripe.Event

  try {
    event = (await adapter.constructWebhookEvent(body, signature)) as Stripe.Event
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent
        // Route squad member payments to a dedicated handler to avoid double-processing
        if (intent.metadata?.squad_member_id) {
          const adminClient = createAdminClient()
          await handleSquadMemberPaymentSucceeded(adminClient, intent)
        } else {
          await handlePaymentSucceeded(supabase, intent)
        }
        break
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent
        await handlePaymentFailed(supabase, intent)
        break
      }
      case 'payment_intent.requires_action': {
        const intent = event.data.object as Stripe.PaymentIntent
        await handleRequiresAction(supabase, intent)
        break
      }
      case 'payment_intent.canceled': {
        const intent = event.data.object as Stripe.PaymentIntent
        await handlePaymentCancelled(supabase, intent)
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await handleChargeRefunded(charge)
        break
      }
      default:
        // Ignore unhandled event types
        break
    }
  } catch (err) {
    console.error(`Error processing webhook ${event.type}:`, err)
    // Return 200 anyway so Stripe doesn't retry (we log for debugging)
  }

  return NextResponse.json({ received: true })
}

async function handlePaymentSucceeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  const order_id = intent.metadata?.order_id
  if (!order_id) return

  // Webhooks have no auth session — use admin client to bypass RLS for all writes
  const adminClient = createAdminClient()

  // Idempotency: check if already completed
  const { data: payment } = await adminClient
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment || payment.status === 'completed') return

  const charge = intent.latest_charge as Stripe.Charge | null
  const receipt_url = typeof charge === 'object' && charge?.receipt_url ? charge.receipt_url : null

  // Transition payment → completed
  await adminClient.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'completed',
    p_gateway_data: { receipt_url, stripe_event_id: intent.id },
  })

  // Atomically confirm the order: sets status=confirmed, converts reservation,
  // increments sold_count, decrements reserved_count, updates discount uses.
  // NOTE: do NOT return on error — reserved-seating orders must still have seats marked sold
  // even if the confirm_order RPC fails (e.g. tier structure mismatch on seat events).
  const { error: confirmError } = await adminClient.rpc('confirm_order', {
    p_order_id: order_id,
  })
  if (confirmError) {
    console.error('[webhook] confirm_order RPC error (non-fatal, continuing):', confirmError)
  }

  // ── Mark reserved seats as sold ──────────────────────────────────────────────
  // Primary: read seat_ids from PaymentIntent metadata (set by processSeatCheckout).
  // Fallback: resolve via order → reservation → items (covers legacy intents).
  let seatIds: string[] | null = null
  let seatEventId: string | null = intent.metadata?.event_id ?? null

  const rawMetaSeatIds = intent.metadata?.seat_ids
  if (rawMetaSeatIds) {
    try {
      const parsed: unknown = JSON.parse(rawMetaSeatIds)
      if (Array.isArray(parsed) && parsed.length > 0) seatIds = parsed as string[]
    } catch {
      console.error('[webhook] Failed to parse seat_ids from metadata:', rawMetaSeatIds)
    }
  }

  // Fallback: look up order → reservation → items when metadata seat_ids absent
  if (!seatIds) {
    const reservationId = intent.metadata?.reservation_id ?? (
      await adminClient.from('orders').select('reservation_id').eq('id', order_id).single()
    ).data?.reservation_id

    if (reservationId) {
      const { data: reservationForSeats } = await adminClient
        .from('reservations')
        .select('items, event_id')
        .eq('id', reservationId)
        .single()

      if (reservationForSeats) {
        const items = reservationForSeats.items as { seat_ids?: string[] } | unknown[]
        const ids = !Array.isArray(items) && (items as { seat_ids?: string[] }).seat_ids
        if (Array.isArray(ids) && ids.length > 0) {
          seatIds = ids
          seatEventId = reservationForSeats.event_id
        }
      }
    }
  }

  if (seatIds && seatIds.length > 0 && seatEventId) {
    const { data: updatedSeats, error: seatSoldError } = await adminClient
      .from('seats')
      .update({ status: 'sold', updated_at: new Date().toISOString() })
      .in('id', seatIds)
      .eq('event_id', seatEventId)
      .eq('status', 'reserved')
      .select('id')

    if (seatSoldError) {
      console.error('[webhook] failed to mark seats as sold:', seatSoldError)
    } else {
      const updatedCount = updatedSeats?.length ?? 0
      console.log(`[webhook] seats marked sold: ${updatedCount}/${seatIds.length} (payment_intent: ${intent.id})`)
      if (updatedCount === 0) {
        // Fetch current statuses to aid debugging
        const { data: currentStatuses } = await adminClient
          .from('seats')
          .select('id, status')
          .in('id', seatIds)
        console.warn(
          '[webhook] WARNING: 0 seats updated.',
          'payment_intent_id:', intent.id,
          'expected seat_ids:', seatIds,
          'event_id:', seatEventId,
          'current statuses:', currentStatuses,
        )
      }
    }

    // Bust public event page and organiser seat view
    const { data: eventForRevalidation } = await adminClient
      .from('events')
      .select('slug')
      .eq('id', seatEventId)
      .single()
    if (eventForRevalidation?.slug) {
      revalidatePath(`/events/${eventForRevalidation.slug}`)
    }
    revalidatePath(`/dashboard/events/${seatEventId}/seats`)
  }
  // ── End seat update ──────────────────────────────────────────────────────────

  // Refresh Redis inventory cache for all affected tiers
  const { data: orderItems, error: itemsError } = await adminClient
    .from('order_items')
    .select('ticket_tier_id, ticket_tiers(event_id)')
    .eq('order_id', order_id)
    .eq('item_type', 'ticket')
    .not('ticket_tier_id', 'is', null)

  if (itemsError) {
    console.error('[webhook] Failed to load order items for cache refresh:', itemsError)
  }

  if (orderItems && orderItems.length > 0) {
    const seen = new Set<string>()
    for (const item of orderItems) {
      if (!item.ticket_tier_id) continue
      const cacheKey = `${item.ticket_tier_id}`
      if (seen.has(cacheKey)) continue
      seen.add(cacheKey)
      const tierRelation = item.ticket_tiers as { event_id: string }[] | { event_id: string } | null
      const eventId = Array.isArray(tierRelation) ? tierRelation[0]?.event_id : tierRelation?.event_id
      if (eventId) {
        // Fire-and-forget — never let cache failure break webhook response
        refreshInventoryCache(item.ticket_tier_id, eventId).catch(err => {
          console.error('[webhook] refreshInventoryCache failed:', err)
        })
      }
    }
  }

  // Send confirmation email
  await sendConfirmationEmail(adminClient, order_id, receipt_url)
}

async function handlePaymentFailed(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  // Webhook has no auth session — must use admin client for all DB operations
  const adminClient = createAdminClient()

  const { data: payment } = await adminClient
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment || payment.status === 'failed') return

  const failureMessage = intent.last_payment_error?.message ?? 'Payment failed'

  await adminClient
    .from('payments')
    .update({ status: 'failed', failure_reason: failureMessage })
    .eq('id', payment.id)

  // Release inventory and promote waitlist so held seats return to availability
  if (!payment.order_id) return

  const { data: order } = await adminClient
    .from('orders')
    .select('event_id, reservation_id')
    .eq('id', payment.order_id)
    .single()

  if (!order?.event_id) return

  // Cancel the reservation so inventory is freed
  if (order.reservation_id) {
    await adminClient
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', order.reservation_id)
      .eq('status', 'active')
  }

  const { data: failedItems } = await adminClient
    .from('order_items')
    .select('ticket_tier_id, quantity')
    .eq('order_id', payment.order_id)
    .eq('item_type', 'ticket')
    .not('ticket_tier_id', 'is', null)

  if (!failedItems || failedItems.length === 0) return

  for (const item of failedItems) {
    if (!item.ticket_tier_id) continue
    promoteWaitlist(order.event_id, item.ticket_tier_id, item.quantity).catch(err => {
      console.error('[webhook] promoteWaitlist failed after payment_failed:', err)
    })
  }
}

async function handleRequiresAction(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  // Webhook has no auth session — must use admin client for all DB operations
  const adminClient = createAdminClient()

  const { data: payment } = await adminClient
    .from('payments')
    .select('id, status')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment) return

  await adminClient.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'requires_action',
    p_gateway_data: {},
  })
}

async function handlePaymentCancelled(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  // Webhook has no auth session — must use admin client for all DB operations
  const adminClient = createAdminClient()

  const { data: payment } = await adminClient
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment) return

  await adminClient.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'cancelled',
    p_gateway_data: {},
  })

  // Release reservation
  const { data: order } = await adminClient
    .from('orders')
    .select('reservation_id')
    .eq('id', payment.order_id)
    .single()

  if (order?.reservation_id) {
    await adminClient
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', order.reservation_id)
      .eq('status', 'active')

    // Release any seat reservation — return seats to available
    const { data: reservation } = await adminClient
      .from('reservations')
      .select('items, event_id')
      .eq('id', order.reservation_id)
      .single()

    if (reservation) {
      const items = reservation.items as { seat_ids?: string[] } | unknown[]
      const seatIds = !Array.isArray(items) && (items as { seat_ids?: string[] }).seat_ids
      if (Array.isArray(seatIds) && seatIds.length > 0) {
        await adminClient
          .from('seats')
          .update({
            status: 'available',
            reservation_id: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', seatIds)
          .eq('event_id', reservation.event_id)
          .eq('status', 'reserved')

        // Bust public event page and organiser seat view so released seats become selectable again
        const { data: eventForRevalidation } = await adminClient
          .from('events')
          .select('slug')
          .eq('id', reservation.event_id)
          .single()
        if (eventForRevalidation?.slug) {
          revalidatePath(`/events/${eventForRevalidation.slug}`)
        }
        revalidatePath(`/dashboard/events/${reservation.event_id}/seats`)
      }

      // ── Waitlist promotion: release triggers next-in-line notification ────────
      // Find the cancelled order items to know which tier had inventory released
      const { data: cancelledItems } = await adminClient
        .from('order_items')
        .select('ticket_tier_id, quantity')
        .eq('order_id', payment.order_id)
        .eq('item_type', 'ticket')
        .not('ticket_tier_id', 'is', null)

      if (cancelledItems && cancelledItems.length > 0) {
        for (const item of cancelledItems) {
          if (!item.ticket_tier_id) continue
          // Fire-and-forget — never let waitlist promotion failure break webhook
          promoteWaitlist(reservation.event_id, item.ticket_tier_id, item.quantity).catch(err => {
            console.error('[webhook] promoteWaitlist failed after cancellation:', err)
          })
        }
      }
      // ── End waitlist promotion ─────────────────────────────────────────────────
    }
  }
}

async function handleSquadMemberPaymentSucceeded(
  adminClient: ReturnType<typeof createAdminClient>,
  intent: Stripe.PaymentIntent
) {
  const squadMemberId = intent.metadata?.squad_member_id
  const squadId = intent.metadata?.squad_id
  const orderId = intent.metadata?.order_id
  if (!squadMemberId || !squadId || !orderId) return

  // Idempotency: skip if already paid
  const { data: member } = await adminClient
    .from('squad_members')
    .select('id, status')
    .eq('id', squadMemberId)
    .maybeSingle()

  if (!member || member.status === 'paid') return

  // Confirm the order for this member
  const { error: orderError } = await adminClient
    .from('orders')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'pending')

  if (orderError) {
    console.error('[webhook] squad order confirm error:', orderError)
  }

  // Mark payment as completed
  const charge = intent.latest_charge as Stripe.Charge | null
  const receipt_url = typeof charge === 'object' && charge?.receipt_url ? charge.receipt_url : null

  await adminClient
    .from('payments')
    .update({ status: 'completed', completed_at: new Date().toISOString(), receipt_url })
    .eq('order_id', orderId)

  // Mark squad member as paid
  const { error: memberError } = await adminClient
    .from('squad_members')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', squadMemberId)
    .eq('status', 'invited')

  if (memberError) {
    console.error('[webhook] squad member paid update error:', memberError)
    return
  }

  // Check if all members are now paid → complete the squad
  const { data: squad } = await adminClient
    .from('squads')
    .select('id, status, total_spots, reservation_id, event_id, ticket_tier_id')
    .eq('id', squadId)
    .single()

  if (!squad || squad.status !== 'forming') return

  const { count: paidCount } = await adminClient
    .from('squad_members')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', squadId)
    .eq('status', 'paid')

  if ((paidCount ?? 0) < squad.total_spots) return

  // All members paid — complete the squad
  const { error: completeError } = await adminClient
    .from('squads')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', squadId)
    .eq('status', 'forming')

  if (completeError) {
    console.error('[webhook] squad completion error:', completeError)
    return
  }

  // Convert the shared reservation → increments sold_count for all spots
  if (squad.reservation_id) {
    await adminClient
      .from('reservations')
      .update({ status: 'converted', converted_at: new Date().toISOString() })
      .eq('id', squad.reservation_id)
      .eq('status', 'active')

    // Increment sold_count for the tier by total_spots
    await adminClient.rpc('increment_sold_count', {
      p_tier_id: squad.ticket_tier_id,
      p_quantity: squad.total_spots,
    })
  }

  // Refresh inventory cache
  refreshInventoryCache(squad.ticket_tier_id, squad.event_id).catch(err => {
    console.error('[webhook] refreshInventoryCache failed after squad completion:', err)
  })

  // Send confirmation emails to all paid members
  const { data: paidMembers } = await adminClient
    .from('squad_members')
    .select('order_id, attendee_email, guest_email, attendee_first_name')
    .eq('squad_id', squadId)
    .eq('status', 'paid')

  if (paidMembers) {
    for (const m of paidMembers) {
      if (m.order_id) {
        const memberEmail = m.attendee_email ?? m.guest_email
        await sendConfirmationEmail(adminClient, m.order_id, null).catch(err => {
          console.error('[webhook] squad confirmation email error for member:', err)
        })
      }
    }
  }

  console.log(`[webhook] squad ${squadId} completed - ${squad.total_spots} members all paid`)
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  // Webhook has no auth session — must use admin client for all DB operations
  const adminClient = createAdminClient()

  // Resolve payment_intent id from the charge object
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : (charge.payment_intent as Stripe.PaymentIntent | null)?.id

  if (!paymentIntentId) return

  const { data: payment } = await adminClient
    .from('payments')
    .select('id, order_id')
    .eq('gateway_payment_id', paymentIntentId)
    .maybeSingle()

  if (!payment?.order_id) return

  const { data: order } = await adminClient
    .from('orders')
    .select('event_id')
    .eq('id', payment.order_id)
    .single()

  if (!order?.event_id) return

  const { data: refundedItems } = await adminClient
    .from('order_items')
    .select('ticket_tier_id, quantity')
    .eq('order_id', payment.order_id)
    .eq('item_type', 'ticket')
    .not('ticket_tier_id', 'is', null)

  if (!refundedItems || refundedItems.length === 0) return

  for (const item of refundedItems) {
    if (!item.ticket_tier_id) continue
    // Fire-and-forget — never let waitlist promotion failure break webhook
    promoteWaitlist(order.event_id, item.ticket_tier_id, item.quantity).catch(err => {
      console.error('[webhook] promoteWaitlist failed after charge.refunded:', err)
    })
  }
}

async function sendConfirmationEmail(
  db: ReturnType<typeof createAdminClient>,
  order_id: string,
  receipt_url: string | null
) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { data: order } = await db
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', order_id)
    .single()

  if (!order) return

  const { data: event } = await db
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country')
    .eq('id', order.event_id)
    .single()

  if (!event) return

  const buyerEmail = order.guest_email ?? (
    order.user_id
      ? (await db.from('profiles').select('email').eq('id', order.user_id).single()).data?.email
      : null
  )

  if (!buyerEmail) return

  const resend = new Resend(resendKey)

  try {
    await resend.emails.send({
      from: 'EventLinqs <noreply@eventlinqs.com>',
      to: buyerEmail,
      subject: `Order Confirmed: ${event.title} (${order.order_number})`,
      html: buildConfirmationEmailHtml(order, event, receipt_url),
    })
  } catch (err) {
    console.error('Failed to send confirmation email:', err)
  }
}

function buildConfirmationEmailHtml(
  order: {
    order_number: string
    total_cents: number
    currency: string
    guest_name?: string
    order_items?: { item_type: string; item_name: string; quantity: number }[]
  },
  event: {
    title: string
    start_date: string
    timezone: string
    venue_name?: string | null
    venue_city?: string | null
    venue_country?: string | null
  },
  receipt_url: string | null
): string {
  const totalFormatted = (order.total_cents / 100).toFixed(2)
  const currency = order.currency.toUpperCase()

  const eventDate = new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })

  const location = [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')

  const ticketLines = (order.order_items ?? [])
    .filter(i => i.item_type === 'ticket')
    .map(i => `<li>${i.item_name}</li>`)
    .join('')

  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'}/orders/${order.order_number}/confirmation`

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1 style="color:#1A1A2E;font-size:24px;margin-bottom:4px;">Order Confirmed ✓</h1>
      <p style="color:#6B7280;margin-top:0;">Order ${order.order_number}</p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />

      <h2 style="color:#1A1A2E;font-size:18px;">${event.title}</h2>
      <p style="color:#374151;">${eventDate}</p>
      ${location ? `<p style="color:#6B7280;">${location}</p>` : ''}

      <h3 style="color:#1A1A2E;font-size:16px;margin-top:24px;">Tickets</h3>
      <ul style="color:#374151;">${ticketLines}</ul>

      <p style="font-size:18px;font-weight:bold;color:#1A1A2E;">Total paid: ${currency} ${totalFormatted}</p>

      ${receipt_url ? `<p><a href="${receipt_url}" style="color:#4A90D9;">View Stripe Receipt</a></p>` : ''}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />

      <a href="${orderUrl}"
         style="display:inline-block;background:#4A90D9;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        View Your Order
      </a>

      <p style="margin-top:32px;color:#9CA3AF;font-size:12px;">
        Your tickets will be available in your EventLinqs account once our ticketing system is fully activated.
      </p>

      <p style="color:#9CA3AF;font-size:12px;">The EventLinqs Team</p>
    </div>
  `
}
