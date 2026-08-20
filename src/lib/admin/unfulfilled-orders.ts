import 'server-only'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'

/**
 * MONEY TAKEN, NO TICKET: finding it, and paying the buyer back in one click.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE THIS EXISTS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two changes on 2026-08-19 made an oversell impossible and, deliberately, left a
 * recoverable bad state in its place:
 *
 *   20260819000003  a payment landing after its 10 minute hold expired now
 *                   RE-ACQUIRES the seat, and if the tier is sold out it RAISES
 *                   rather than minting a ticket for somebody else's seat.
 *   20260819000004  a refunded or cancelled order can no longer confirm at all.
 *
 * Refusing was the right call: a paid order with no ticket is a refund, and a
 * refund is a solved problem here, whereas two people on one seat cannot be undone
 * at the door. But the buyer has been charged and has nothing, and until now the
 * only thing that noticed was the drift watchdog's email. Founder ruling: build the
 * surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY STRIPE HAS TO BE ASKED, AND WHY THE DATABASE ALONE CANNOT ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting query is `orders.status = 'pending' AND payments.gateway_payment_id
 * IS NOT NULL`. That is wrong, and it is wrong in the direction that would put
 * innocent rows in front of an operator with a Refund button next to them.
 *
 * Checkout writes the payments row and its `gateway_payment_id` BEFORE the buyer
 * pays (src/app/actions/checkout.ts), and `payments.status` only becomes
 * `completed` AFTER confirm_order succeeds. So a pending order with an intent id
 * and a non-completed payment is the signature of BOTH:
 *
 *   - a buyer who was charged and whose confirmation failed        (money taken)
 *   - a buyer who opened checkout and closed the tab               (nothing taken)
 *
 * and the second is by far the more common. Only the payment processor knows which
 * is which, so every candidate is checked against Stripe and only intents Stripe
 * reports as `succeeded` with an unrefunded amount are returned.
 *
 * The candidate set is bounded and small, so the per-row Stripe read is affordable
 * here in a way it would not be on the checkout path.
 */

const STRIPE_API_VERSION = '2026-03-25.dahlia'

/**
 * How long an order may sit pending before it is a candidate. Long enough that a
 * buyer still typing their card is never listed, short enough that a real one is
 * found the same day.
 */
const GRACE_MINUTES = 15

/** Never scan the whole table: a bounded window keeps the Stripe reads bounded too. */
const MAX_CANDIDATES = 200

export interface UnfulfilledOrder {
  orderId: string
  orderNumber: string
  createdAt: string
  buyerEmail: string | null
  totalCents: number
  currency: string
  eventTitle: string | null
  eventId: string | null
  paymentIntentId: string
  /** What Stripe says was actually captured, which may differ from the order total. */
  capturedCents: number
  alreadyRefundedCents: number
  ticketCount: number
}

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION })
}

/**
 * Orders where the buyer was charged and holds no ticket.
 *
 * Returns `{ ok: false }` when Stripe cannot be reached, rather than an empty list.
 * An empty list reads as "nothing is wrong", and the one thing this surface must
 * never do is show a clean page while a buyer is out of pocket.
 */
export async function listUnfulfilledPaidOrders(): Promise<
  | { ok: true; rows: UnfulfilledOrder[]; candidatesChecked: number }
  | { ok: false; reason: 'stripe_unconfigured' | 'stripe_error'; detail: string }
> {
  const stripe = stripeClient()
  if (!stripe) return { ok: false, reason: 'stripe_unconfigured', detail: 'STRIPE_SECRET_KEY is not set' }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString()

  // ONE STRING LITERAL, DELIBERATELY, EVEN THOUGH IT IS LONG. The Supabase client
  // infers the row type by parsing this select as a literal type. Split it with a
  // `+` and TypeScript widens it to `string`, the parse fails, and every field on
  // the result degrades to `GenericStringError`. Written as two concatenated halves
  // it typechecked as nothing at all; that is what the interrupted version did.
  const { data: candidates, error } = await admin
    .from('orders')
    .select('id, order_number, status, total_cents, currency, guest_email, created_at, event_id, events(title), payments(gateway_payment_id, status, created_at)')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES)

  if (error) return { ok: false, reason: 'stripe_error', detail: `orders query failed: ${error.message}` }

  const rows: UnfulfilledOrder[] = []
  let checked = 0

  for (const o of candidates ?? []) {
    const payments = (Array.isArray(o.payments) ? o.payments : o.payments ? [o.payments] : []) as Array<{
      gateway_payment_id: string | null
      status: string
      created_at: string
    }>
    const withIntent = payments.filter(p => p.gateway_payment_id)
    if (withIntent.length === 0) continue

    // Newest intent for the order: a retried checkout writes more than one, and
    // PostgREST gives no ordering guarantee on an embedded array, so sort rather
    // than trusting the position it happened to arrive in.
    const intentId = withIntent
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .at(-1)!.gateway_payment_id as string
    checked += 1

    let intent: Stripe.PaymentIntent
    try {
      intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] })
    } catch (err) {
      // One unreadable intent must not hide the rest. Report it and carry on.
      captureException(err, { scope: 'admin-unfulfilled-orders', payment_intent_id: intentId, order_id: o.id })
      continue
    }

    if (intent.status !== 'succeeded') continue

    const charge = intent.latest_charge as Stripe.Charge | null
    const captured = typeof charge === 'object' && charge ? charge.amount_captured ?? charge.amount : (intent.amount_received ?? 0)
    const refunded = typeof charge === 'object' && charge ? charge.amount_refunded ?? 0 : 0
    // Fully refunded already: the buyer is square, so this is not outstanding.
    if (captured <= 0 || refunded >= captured) continue

    const { count: ticketCount } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', o.id)

    // A pending order that somehow HAS tickets is a different problem and must not
    // be offered a one-click refund from here: refunding it would need the ticket
    // and inventory path, which is what the ordinary refund surface is for.
    if ((ticketCount ?? 0) > 0) continue

    const ev = (Array.isArray(o.events) ? o.events[0] : o.events) as { title: string | null } | null

    rows.push({
      orderId: o.id as string,
      orderNumber: o.order_number as string,
      createdAt: o.created_at as string,
      buyerEmail: (o.guest_email as string | null) ?? null,
      totalCents: Number(o.total_cents ?? 0),
      currency: (o.currency as string) ?? 'AUD',
      eventTitle: ev?.title ?? null,
      eventId: (o.event_id as string | null) ?? null,
      paymentIntentId: intentId,
      capturedCents: captured,
      alreadyRefundedCents: refunded,
      ticketCount: ticketCount ?? 0,
    })
  }

  return { ok: true, rows, candidatesChecked: checked }
}

export type SettleResult =
  | { ok: true; refundId: string; amountCents: number }
  | { ok: false; error: string }

/**
 * Refund the buyer and close the order.
 *
 * WHY THIS DOES NOT GO THROUGH create_refund_request, which is the obvious reuse.
 * That RPC exists for refunding TICKETS: it requires the order to be `confirmed` or
 * `partially_refunded`, it requires at least one refundable ticket, and it allocates
 * the amount across the tickets selected. This order has none of that. It is
 * `pending` and no ticket was ever issued, which is precisely why the buyer needs
 * their money back. Forcing it through that path would mean relaxing its
 * preconditions, and those preconditions are what stop a refund being invented for
 * an order that never sold anything.
 *
 * So this refunds the intent directly and closes the order as `cancelled`. Nothing
 * else needs undoing, and each omission is deliberate:
 *
 *   - no tickets to void        none were ever issued (asserted below, not assumed)
 *   - no inventory to return    confirm_order refused BEFORE taking the seat
 *   - no ledger to reverse      no `order_confirmed` row was ever written
 *
 * IDEMPOTENT on the Stripe side through an idempotency key derived from the order,
 * so a double-click cannot refund twice.
 */
export async function settleUnfulfilledOrder(
  orderId: string,
  actorId: string,
): Promise<SettleResult> {
  const stripe = stripeClient()
  if (!stripe) return { ok: false, error: 'Payments are not configured on this deployment.' }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, status, currency')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: 'That order could not be found.' }
  if (order.status !== 'pending') {
    return {
      ok: false,
      error: `This order is ${String(order.status).replace(/_/g, ' ')}, not pending, so it is not in the unfulfilled state. Reload the list.`,
    }
  }

  // ASSERTED, not assumed. If a ticket exists, the buyer holds something and this is
  // the wrong tool: the ordinary refund surface voids the ticket and returns the seat.
  const { count: ticketCount } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
  if ((ticketCount ?? 0) > 0) {
    return {
      ok: false,
      error: 'This order has tickets, so refund it from the order page instead. That path voids the ticket and returns the seat.',
    }
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, gateway_payment_id')
    .eq('order_id', orderId)
    .not('gateway_payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!payment?.gateway_payment_id) {
    return { ok: false, error: 'No payment is recorded against this order, so there is nothing to refund.' }
  }

  let refund: Stripe.Refund
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: payment.gateway_payment_id,
        reason: 'requested_by_customer',
        metadata: {
          order_id: orderId,
          initiated_by: 'admin',
          // Stamped onto the Stripe object as well as the audit log, so the trail
          // survives somebody reading the refund in the Stripe dashboard with no
          // access to ours.
          initiated_by_admin_id: actorId,
          platform_reason: 'unfulfilled_paid_order',
        },
      },
      // Derived from the order, so a double-click or a retry reuses the key rather
      // than refunding twice.
      { idempotencyKey: `unfulfilled-settle:${orderId}` },
    )
  } catch (err) {
    captureException(err, {
      scope: 'admin-unfulfilled-orders',
      handler: 'settle',
      order_id: orderId,
      payment_intent_id: payment.gateway_payment_id,
    })
    return {
      ok: false,
      error: 'The payment system would not process this refund. No money has moved. Try again shortly, and check the Stripe dashboard if it happens twice.',
    }
  }

  // Close the order. `cancelled` is the honest terminal state: it was never
  // confirmed, so it was never sold, and calling it `refunded` would imply a sale
  // that the ledger has no record of.
  const { error: closeError } = await admin
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'pending')
  if (closeError) {
    // The money IS back with the buyer, which is the part that matters. Say so
    // rather than reporting a failure that would invite a second refund attempt.
    captureException(closeError, { scope: 'admin-unfulfilled-orders', handler: 'settle-close', order_id: orderId })
    return {
      ok: false,
      error: `The refund of ${(refund.amount / 100).toFixed(2)} went through, but the order could not be closed. Do NOT refund again; reload and check its status.`,
    }
  }

  return { ok: true, refundId: refund.id, amountCents: refund.amount }
}
