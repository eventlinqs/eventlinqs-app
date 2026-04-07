import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { StripeAdapter } from '@/lib/payments/stripe-adapter'
import { Resend } from 'resend'
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
        await handlePaymentSucceeded(supabase, intent)
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

  // Idempotency: check if already completed
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment || payment.status === 'completed') return

  const charge = intent.latest_charge as Stripe.Charge | null
  const receipt_url = typeof charge === 'object' && charge?.receipt_url ? charge.receipt_url : null

  // Transition payment → completed
  await supabase.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'completed',
    p_gateway_data: { receipt_url, stripe_event_id: intent.id },
  })

  // Confirm order
  const { data: order } = await supabase
    .from('orders')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', order_id)
    .select('*, order_items(*)')
    .single()

  if (!order) return

  // Convert reservation
  if (order.reservation_id) {
    await supabase
      .from('reservations')
      .update({ status: 'converted', converted_at: new Date().toISOString() })
      .eq('id', order.reservation_id)
  }

  // Increment sold counts
  const ticketItems = (order.order_items ?? []).filter(
    (i: { item_type: string }) => i.item_type === 'ticket'
  )

  // Group by tier
  const tierQuantities = new Map<string, number>()
  for (const item of ticketItems) {
    if (item.ticket_tier_id) {
      tierQuantities.set(item.ticket_tier_id, (tierQuantities.get(item.ticket_tier_id) ?? 0) + item.quantity)
    }
  }

  for (const [tier_id, quantity] of tierQuantities) {
    await supabase.rpc('increment_sold_count', { p_tier_id: tier_id, p_quantity: quantity })
  }

  // Record discount usage
  if (order.discount_code_id) {
    await supabase.rpc('increment_discount_uses', { p_code_id: order.discount_code_id })

    if (order.user_id) {
      await supabase.from('discount_code_usages').upsert({
        discount_code_id: order.discount_code_id,
        order_id,
        user_id: order.user_id,
        discount_amount_cents: order.discount_cents,
      })
    }
  }

  // Send confirmation email
  await sendConfirmationEmail(supabase, order_id, receipt_url)
}

async function handlePaymentFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment || payment.status === 'failed') return

  const failureMessage = intent.last_payment_error?.message ?? 'Payment failed'

  await supabase
    .from('payments')
    .update({ status: 'failed', failure_reason: failureMessage })
    .eq('id', payment.id)
}

async function handleRequiresAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment) return

  await supabase.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'requires_action',
    p_gateway_data: {},
  })
}

async function handlePaymentCancelled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  if (!payment) return

  await supabase.rpc('transition_payment_status', {
    p_payment_id: payment.id,
    p_new_status: 'cancelled',
    p_gateway_data: {},
  })

  // Release reservation
  const { data: order } = await supabase
    .from('orders')
    .select('reservation_id')
    .eq('id', payment.order_id)
    .single()

  if (order?.reservation_id) {
    await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', order.reservation_id)
      .eq('status', 'active')
  }
}

async function sendConfirmationEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  order_id: string,
  receipt_url: string | null
) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', order_id)
    .single()

  if (!order) return

  const { data: event } = await supabase
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country')
    .eq('id', order.event_id)
    .single()

  if (!event) return

  const buyerEmail = order.guest_email ?? (
    order.user_id
      ? (await supabase.from('profiles').select('email').eq('id', order.user_id).single()).data?.email
      : null
  )

  if (!buyerEmail) return

  const resend = new Resend(resendKey)

  try {
    await resend.emails.send({
      from: 'EventLinqs <noreply@eventlinqs.com>',
      to: buyerEmail,
      subject: `Order Confirmed: ${event.title} — ${order.order_number}`,
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

      <p style="color:#9CA3AF;font-size:12px;">— The EventLinqs Team</p>
    </div>
  `
}
