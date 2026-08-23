import { REFUND_ARRIVAL_WINDOW } from './arrival-timeframe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requestTicketRefund } from '@/lib/payments/refund-service'
import {
  evaluateRefundEligibility,
  policyFromEvent,
  type RefundEligibility,
} from './policy'

/**
 * THE BUYER'S REFUND REQUEST, AND THE AUTOMATIC DECISION ON IT.
 *
 * ONE REFUND PATH, TWO TRIGGERS. An approved request does NOT get its own way of
 * moving money. It calls `requestTicketRefund`, the same function the organiser's
 * dashboard button calls, which creates the atomic refund intent and fires the
 * Stripe refund, and the Stripe webhook then reconciles it exactly as before.
 * The only difference between an organiser refund and an auto-approved one is the
 * value of `initiator`. A second refund path is the single most dangerous thing
 * that could be added to this codebase, because it would be a second place that
 * decides how much money to return.
 *
 * WHY AUTO-APPROVAL IS SAFE HERE AND IS NOT AT HUMANITIX. Their help centre is
 * explicit that once an event is paid out, "Humanitix no longer holds these
 * funds. You will need to arrange a refund with the ticket buyer directly i.e.
 * through a bank transfer."
 * (https://help.humanitix.com/en/articles/8892723-refund-and-cancel-tickets)
 * EventLinqs is the merchant of record and the money settles to, and is HELD in,
 * the platform balance until a post-event transfer releases it
 * (src/lib/payments/create-platform-charge.ts, payout_schedule defaults to
 * post_event_only). So for the whole pre-event window, which is when essentially
 * every refund request happens, the funds are demonstrably still ours to return.
 * That is verified in code, not assumed, and the funds check below still runs
 * rather than trusting the model.
 */

export type RefundRequestStatus =
  | 'submitted' | 'approved' | 'declined' | 'refunded' | 'cancelled' | 'failed'

export interface CreateRefundRequestInput {
  orderId: string
  ticketIds: string[]
  requesterId: string | null
  requesterEmail: string
  buyerMessage?: string | null
}

export type CreateRefundRequestResult =
  | { ok: true; requestId: string; status: RefundRequestStatus; autoApproved: boolean; message: string }
  | { ok: false; reason: string; message: string }

interface OrderContext {
  order: {
    id: string
    status: string
    total_cents: number
    event_id: string
    organisation_id: string
    user_id: string | null
    guest_email: string | null
    currency: string
  }
  event: {
    id: string
    title: string
    status: string
    start_date: string
    refund_policy_type: string | null
    refund_policy_days: number | null
    refund_policy_absorb_fee: boolean | null
    refund_policy_self_service: boolean | null
    /**
     * The postponed-event ladder needs both of these. Selected here, and named
     * in this type, so a future edit that drops them from the query fails the
     * typecheck rather than silently reverting every postponed event to the
     * organiser's ordinary refund policy.
     */
    postponed_at?: string | null
    rescheduled_at?: string | null
  }
  liveTicketIds: string[]
  hasOpenRequest: boolean
}

/**
 * Everything the decision needs, read once. Read in one place so the eligibility
 * call cannot be handed a half-populated picture by one caller and a full one by
 * another.
 */
export async function loadOrderContext(
  admin: SupabaseClient,
  orderId: string,
): Promise<OrderContext | null> {
  const { data: order } = await admin
    .from('orders')
    .select('id, status, total_cents, event_id, organisation_id, user_id, guest_email, currency')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return null

  /*
   * ORDERING SAFETY: THIS CODE MUST NOT BREAK IF IT SHIPS BEFORE ITS MIGRATION.
   *
   * `postponed_at` and `rescheduled_at` arrive in migration
   * 20260823000002_postponed_event_ladder.sql. If this code reaches an
   * environment where that migration has not been applied, PostgREST answers
   * the select with 42703 (undefined_column) and `event` comes back null, which
   * would make loadOrderContext return null and take EVERY REFUND REQUEST on
   * the platform down, not merely the postponed ones.
   *
   * That is not a hypothetical ordering: migrations on this project are applied
   * by the founder, by hand, and deliberately not by the deploy. So the query
   * degrades instead of failing. Without the columns the ladder still works for
   * a currently-postponed event, because evaluatePostponement keys rung 1 off
   * `eventStatus === 'postponed'` and needs the timestamps only to tell a
   * 90-day-old postponement from a fresh one and to spot a reschedule.
   *
   * The fallback logs loudly rather than silently, because a platform running
   * on the degraded path should be visible, and it disappears by itself the
   * moment the migration lands.
   */
  const EVENT_COLUMNS_BASE =
    'id, title, status, start_date, refund_policy_type, refund_policy_days, refund_policy_absorb_fee, refund_policy_self_service'
  const EVENT_COLUMNS_WITH_LADDER = `${EVENT_COLUMNS_BASE}, postponed_at, rescheduled_at`

  let { data: event, error: eventError } = await admin
    .from('events')
    .select(EVENT_COLUMNS_WITH_LADDER)
    .eq('id', order.event_id)
    .maybeSingle()

  if (eventError && eventError.code === '42703') {
    console.error(
      '[refunds] events.postponed_at / rescheduled_at are missing. Apply migration ' +
        '20260823000002_postponed_event_ladder.sql. Refunds are running on the degraded ' +
        'path: a postponed event is still always refundable, but a reschedule cannot be ' +
        'detected and the 90-day escalation cannot be measured.',
    )
    const retry = await admin
      .from('events')
      .select(EVENT_COLUMNS_BASE)
      .eq('id', order.event_id)
      .maybeSingle()
    event = retry.data as typeof event
    eventError = retry.error
  }

  if (eventError || !event) return null

  const { data: tickets } = await admin
    .from('tickets')
    .select('id, status')
    .eq('order_id', orderId)

  const { data: open } = await admin
    .from('refund_requests')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'submitted')
    .maybeSingle()

  return {
    order: order as OrderContext['order'],
    event: event as OrderContext['event'],
    liveTicketIds: (tickets ?? []).filter(t => ['valid', 'scanned'].includes(t.status)).map(t => t.id),
    hasOpenRequest: Boolean(open),
  }
}

/** The eligibility answer for an order, from the one policy module. */
export function eligibilityFor(ctx: OrderContext, now = new Date()): RefundEligibility {
  return evaluateRefundEligibility({
    policy: policyFromEvent(ctx.event),
    eventStatus: ctx.event.status as never,
    eventStartDate: new Date(ctx.event.start_date),
    orderTotalCents: ctx.order.total_cents,
    orderStatus: ctx.order.status,
    liveTicketCount: ctx.liveTicketIds.length,
    hasOpenRequest: ctx.hasOpenRequest,
    now,
    // `?? null` rather than a bare read: on the degraded path (migration not yet
    // applied) these keys are absent from the row entirely, not merely null.
    postponedAt: ctx.event.postponed_at ? new Date(ctx.event.postponed_at) : null,
    rescheduledAt: ctx.event.rescheduled_at ? new Date(ctx.event.rescheduled_at) : null,
  })
}

/**
 * ARE THE FUNDS THERE. Asked separately from the policy on purpose: policy is a
 * promise the organiser made, funds are a fact about a balance right now, and a
 * function that conflates them can claim money exists because the terms say it
 * should.
 *
 * The ledger balance is allowed to be short WITHOUT blocking the refund, and this
 * is the deliberate difference from Eventbrite. We are the merchant of record and
 * the buyer's money is in OUR balance, so the refund can always be honoured; a
 * short organiser ledger means the ORGANISER owes us, which is a debt to settle
 * against their next event, not a reason to keep a buyer's money. What the check
 * below does is decide whether the refund is automatic or needs the organiser to
 * look at it, which is a very different thing from whether it is possible.
 */
export async function fundsCoverRefund(
  admin: SupabaseClient,
  args: {
    organisationId: string
    currency: string
    amountCents: number
    /** TRUE once the event is over, which is when the post-event transfer releases the money. */
    eventEnded: boolean
  },
): Promise<{ covered: boolean; availableCents: number; basis: string }> {
  const { data } = await admin.rpc('organiser_available_balance', {
    p_organisation_id: args.organisationId,
    p_currency: (args.currency || 'AUD').toUpperCase(),
  })
  const available = Number(data ?? 0)

  if (available >= args.amountCents) {
    return { covered: true, availableCents: available, basis: 'organiser_balance' }
  }

  /*
   * THE ORGANISER LEDGER BEING SHORT IS NOT THE SAME QUESTION AS THE MONEY BEING
   * GONE, and the first version of this conflated them. It asked
   * organiser_available_balance and nothing else, so a refund on an event whose
   * sale had not yet been credited to the organiser's ledger looked unfundable
   * and was pushed to the organiser for manual approval. On a drill with a REAL
   * Stripe charge sitting in the platform balance, that was demonstrably wrong:
   * the money was right there.
   *
   * The buyer is charged on the PLATFORM account and the funds settle to, and are
   * HELD in, the platform balance until a post-event transfer releases them
   * (src/lib/payments/create-platform-charge.ts, payout_schedule defaults to
   * post_event_only). BEFORE the event, therefore, we are still holding the
   * buyer's money and can always return it. That is the whole structural
   * advantage over Humanitix, whose help centre says that once an event is paid
   * out "Humanitix no longer holds these funds. You will need to arrange a refund
   * with the ticket buyer directly i.e. through a bank transfer."
   *
   * AFTER the event the transfer may have gone, so the organiser balance becomes
   * the real constraint and a short balance means an organiser decision.
   */
  if (!args.eventEnded) {
    return { covered: true, availableCents: available, basis: 'platform_holds_funds_pre_event' }
  }

  return { covered: false, availableCents: available, basis: 'post_event_balance_short' }
}

/**
 * Create the request. If the policy qualifies it AND the funds are there AND the
 * organiser enabled self-service, refund it immediately through the one path.
 * Otherwise it sits as `submitted` for the organiser to decide.
 *
 * EVERY REFUSAL NAMES ITS REAL CAUSE, and every one of them comes back in plain
 * words. A buyer who is told nothing files a chargeback.
 */
export async function createRefundRequest(
  admin: SupabaseClient,
  input: CreateRefundRequestInput,
  now = new Date(),
): Promise<CreateRefundRequestResult> {
  const ctx = await loadOrderContext(admin, input.orderId)
  if (!ctx) {
    return { ok: false, reason: 'order_not_found', message: 'We could not find that order.' }
  }

  const eligibility = eligibilityFor(ctx, now)
  if (!eligibility.canRequest) {
    return { ok: false, reason: eligibility.reason, message: eligibility.message }
  }

  // Only tickets that are actually live may be asked about. Silently dropping the
  // rest would let a buyer think they had asked for four and get two.
  const requested = input.ticketIds.length ? input.ticketIds : ctx.liveTicketIds
  const askable = requested.filter(id => ctx.liveTicketIds.includes(id))
  if (askable.length === 0) {
    return {
      ok: false,
      reason: 'no_live_tickets_selected',
      message: 'None of the tickets you selected can be refunded. They may already have been refunded.',
    }
  }
  if (askable.length < requested.length) {
    const dropped = requested.length - askable.length
    return {
      ok: false,
      reason: 'some_tickets_not_refundable',
      message: `${dropped} of the ${requested.length} tickets you selected cannot be refunded, so nothing was submitted. Select only the live tickets and try again.`,
    }
  }

  const { data: created, error: createErr } = await admin
    .from('refund_requests')
    .insert({
      order_id: ctx.order.id,
      event_id: ctx.event.id,
      organisation_id: ctx.order.organisation_id,
      requester_id: input.requesterId,
      requester_email: input.requesterEmail,
      status: 'submitted',
      buyer_message: input.buyerMessage ?? null,
    })
    .select('id')
    .single()

  if (createErr) {
    /*
     * NO SILENT FAILURES. The unique partial index refuses a second open request
     * on one order, and that refusal is a real answer rather than an error to
     * swallow: the buyer already asked.
     */
    if (createErr.code === '23505') {
      return {
        ok: false,
        reason: 'request_already_open',
        message: 'You already have a refund request open on this order. The organiser has been notified and will respond.',
      }
    }
    return {
      ok: false,
      reason: 'request_not_created',
      message: 'We could not submit your refund request just then. Try again in a moment, and contact the organiser if it keeps happening.',
    }
  }

  const requestId = created.id as string
  await admin.from('refund_request_tickets').insert(
    askable.map(ticket_id => ({ request_id: requestId, ticket_id })),
  )

  // ---- auto-approval -------------------------------------------------------
  const policy = policyFromEvent(ctx.event)
  const cancelled = ctx.event.status === 'cancelled'
  const autoAllowed = cancelled || policy.selfService

  if (!eligibility.qualifiesForAuto || !autoAllowed) {
    const why = !eligibility.qualifiesForAuto
      ? eligibility.message
      : 'This organiser reviews each refund request themselves.'
    await admin.from('refund_requests').update({ auto_decision_reason: why }).eq('id', requestId)
    return {
      ok: true, requestId, status: 'submitted', autoApproved: false,
      message: 'Your refund request has been sent to the organiser. They will respond, and you will get an email either way.',
    }
  }

  const share = Math.round(ctx.order.total_cents * (askable.length / Math.max(ctx.liveTicketIds.length, 1)))
  const funds = await fundsCoverRefund(admin, {
    organisationId: ctx.order.organisation_id,
    currency: ctx.order.currency,
    amountCents: share,
    eventEnded: new Date(ctx.event.start_date).getTime() < now.getTime(),
  })
  if (!funds.covered && !cancelled) {
    const why = 'The organiser needs to approve this one because the event has been paid out and their balance does not currently cover it.'
    await admin.from('refund_requests').update({ auto_decision_reason: why }).eq('id', requestId)
    return {
      ok: true, requestId, status: 'submitted', autoApproved: false,
      message: 'Your refund request has been sent to the organiser. They will respond, and you will get an email either way.',
    }
  }

  return approveRefundRequest(admin, {
    requestId,
    actorId: await organisationActor(admin, ctx.order.organisation_id),
    initiator: 'system',
    auto: true,
    note: cancelled
      ? 'This event was cancelled, so your refund was issued automatically.'
      : 'Your refund was approved automatically under this event refund policy.',
  })
}

/** The organisation owner stands in as the actor for a system-approved refund. */
async function organisationActor(admin: SupabaseClient, organisationId: string): Promise<string> {
  const { data } = await admin
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (!data?.owner_id) {
    throw new Error(`organisation ${organisationId} has no owner to attribute an automatic refund to`)
  }
  return data.owner_id as string
}

export interface ApproveInput {
  requestId: string
  actorId: string
  initiator: 'organiser' | 'admin' | 'system'
  auto?: boolean
  note?: string | null
}

/**
 * Approve a request and refund it, THROUGH THE ONE PATH.
 *
 * Used by the organiser's Approve button and by auto-approval. There is no other
 * caller and there must never be one that skips requestTicketRefund.
 */
export async function approveRefundRequest(
  admin: SupabaseClient,
  input: ApproveInput,
): Promise<CreateRefundRequestResult> {
  const { data: req } = await admin
    .from('refund_requests')
    .select('id, order_id, status, requester_email')
    .eq('id', input.requestId)
    .maybeSingle()
  if (!req) return { ok: false, reason: 'request_not_found', message: 'That refund request no longer exists.' }
  if (req.status !== 'submitted') {
    return { ok: false, reason: 'already_decided', message: `This request has already been ${req.status}.` }
  }

  const { data: rows } = await admin
    .from('refund_request_tickets')
    .select('ticket_id')
    .eq('request_id', input.requestId)
  const ticketIds = (rows ?? []).map(r => r.ticket_id as string)
  if (!ticketIds.length) {
    return { ok: false, reason: 'no_tickets_on_request', message: 'That request has no tickets attached to it.' }
  }

  try {
    const res = await requestTicketRefund(admin, {
      orderId: req.order_id as string,
      ticketIds,
      reason: 'requested_by_buyer',
      initiator: input.initiator,
      actorId: input.actorId,
      buyerMessage: input.note ?? null,
    })

    await admin
      .from('refund_requests')
      .update({
        status: 'approved',
        decided_by: input.actorId,
        decided_at: new Date().toISOString(),
        decision_note: input.note ?? null,
        refund_id: res.refundId,
        auto_approved: Boolean(input.auto),
      })
      .eq('id', input.requestId)

    return {
      ok: true,
      requestId: input.requestId,
      status: 'approved',
      autoApproved: Boolean(input.auto),
      message: input.auto
        ? `Your refund has been approved and is on its way back to your card. It usually lands within ${REFUND_ARRIVAL_WINDOW}.`
        : 'Refund approved. The buyer has been emailed.',
    }
  } catch (err) {
    /*
     * The request must NOT be left reading 'submitted' after a failed attempt, or
     * the organiser sees a queue item they have already actioned. It is marked
     * failed with the reason, which is a state the buyer is shown honestly.
     */
    await admin
      .from('refund_requests')
      .update({
        status: 'failed',
        decided_by: input.actorId,
        decided_at: new Date().toISOString(),
        auto_decision_reason: err instanceof Error ? err.message.slice(0, 500) : 'refund failed',
      })
      .eq('id', input.requestId)
    return {
      ok: false,
      reason: 'refund_failed',
      message: 'The refund could not be completed. Nothing has been charged or changed, and the organiser has been notified.',
    }
  }
}

export interface DeclineInput {
  requestId: string
  actorId: string
  reason: string
  note: string
}

/**
 * Decline, WITH A REASON AND A NOTE THE BUYER RECEIVES.
 *
 * The note is required rather than optional, and that is the whole point: a
 * decline with no explanation is how a chargeback starts, and a chargeback costs
 * the organiser the money AND a fee AND the dispute.
 */
export async function declineRefundRequest(
  admin: SupabaseClient,
  input: DeclineInput,
): Promise<CreateRefundRequestResult> {
  if (!input.note || input.note.trim().length < 10) {
    return {
      ok: false,
      reason: 'note_required',
      message: 'Give the buyer a reason of at least a few words. A decline with no explanation is how a chargeback starts.',
    }
  }

  const { data: req } = await admin
    .from('refund_requests')
    .select('id, status')
    .eq('id', input.requestId)
    .maybeSingle()
  if (!req) return { ok: false, reason: 'request_not_found', message: 'That refund request no longer exists.' }
  if (req.status !== 'submitted') {
    return { ok: false, reason: 'already_decided', message: `This request has already been ${req.status}.` }
  }

  await admin
    .from('refund_requests')
    .update({
      status: 'declined',
      decided_by: input.actorId,
      decided_at: new Date().toISOString(),
      decline_reason: input.reason,
      decision_note: input.note.trim(),
    })
    .eq('id', input.requestId)

  return {
    ok: true, requestId: input.requestId, status: 'declined', autoApproved: false,
    message: 'Request declined. The buyer has been emailed your explanation.',
  }
}
