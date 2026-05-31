import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StripeAdapter } from '@/lib/payments/stripe-adapter'
import { Resend } from 'resend'
import QRCode from 'qrcode'
import { getSiteUrl } from '@/lib/site-url'
import { formatMoney } from '@/lib/money/format'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { promoteWaitlist } from '@/lib/waitlist/promote'
import { trackTicketPurchaseCompleteServer } from '@/lib/analytics/plausible'
import { handleConnectAccountUpdated } from '@/lib/stripe/connect-handlers'
import { recordOrderConfirmedLedger } from '@/lib/payments/connect-ledger'
import {
  claimWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  WebhookProcessingError,
} from '@/lib/payments/webhook-events'
import { captureException } from '@/lib/observability/sentry'
import {
  buildRefundConfirmationHtml,
  buildRefundConfirmationSubject,
  buildRefundConfirmationText,
} from '@/lib/email/templates/refund-confirmation'
import type Stripe from 'stripe'
import type { PayoutRecordStatus } from '@/types/database'

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
    captureException(err, { scope: 'stripe-webhook', event_type: 'signature' })
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── Money path: event-level dedupe + atomic gate + retry-on-failure ──────
  // payment_intent.succeeded is the only path that returns non-2xx on
  // failure, so Stripe retries the idempotent handler on its backoff.
  // confirm_order is the authoritative gate (P2-7); the payment row is
  // marked completed only after it succeeds (P2-1); a failure is no longer
  // swallowed behind a 200 (P2-2). See docs/TRIAD-REFACTOR-DESIGN.md.
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent

    // Squad member payments keep the existing best-effort behaviour for
    // this draft (idempotent on natural keys; event-level dedupe extension
    // is a documented follow-up - design section 4.4).
    if (intent.metadata?.squad_member_id) {
      try {
        const squadAdmin = createAdminClient()
        await handleSquadMemberPaymentSucceeded(squadAdmin, intent)
      } catch (err) {
        captureException(err, {
          scope: 'stripe-webhook',
          event_type: event.type,
          event_id: event.id,
          handler: 'squad',
        })
        console.error(`Error processing webhook ${event.type} (squad):`, err)
      }
      return NextResponse.json({ received: true })
    }

    const adminClient = createAdminClient()
    const claim = await claimWebhookEvent(adminClient, event.id, event.type)
    if (claim.outcome === 'duplicate') {
      // Already fully processed by an earlier delivery. True no-op (P2-6).
      return NextResponse.json({ received: true, duplicate: true })
    }

    const supabaseMoney = await createClient()
    try {
      await handlePaymentSucceeded(supabaseMoney, intent)
      await markWebhookEventProcessed(adminClient, event.id)
      return NextResponse.json({ received: true })
    } catch (err) {
      await markWebhookEventFailed(adminClient, event.id, err)
      captureException(err, {
        scope: 'stripe-webhook',
        event_type: event.type,
        event_id: event.id,
        payment_intent_id: intent.id,
        order_id: intent.metadata?.order_id ?? null,
        retryable: err instanceof WebhookProcessingError,
      })
      console.error(`Error processing webhook ${event.type}:`, err)
      // confirm_order / transition / missing-payment failures are
      // retryable. Return 500 so Stripe redelivers; the handler is
      // idempotent (confirm_order early-returns when already confirmed,
      // the dedupe ledger skips a delivery already marked processed). An
      // unexpected post-gate throw lands here too and 500 is still safe.
      return NextResponse.json({ error: 'Processing failed, retry' }, { status: 500 })
    }
  }

  const supabase = await createClient()

  try {
    switch (event.type) {
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
      // M6 Stripe Connect: webhook scaffold (Phase 1).
      // Stub handlers log + write minimum-viable state. Business logic
      // wired in Phases 2-5 per docs/m6/m6-implementation-plan.md.
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await handleConnectAccountUpdated(account, event.id)
        break
      }
      case 'account.application.deauthorized': {
        // Stripe sends the connected account ID on event.account, not on
        // data.object (which is the Application that was deauthorized).
        await handleConnectAccountDeauthorized(event.account ?? null, event.id)
        break
      }
      case 'payout.created':
      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled': {
        const payout = event.data.object as Stripe.Payout
        await handleConnectPayoutEvent(event.type, payout, event.id)
        break
      }
      case 'transfer.created': {
        const transfer = event.data.object as Stripe.Transfer
        await handleConnectTransferCreated(transfer, event.id)
        break
      }
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute
        await handleConnectDisputeEvent(event.type, dispute, event.id)
        break
      }
      // Intentional no-op branches. These four event types remain
      // subscribed on the Stripe endpoint but carry no business action
      // on our side. We acknowledge them explicitly (rather than
      // falling into the default branch) so they show up in Vercel
      // logs as known-handled and so a future "why isn't this firing"
      // search lands on a deliberate decision rather than a silent
      // skip. Rationale per event in
      // docs/observability/stripe-webhook-subscriptions.md.
      //
      // charge.succeeded   - payment_intent.succeeded above is the
      //                      authoritative money path; the matching
      //                      charge.succeeded delivery is duplicative.
      // charge.updated     - charge-level metadata edits we do not act on.
      // checkout.session.* - we use Stripe Elements (PaymentElement) and
      //                      do not use Stripe Checkout Sessions, so these
      //                      events never originate from our flows in the
      //                      first place; subscribing keeps the endpoint
      //                      future-proof if we ever opt in to hosted
      //                      checkout.
      case 'charge.succeeded':
      case 'charge.updated':
      case 'checkout.session.completed':
      case 'checkout.session.expired':
        // No-op by design. See comment above and the subscriptions doc.
        break
      default:
        // Unknown event type. Log so an operator notices if Stripe begins
        // delivering something we did not anticipate (e.g. a new event
        // type added to the endpoint config without a matching handler).
        console.info(`[stripe-webhook] unhandled event type: ${event.type} (event ${event.id})`)
        break
    }
  } catch (err) {
    captureException(err, {
      scope: 'stripe-webhook',
      event_type: event.type,
      event_id: event.id,
    })
    console.error(`Error processing webhook ${event.type}:`, err)
    // Non-money-path events keep best-effort semantics for this draft
    // (Phase-1 Connect stubs, idempotent on natural keys): capture for
    // visibility, return 200 so Stripe does not retry the stubs.
  }

  return NextResponse.json({ received: true })
}

async function handlePaymentSucceeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  const order_id = intent.metadata?.order_id
  if (!order_id) return

  // Webhooks have no auth session - use admin client to bypass RLS for all writes
  const adminClient = createAdminClient()

  const { data: payment } = await adminClient
    .from('payments')
    .select('id, status, order_id')
    .eq('gateway_payment_id', intent.id)
    .maybeSingle()

  // P2-1/P2-2: a missing payment row is a race (checkout writes the row and
  // its gateway_payment_id before the intent is confirmable). Signal
  // retryable so Stripe redelivers, instead of swallowing it behind a 200.
  if (!payment) {
    throw new WebhookProcessingError(
      `payments row not found for gateway_payment_id ${intent.id}`,
      { context: { order_id, payment_intent_id: intent.id } }
    )
  }

  const charge = intent.latest_charge as Stripe.Charge | null
  const receipt_url = typeof charge === 'object' && charge?.receipt_url ? charge.receipt_url : null

  // ── Authoritative gate FIRST (P2-7) ──────────────────────────────────────
  // confirm_order is SECURITY DEFINER, FOR UPDATE on the order row, and
  // idempotent (early-returns TRUE when already confirmed). Ticket issuance
  // fires inside the same UPDATE. The payment is NOT marked completed until
  // this succeeds, and we no longer short-circuit on an already-completed
  // payment: that completed-guard was exactly what blocked replay recovery
  // of orders the old (payment-completed-first) ordering left unconfirmed.
  const { error: confirmError } = await adminClient.rpc('confirm_order', {
    p_order_id: order_id,
  })
  if (confirmError) {
    // Retryable: throw so POST returns non-2xx and Stripe retries the
    // idempotent handler on its backoff (P2-2).
    throw new WebhookProcessingError(
      `confirm_order failed for order ${order_id}: ${confirmError.message}`,
      { cause: confirmError, context: { order_id, payment_intent_id: intent.id } }
    )
  }

  // ── Payment status follows the gate (P2-1) ───────────────────────────────
  // Only now is the buyer-facing payment marked completed. Skip the
  // transition if a prior (buggy) delivery already completed it - the gate
  // above still ran, which is the repair for that legacy state.
  if (payment.status !== 'completed') {
    const { error: transitionError } = await adminClient.rpc('transition_payment_status', {
      p_payment_id: payment.id,
      p_new_status: 'completed',
      p_gateway_data: { receipt_url, stripe_event_id: intent.id },
    })
    if (transitionError) {
      // Order is confirmed but the payment row did not flip. Retryable: a
      // redelivery re-runs confirm_order (idempotent) then re-attempts this.
      throw new WebhookProcessingError(
        `transition_payment_status failed for payment ${payment.id}: ${transitionError.message}`,
        { cause: transitionError, context: { order_id, payment_id: payment.id } }
      )
    }
  }

  // ── Post-gate side effects ───────────────────────────────────────────────
  // Each is independently idempotent or fire-and-forget and MUST NOT throw
  // out of the handler: re-running the whole webhook to retry, say, a Redis
  // refresh would resend the confirmation email. Faults are captured.

  // M6 Phase 3: destination-charge ledger entries (organiser credit, reserve
  // hold, mirror debit, org counters). Idempotent on the ledger table.
  try {
    const ledgerResult = await recordOrderConfirmedLedger(adminClient, {
      orderId: order_id,
      stripePaymentIntentId: intent.id,
      stripeChargeId: typeof charge === 'object' && charge?.id ? charge.id : null,
    })
    if (ledgerResult.status !== 'written' && ledgerResult.status !== 'skipped_already_recorded') {
      console.warn('[webhook] connect ledger write skipped', {
        orderId: order_id,
        status: ledgerResult.status,
      })
    }
  } catch (ledgerErr) {
    captureException(ledgerErr, {
      scope: 'stripe-webhook',
      handler: 'connect-ledger',
      order_id,
      payment_intent_id: intent.id,
    })
    console.error('[webhook] connect ledger write threw (non-fatal, continuing):', ledgerErr)
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
      captureException(seatSoldError, {
        scope: 'stripe-webhook',
        handler: 'seats-sold',
        order_id,
        payment_intent_id: intent.id,
      })
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
    captureException(itemsError, {
      scope: 'stripe-webhook',
      handler: 'cache-refresh-items',
      order_id,
      payment_intent_id: intent.id,
    })
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
        // Fire-and-forget - never let cache failure break webhook response
        refreshInventoryCache(item.ticket_tier_id, eventId).catch(err => {
          console.error('[webhook] refreshInventoryCache failed:', err)
        })
      }
    }
  }

  // Send confirmation email. Wrapped so a mail/render fault cannot escape
  // the handler and trigger a Stripe retry (which would re-confirm and, on
  // a still-valid ticket, re-send). sendConfirmationEmail already swallows
  // the Resend send error internally; this guards the DB reads and QR
  // generation before it.
  try {
    await sendConfirmationEmail(adminClient, order_id, receipt_url)
  } catch (emailErr) {
    captureException(emailErr, {
      scope: 'stripe-webhook',
      handler: 'confirmation-email',
      order_id,
      payment_intent_id: intent.id,
    })
    console.error('[webhook] confirmation email threw (non-fatal, continuing):', emailErr)
  }

  // Fire Plausible purchase conversion (fire-and-forget - never block webhook).
  // Uses the confirmation page URL so the event attributes to the normal funnel.
  try {
    const { data: orderForAnalytics } = await adminClient
      .from('orders')
      .select('order_number, total_cents, currency, event_id, order_items(item_name, quantity, item_type)')
      .eq('id', order_id)
      .single()

    if (orderForAnalytics) {
      const ticketItems = (orderForAnalytics.order_items ?? []).filter(
        (i: { item_type: string }) => i.item_type === 'ticket',
      ) as { item_name: string; quantity: number }[]
      const primaryTicket = ticketItems[0]
      const totalQty = ticketItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0)
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'
      trackTicketPurchaseCompleteServer(
        `${origin}/orders/${orderForAnalytics.order_number}/confirmation`,
        {
          event_id: orderForAnalytics.event_id ?? '',
          ticket_type: primaryTicket?.item_name ?? 'Ticket',
          quantity: totalQty,
          total_amount_cents: orderForAnalytics.total_cents ?? 0,
          currency: (orderForAnalytics.currency ?? 'AUD').toUpperCase(),
        },
      ).catch(err => console.warn('[webhook] plausible purchase track failed:', err))
    }
  } catch (err) {
    captureException(err, {
      scope: 'stripe-webhook',
      handler: 'plausible-purchase',
      order_id,
      payment_intent_id: intent.id,
    })
    console.warn('[webhook] plausible purchase track setup failed:', err)
  }
}

async function handlePaymentFailed(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  intent: Stripe.PaymentIntent
) {
  // Webhook has no auth session - must use admin client for all DB operations
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
  // Webhook has no auth session - must use admin client for all DB operations
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
  // Webhook has no auth session - must use admin client for all DB operations
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

    // Release any seat reservation - return seats to available
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
          // Fire-and-forget - never let waitlist promotion failure break webhook
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
    captureException(orderError, {
      scope: 'stripe-webhook',
      handler: 'squad-order-confirm',
      order_id: orderId,
      payment_intent_id: intent.id,
    })
    console.error('[webhook] squad order confirm error:', orderError)
  } else {
    // M6 Phase 3: write destination-charge ledger entries for the squad member's order.
    try {
      const ledgerCharge = intent.latest_charge as Stripe.Charge | null
      const ledgerResult = await recordOrderConfirmedLedger(adminClient, {
        orderId,
        stripePaymentIntentId: intent.id,
        stripeChargeId:
          typeof ledgerCharge === 'object' && ledgerCharge?.id ? ledgerCharge.id : null,
      })
      if (ledgerResult.status !== 'written' && ledgerResult.status !== 'skipped_already_recorded') {
        console.warn('[webhook] squad connect ledger write skipped', {
          orderId,
          status: ledgerResult.status,
        })
      }
    } catch (ledgerErr) {
      captureException(ledgerErr, {
        scope: 'stripe-webhook',
        handler: 'squad-connect-ledger',
        order_id: orderId,
        payment_intent_id: intent.id,
      })
      console.error('[webhook] squad connect ledger write threw (non-fatal, continuing):', ledgerErr)
    }
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
    captureException(memberError, {
      scope: 'stripe-webhook',
      handler: 'squad-member-paid',
      order_id: orderId,
      payment_intent_id: intent.id,
    })
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

  // All members paid - complete the squad
  const { error: completeError } = await adminClient
    .from('squads')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', squadId)
    .eq('status', 'forming')

  if (completeError) {
    captureException(completeError, {
      scope: 'stripe-webhook',
      handler: 'squad-completion',
      order_id: orderId,
      payment_intent_id: intent.id,
    })
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
        await sendConfirmationEmail(adminClient, m.order_id, null).catch(err => {
          captureException(err, {
            scope: 'stripe-webhook',
            handler: 'squad-confirmation-email',
            order_id: m.order_id,
            payment_intent_id: intent.id,
          })
          console.error('[webhook] squad confirmation email error for member:', err)
        })
      }
    }
  }

  console.log(`[webhook] squad ${squadId} completed - ${squad.total_spots} members all paid`)
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  // Webhook has no auth session - must use admin client for all DB operations.
  const adminClient = createAdminClient()

  // The webhook is the sole money source of truth. For each Stripe refund on
  // this charge, run the atomic reconcile RPC (void tickets, return inventory,
  // reverse the ledger, release/reduce the reserve hold, set statuses). The
  // RPC is idempotent on stripe_refund_id, so webhook replays and multiple
  // refunds on one charge are both safe.
  const stripeRefunds = charge.refunds?.data ?? []
  let matchedAnyRow = false

  for (const r of stripeRefunds) {
    const { data: result, error } = await adminClient.rpc('reconcile_refund', {
      p_stripe_refund_id: r.id,
      p_charge_id: charge.id,
      p_refund_amount_cents: r.amount,
    })
    if (error) {
      // Throw so the webhook returns non-2xx and Stripe retries. reconcile_refund
      // is idempotent (already-completed -> no-op), so a retry is corrective and safe.
      captureException(error, {
        scope: 'stripe-webhook',
        handler: 'reconcile-refund',
        stripe_refund_id: r.id,
        charge_id: charge.id,
      })
      throw new Error(`reconcile_refund failed for ${r.id}: ${error.message}`)
    }
    if (result !== 'no_refund_row') matchedAnyRow = true
    if (result === 'reconciled') {
      // Side effects (waitlist promotion + per-refund email) are non-fatal: the
      // money/ticket state already persisted atomically in the RPC.
      await postReconcileSideEffects(adminClient, charge, r).catch(err => {
        captureException(err, {
          scope: 'stripe-webhook',
          handler: 'post-reconcile-side-effects',
          stripe_refund_id: r.id,
        })
        console.error('[webhook] post-reconcile side effects failed:', err)
      })
    }
  }

  // Orphan safety net: a refund created directly in Stripe with no refunds row.
  // Valid ONLY under the hard operating rule that refunds are always initiated
  // in the app, never in the Stripe dashboard. Voids tickets at the order level
  // so a refunded buyer never holds a valid QR, and sends a cumulative email.
  // No ledger reversal is possible without a refunds row.
  if (!matchedAnyRow) {
    await orphanOrderLevelVoid(adminClient, charge)
  }
}

/**
 * Waitlist promotion + per-refund confirmation email for a successfully
 * reconciled refund. Reads the refund's exact tickets so the email shows this
 * refund's amount and ticket count (not the charge's cumulative amount_refunded).
 */
async function postReconcileSideEffects(
  adminClient: ReturnType<typeof createAdminClient>,
  charge: Stripe.Charge,
  stripeRefund: Stripe.Refund,
) {
  const { data: refund } = await adminClient
    .from('refunds')
    .select('id, order_id')
    .eq('stripe_refund_id', stripeRefund.id)
    .maybeSingle()
  if (!refund?.order_id) return

  const { data: order } = await adminClient
    .from('orders')
    .select('event_id')
    .eq('id', refund.order_id)
    .maybeSingle()

  const { data: rtRows } = await adminClient
    .from('refund_tickets')
    .select('ticket_id')
    .eq('refund_id', refund.id)
  const ticketIds = (rtRows ?? []).map(row => row.ticket_id as string)
  const ticketCount = ticketIds.length

  if (order?.event_id && ticketIds.length > 0) {
    const { data: tks } = await adminClient
      .from('tickets')
      .select('ticket_tier_id')
      .in('id', ticketIds)
    const perTier = new Map<string, number>()
    for (const t of tks ?? []) {
      const tier = t.ticket_tier_id as string | null
      if (tier) perTier.set(tier, (perTier.get(tier) ?? 0) + 1)
    }
    for (const [tier, qty] of perTier) {
      promoteWaitlist(order.event_id, tier, qty).catch(err => {
        console.error('[webhook] promoteWaitlist failed after reconcile:', err)
      })
    }
  }

  await sendRefundConfirmationEmail(adminClient, refund.order_id, charge, {
    amountCents: stripeRefund.amount,
    ticketCount,
  }).catch(err => {
    captureException(err, {
      scope: 'stripe-webhook',
      handler: 'refund-confirmation-email',
      order_id: refund.order_id,
    })
    console.error('[webhook] sendRefundConfirmationEmail failed:', err)
  })
}

/**
 * Orphan path (no refunds row): order-level idempotent ticket void + waitlist +
 * cumulative email. Retained as a safety net under the in-app-only operating
 * rule. The `.not('status','in', ...)` filter makes the void a no-op on replay.
 */
async function orphanOrderLevelVoid(
  adminClient: ReturnType<typeof createAdminClient>,
  charge: Stripe.Charge,
) {
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

  const { error: voidTicketsErr } = await adminClient
    .from('tickets')
    .update({ status: 'void', refunded_at: new Date().toISOString() })
    .eq('order_id', payment.order_id)
    .not('status', 'in', '("void","refunded")')
  if (voidTicketsErr) {
    captureException(voidTicketsErr, {
      scope: 'stripe-webhook',
      handler: 'charge-refunded-orphan-void',
      order_id: payment.order_id,
      payment_intent_id: paymentIntentId,
    })
    console.error('[webhook] orphan charge.refunded: failed to void tickets for order', payment.order_id, voidTicketsErr)
  }

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
  for (const item of refundedItems ?? []) {
    if (!item.ticket_tier_id) continue
    promoteWaitlist(order.event_id, item.ticket_tier_id, item.quantity).catch(err => {
      console.error('[webhook] promoteWaitlist failed after orphan charge.refunded:', err)
    })
  }

  await sendRefundConfirmationEmail(adminClient, payment.order_id, charge).catch(err => {
    captureException(err, {
      scope: 'stripe-webhook',
      handler: 'charge-refunded-orphan-email',
      order_id: payment.order_id,
    })
    console.error('[webhook] sendRefundConfirmationEmail (orphan) failed:', err)
  })
}

// ---------------------------------------------------------------------------
// Refund confirmation email (closes AUDIT-FUNCTIONALITY-2026-05-23.md
// MEDIUM-1).
//
// Fires on every charge.refunded webhook event after the ticket void
// has persisted. Pure side-effect: no DB writes, only DB reads to
// hydrate the template props. The Resend send is wrapped in try/catch
// so a Resend outage cannot break the webhook idempotency.
//
// Partial-refund caveat: Stripe emits one charge.refunded event per
// refund, but the charge object carries `amount_refunded` as the
// cumulative refunded value. For full refunds (the dominant case at
// friends-launch) this matches the buyer's expectation exactly. For
// staggered partial refunds the buyer would see two emails, each
// showing the cumulative refunded amount at that point in time; this
// is acceptable for v1. A per-refund amount can be threaded through
// later by inspecting `charge.refunds.data[0].amount`.
// ---------------------------------------------------------------------------

async function sendRefundConfirmationEmail(
  db: ReturnType<typeof createAdminClient>,
  order_id: string,
  charge: Stripe.Charge,
  override?: { amountCents?: number; ticketCount?: number },
) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { data: order } = await db
    .from('orders')
    .select('order_number, total_cents, currency, event_id, user_id, guest_email, guest_name')
    .eq('id', order_id)
    .single()
  if (!order) return

  // Buyer email resolution mirrors sendConfirmationEmail: prefer the
  // explicit guest_email captured at checkout, fall back to the
  // profile email for logged-in buyers.
  let buyerEmail: string | null = order.guest_email ?? null
  let buyerName: string | null = order.guest_name ?? null
  if (order.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .single()
    buyerEmail = buyerEmail ?? profile?.email ?? null
    buyerName = buyerName ?? profile?.full_name ?? null
  }
  if (!buyerEmail) return

  const { data: event } = await db
    .from('events')
    .select('title, organisation_id')
    .eq('id', order.event_id)
    .single()
  if (!event) return

  // Optional organiser contact for the support line. Soft-fail to null
  // if the organisation row is unreachable; the template renders the
  // platform-support fallback in that case.
  let organiserName: string | null = null
  let organiserContactEmail: string | null = null
  if (event.organisation_id) {
    const { data: org } = await db
      .from('organisations')
      .select('name, email')
      .eq('id', event.organisation_id)
      .single()
    if (org) {
      organiserName = org.name ?? null
      organiserContactEmail = org.email ?? null
    }
  }

  // Count tickets currently in refunded/void state for this order as a
  // proxy for "tickets refunded by this event". On the first refund
  // delivery this equals the freshly-voided count; on retries it stays
  // stable (idempotent ticket void).
  const { count: refundedTicketCount } = await db
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order_id)
    .in('status', ['void', 'refunded'])

  // Prefer the per-refund overrides (in-app reconcile path) so the buyer sees
  // this refund's amount and ticket count; fall back to the charge's cumulative
  // amount_refunded and the order-level voided count (orphan path).
  const ticketCount = override?.ticketCount ?? refundedTicketCount ?? 0
  const refundAmountCents = override?.amountCents ?? charge.amount_refunded ?? order.total_cents
  const currency = (charge.currency ?? order.currency ?? 'AUD').toUpperCase()

  const resend = new Resend(resendKey)
  try {
    await resend.emails.send({
      from: 'EventLinqs <noreply@eventlinqs.com>',
      to: buyerEmail,
      replyTo: 'hello@eventlinqs.com',
      subject: buildRefundConfirmationSubject(event.title),
      html: buildRefundConfirmationHtml({
        buyerName,
        orderNumber: order.order_number,
        eventTitle: event.title,
        ticketCount,
        refundAmountCents,
        currency,
        customMessage: null,
        organiserName,
        organiserContactEmail,
      }),
      text: buildRefundConfirmationText({
        buyerName,
        orderNumber: order.order_number,
        eventTitle: event.title,
        ticketCount,
        refundAmountCents,
        currency,
        customMessage: null,
        organiserName,
        organiserContactEmail,
      }),
    })
  } catch (err) {
    // Non-fatal: match the sendConfirmationEmail pattern. Log so an
    // operator can re-drive via the Resend dashboard if necessary.
    console.error('Failed to send refund confirmation email:', err)
  }
}

// ---------------------------------------------------------------------------
// Step 5: order confirmation email.
//
// The email is the buyer's self-contained ticket and receipt. Per-ticket QR
// codes are CID-attached PNGs (not hot-linked) so the bearer secret is never
// handed to an email-image proxy, the QR renders even when remote images are
// blocked, and a baked white quiet-zone survives client dark-mode inversion.
// Refunded / void / transferred tickets never render a scannable QR.
// ---------------------------------------------------------------------------

type EmailTicket = {
  ticket_code: string
  secret: string
  holder_name: string | null
  status: string
}

type EmailOrder = {
  order_number: string
  total_cents: number
  currency: string
}

type EmailEvent = {
  title: string
  start_date: string
  timezone: string
  venue_name?: string | null
  venue_city?: string | null
  venue_country?: string | null
}

// Statuses that still admit entry and therefore carry a QR.
const QR_STATUSES = new Set(['valid', 'scanned'])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function qrCid(ticketCode: string): string {
  return `qr-${ticketCode}`
}

function deriveFirstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first.length > 0 ? first : null
}

function ticketCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'ticket' : 'tickets'}`
}

function formatEventDateLong(event: EmailEvent): string {
  return new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })
}

function formatEventDateShort(event: EmailEvent): string {
  return new Date(event.start_date).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: event.timezone,
  })
}

function venueLines(event: EmailEvent): string[] {
  const lines: string[] = []
  if (event.venue_name) lines.push(event.venue_name)
  const locality = [event.venue_city, event.venue_country].filter(Boolean).join(', ')
  if (locality) lines.push(locality)
  return lines
}

// Plain-language sentence for a ticket that no longer admits entry. Returns
// null for statuses that still carry a QR.
function invalidTicketSentence(status: string): string | null {
  if (status === 'refunded') return 'This ticket was refunded and is no longer valid.'
  if (status === 'void') return 'This ticket was cancelled and is no longer valid.'
  if (status === 'transferred') return 'This ticket was transferred and is no longer valid.'
  if (QR_STATUSES.has(status)) return null
  return 'This ticket is no longer valid.'
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
    .select('*')
    .eq('id', order_id)
    .single()

  if (!order) return

  const { data: event } = await db
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country')
    .eq('id', order.event_id)
    .single()

  if (!event) return

  let buyerEmail: string | null = order.guest_email ?? null
  let buyerName: string | null = order.guest_name ?? null
  if (order.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .single()
    buyerEmail = buyerEmail ?? profile?.email ?? null
    buyerName = buyerName ?? profile?.full_name ?? null
  }

  if (!buyerEmail) return

  const { data: ticketRows } = await db
    .from('tickets')
    .select('ticket_code, secret, holder_name, status')
    .eq('order_id', order_id)
    .order('created_at', { ascending: true })

  const tickets = (ticketRows ?? []) as EmailTicket[]

  // Generate one CID-attached QR PNG per ticket that still admits entry. The
  // PNG is built in-process (no HTTP self-fetch) and references the bearer URL,
  // identical to GET /api/tickets/[code]/qr.
  const attachments: { filename: string; content: Buffer; contentId: string }[] = []
  for (const ticket of tickets) {
    if (!QR_STATUSES.has(ticket.status)) continue
    const payload = `${getSiteUrl()}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
    const png = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
    attachments.push({
      filename: `${ticket.ticket_code}.png`,
      content: png,
      contentId: qrCid(ticket.ticket_code),
    })
  }

  const firstName = deriveFirstName(buyerName)
  const resend = new Resend(resendKey)

  try {
    await resend.emails.send({
      from: 'EventLinqs <noreply@eventlinqs.com>',
      to: buyerEmail,
      replyTo: 'hello@eventlinqs.com',
      subject: `Your tickets for ${event.title}`,
      html: buildConfirmationEmailHtml(order, event, tickets, receipt_url, firstName),
      text: buildConfirmationEmailText(order, event, tickets, receipt_url, firstName),
      attachments: attachments.length > 0 ? attachments : undefined,
    })
  } catch (err) {
    console.error('Failed to send confirmation email:', err)
  }
}

function buildConfirmationEmailHtml(
  order: EmailOrder,
  event: EmailEvent,
  tickets: EmailTicket[],
  receipt_url: string | null,
  firstName: string | null
): string {
  const siteUrl = getSiteUrl()
  const total = formatMoney(order.total_cents, order.currency)
  const eventDateLong = formatEventDateLong(event)
  const eventDateShort = formatEventDateShort(event)
  const countLabel = ticketCountLabel(tickets.length)

  const title = escapeHtml(event.title)
  const greeting = firstName
    ? `You are going to ${title}, ${escapeHtml(firstName)}.`
    : `You are going to ${title}.`

  const preheader = escapeHtml(
    `Order ${order.order_number}, ${countLabel} for ${eventDateShort}`
  )

  const venueHtml = venueLines(event)
    .map(line => `<p style="margin:0;color:#6B7280;font-size:15px;">${escapeHtml(line)}</p>`)
    .join('')

  const hr =
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />'

  const ticketBlocks = tickets
    .map(ticket => {
      const holder = escapeHtml(ticket.holder_name ?? 'Ticket holder')
      const code = escapeHtml(ticket.ticket_code)
      const invalid = invalidTicketSentence(ticket.status)

      if (invalid) {
        return `
      <div style="background:#FAFAFA;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 6px;color:#1A1A2E;font-size:16px;font-weight:600;">${holder}</p>
        <p style="margin:0;color:#6B7280;font-size:14px;">${escapeHtml(invalid)}</p>
      </div>`
      }

      const bearerUrl = `${siteUrl}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
      const note =
        ticket.status === 'scanned'
          ? 'This ticket has already been scanned.'
          : 'Show this QR at entry. One QR admits one person.'
      const alt = escapeHtml(
        `QR code for ${event.title} ticket ${ticket.ticket_code}, holder ${ticket.holder_name ?? 'ticket holder'}`
      )

      return `
      <div style="background:#FFFFFF;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 12px;color:#1A1A2E;font-size:16px;font-weight:600;">${holder}</p>
        <div style="display:inline-block;background:#FFFFFF;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <img src="cid:${qrCid(ticket.ticket_code)}" width="220" height="220" alt="${alt}" style="display:block;width:220px;height:220px;border:0;background:#FFFFFF;" />
        </div>
        <p style="margin:14px 0 4px;color:#1A1A2E;font-size:15px;font-family:monospace;letter-spacing:1px;">${code}</p>
        <p style="margin:0 0 16px;">
          <a href="${bearerUrl}" style="display:inline-block;background:#4A90D9;color:#FFFFFF;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Open ticket</a>
        </p>
        <p style="margin:0;color:#6B7280;font-size:13px;">${note}</p>
      </div>`
    })
    .join('')

  const receiptHtml = receipt_url
    ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(receipt_url)}" style="color:#4A90D9;font-size:14px;">View your Stripe receipt</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<style>:root { color-scheme: light; supported-color-schemes: light; }</style>
</head>
<body style="margin:0;padding:0;background-color:#FAFAFA;color:#1A1A2E;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;color:#1A1A2E;font-family:Helvetica,Arial,sans-serif;">

  <p style="margin:0 0 20px;font-size:18px;font-weight:800;letter-spacing:2px;color:#1A1A2E;">EVENTLINQS</p>

  <h1 style="margin:0 0 8px;color:#1A1A2E;font-size:22px;">${greeting}</h1>
  <p style="margin:0;color:#374151;font-size:15px;">Your order is confirmed and your ticket is ready below. No app needed.</p>

  ${hr}

  <h2 style="margin:0 0 8px;color:#1A1A2E;font-size:18px;">${title}</h2>
  <p style="margin:0 0 4px;color:#374151;font-size:15px;">${escapeHtml(eventDateLong)}</p>
  ${venueHtml}
  <p style="margin:12px 0 0;color:#6B7280;font-size:14px;">Order ${escapeHtml(order.order_number)}</p>
  <p style="margin:2px 0 0;color:#6B7280;font-size:14px;">${escapeHtml(countLabel)}</p>

  ${hr}

  <p style="margin:0 0 4px;color:#1A1A2E;font-size:13px;font-weight:700;letter-spacing:1px;">YOUR TICKETS</p>
  ${ticketBlocks}

  ${hr}

  <p style="margin:0;color:#1A1A2E;font-size:17px;font-weight:700;">Total paid: ${escapeHtml(total)}</p>
  ${receiptHtml}

  ${hr}

  <p style="margin:0 0 10px;color:#374151;font-size:14px;">Any questions, just reply to this email and a real person will help you.</p>
  <p style="margin:0;color:#6B7280;font-size:13px;">Lost this email? Your tickets are always at <a href="${siteUrl}/tickets" style="color:#4A90D9;">eventlinqs.com/tickets</a> when you are signed in, or use a ticket link above.</p>

  ${hr}

  <p style="margin:0 0 12px;color:#6B7280;font-size:13px;">This email is your receipt.</p>

  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">The EventLinqs team. The ticketing platform built for every culture.</p>
  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">Refunds are handled under our refund policy: <a href="${siteUrl}/legal/refunds" style="color:#9CA3AF;">eventlinqs.com/legal/refunds</a></p>
  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">EventLinqs (Lawal Adams), ABN 30 837 447 587, Geelong VIC, Australia.</p>
  <p style="margin:0;color:#9CA3AF;font-size:12px;">You received this because you bought tickets on EventLinqs.</p>

</div>
</body>
</html>`
}

function buildConfirmationEmailText(
  order: EmailOrder,
  event: EmailEvent,
  tickets: EmailTicket[],
  receipt_url: string | null,
  firstName: string | null
): string {
  const siteUrl = getSiteUrl()
  const rule = '='.repeat(60)
  const greeting = firstName
    ? `You are going to ${event.title}, ${firstName}.`
    : `You are going to ${event.title}.`

  const lines: string[] = []
  lines.push('EVENTLINQS')
  lines.push('')
  lines.push(greeting)
  lines.push('Your order is confirmed and your ticket is ready below. No app needed.')
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push(event.title)
  lines.push(formatEventDateLong(event))
  for (const line of venueLines(event)) lines.push(line)
  lines.push(`Order ${order.order_number}`)
  lines.push(ticketCountLabel(tickets.length))
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('YOUR TICKETS')
  for (const ticket of tickets) {
    lines.push('')
    lines.push(ticket.holder_name ?? 'Ticket holder')
    const invalid = invalidTicketSentence(ticket.status)
    if (invalid) {
      lines.push(invalid)
      continue
    }
    const bearerUrl = `${siteUrl}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
    lines.push(`Ticket code: ${ticket.ticket_code}`)
    lines.push(`Open your ticket: ${bearerUrl}`)
    lines.push(
      ticket.status === 'scanned'
        ? 'This ticket has already been scanned.'
        : 'Show the QR on that page at entry. One QR admits one person.'
    )
  }
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push(`Total paid: ${formatMoney(order.total_cents, order.currency)}`)
  if (receipt_url) lines.push(`Stripe receipt: ${receipt_url}`)
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('Any questions, just reply to this email and a real person will help you.')
  lines.push(
    `Lost this email? Your tickets are always at ${siteUrl}/tickets when you are signed in, or use a ticket link above.`
  )
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('This email is your receipt.')
  lines.push('')
  lines.push('The EventLinqs team. The ticketing platform built for every culture.')
  lines.push(`Refund policy: ${siteUrl}/legal/refunds`)
  lines.push('EventLinqs (Lawal Adams), ABN 30 837 447 587, Geelong VIC, Australia.')
  lines.push('You received this because you bought tickets on EventLinqs.')

  return lines.join('\n')
}

// =====================================================================
// M6 Stripe Connect: Phase 1 webhook scaffold.
//
// These handlers log incoming Connect events and write minimum-viable
// state. Real business logic (tier promotion, reserve calculation,
// dispute evidence pack, refund cost allocation) lands in Phases 2-5.
// See docs/m6/m6-implementation-plan.md.
//
// Idempotency: Stripe re-delivers events on retry. Each handler treats
// the event.id as the natural dedupe key. For Phase 1 the writes are
// upserts on natural keys (stripe_account_id, stripe_payout_id) so
// re-delivery is safe.
// =====================================================================

async function handleConnectAccountDeauthorized(accountId: string | null, eventId: string) {
  if (!accountId) {
    console.warn('[m6] account.application.deauthorized missing event.account', { eventId })
    return
  }

  const adminClient = createAdminClient()

  // Capture the org id and previous tier before clearing fields so the
  // audit log keeps a trace of what was demoted.
  const { data: prevOrg } = await adminClient
    .from('organisations')
    .select('id, payout_tier')
    .eq('stripe_account_id', accountId)
    .maybeSingle()

  const { error } = await adminClient
    .from('organisations')
    .update({
      stripe_account_id: null,
      stripe_onboarding_complete: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_capabilities: {},
      stripe_requirements: {},
      payout_destination: null,
      payout_status: 'restricted',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', accountId)

  if (error) {
    console.error('[m6] account.application.deauthorized update failed', { eventId, accountId, error })
    return
  }

  if (prevOrg?.id) {
    const { error: logError } = await adminClient.from('tier_progression_log').insert({
      organisation_id: prevOrg.id,
      from_tier: prevOrg.payout_tier,
      to_tier: prevOrg.payout_tier,
      reason: 'admin_demotion',
      triggered_by: null,
      metadata: {
        webhook_event_id: eventId,
        stripe_account_id: accountId,
        cause: 'account.application.deauthorized',
      },
    })
    if (logError) {
      console.error('[m6] deauthorized tier log insert failed', {
        eventId,
        orgId: prevOrg.id,
        error: logError,
      })
    }
  }
}

async function handleConnectPayoutEvent(
  eventType: 'payout.created' | 'payout.paid' | 'payout.failed' | 'payout.canceled',
  payout: Stripe.Payout,
  eventId: string
) {
  const adminClient = createAdminClient()

  // Connected account ID arrives on the event-level account field, not on
  // payout. Phase 2+ will refactor to thread it through; for Phase 1 the
  // stub upserts on stripe_payout_id which is globally unique within Stripe.
  const status: PayoutRecordStatus = (() => {
    switch (eventType) {
      case 'payout.created':
        return 'pending'
      case 'payout.paid':
        return 'paid'
      case 'payout.failed':
        return 'failed'
      case 'payout.canceled':
        return 'canceled'
    }
  })()

  // Look up the organisation by stripe_account_id (set on connected account
  // creation in Phase 2). Phase 1 may have no row yet; the lookup tolerates
  // a miss and logs.
  const destinationAccountId = typeof payout.destination === 'string'
    ? payout.destination
    : payout.destination?.id ?? null

  if (!destinationAccountId) {
    console.warn('[m6] payout event missing destination', { eventId, eventType, payoutId: payout.id })
    return
  }

  const { data: org } = await adminClient
    .from('organisations')
    .select('id')
    .eq('payout_destination', destinationAccountId)
    .maybeSingle()

  if (!org) {
    console.info('[m6] payout event for unmapped account, ignored in Phase 1', {
      eventId,
      payoutId: payout.id,
      destinationAccountId,
    })
    return
  }

  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString()
    : null

  const { error } = await adminClient
    .from('payouts')
    .upsert(
      {
        organisation_id: org.id,
        stripe_payout_id: payout.id,
        amount_cents: payout.amount,
        currency: payout.currency,
        arrival_date: arrivalDate,
        status,
        failure_reason: payout.failure_message ?? null,
        metadata: { last_event: eventType, last_event_id: eventId },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_payout_id' }
    )

  if (error) {
    console.error('[m6] payout upsert failed', { eventId, eventType, payoutId: payout.id, error })
  }
}

async function handleConnectTransferCreated(transfer: Stripe.Transfer, eventId: string) {
  // Phase 1 stub: log only. We use destination charges (not separate
  // charges + transfers) so transfer.created is informational. Phase 5
  // wires this if the architecture ever changes.
  console.info('[m6] transfer.created received', {
    eventId,
    transferId: transfer.id,
    amount: transfer.amount,
    currency: transfer.currency,
    destination: typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id,
  })
}

async function handleConnectDisputeEvent(
  eventType: 'charge.dispute.created' | 'charge.dispute.closed',
  dispute: Stripe.Dispute,
  eventId: string
) {
  // Phase 1 stub: log only. Phase 5 implements the freeze + evidence pack
  // + 50/50 fee allocation flow per §1.8 of the implementation plan.
  console.info('[m6] dispute event received', {
    eventId,
    eventType,
    disputeId: dispute.id,
    chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
    amount: dispute.amount,
    status: dispute.status,
    reason: dispute.reason,
  })
}
