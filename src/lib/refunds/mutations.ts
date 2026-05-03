import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeStripeRefund } from '@/lib/stripe/refunds'
import { sendRefundEmail } from './email'
import type { Refund, RefundReasonEnum, RefundInitiatorEnum } from '@/types/database'

/**
 * M6 Phase 5 - Refund mutations.
 *
 * All write operations route through here. The API layer enforces
 * authorization (resolveRefundScope), then delegates to a mutation that
 * encapsulates the business invariants:
 *
 *   - createRefundRequest: buyer or organiser creates a 'pending' row with
 *     amount validation + duplicate prevention.
 *   - processRefund: organiser approves + Stripe refunds + ledger updates +
 *     email notifications.
 *   - cancelRefundRequest: organiser denies a pending request OR a buyer
 *     withdraws their own pending request.
 *   - escalateToDispute: marks an organiser-denied refund as 'cancelled' with
 *     escalation metadata. Phase 6 admin tooling consumes this signal.
 */

export type CreatorRole = 'buyer' | 'organiser' | 'admin'

export interface CreateRefundRequestInput {
  orderId: string
  amountCents: number
  reason: RefundReasonEnum
  buyerMessage?: string | null
  organiserInternalNotes?: string | null
  requestedBy: string | null
  creatorRole: CreatorRole
}

export type CreateRefundResult =
  | { ok: true; refund: Refund }
  | { ok: false; status: 400 | 403 | 404 | 409; reason: string }

interface OrderShape {
  id: string
  organisation_id: string
  user_id: string | null
  status: string
  total_cents: number
  currency: string
}

interface ExistingRefundsAggregate {
  refundedCents: number
  hasActiveRequest: boolean
}

async function loadOrder(
  adminClient: SupabaseClient,
  orderId: string
): Promise<OrderShape | null> {
  const { data, error } = await adminClient
    .from('orders')
    .select('id, organisation_id, user_id, status, total_cents, currency')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as OrderShape
}

async function aggregateExistingRefunds(
  adminClient: SupabaseClient,
  orderId: string
): Promise<ExistingRefundsAggregate> {
  const { data } = await adminClient
    .from('refunds')
    .select('amount_cents, status')
    .eq('order_id', orderId)
  const rows = (data ?? []) as { amount_cents: number | string; status: string }[]
  let refundedCents = 0
  let hasActiveRequest = false
  for (const r of rows) {
    const amt = Number(r.amount_cents ?? 0)
    if (r.status === 'completed' || r.status === 'processing') refundedCents += amt
    if (r.status === 'pending' || r.status === 'processing') hasActiveRequest = true
  }
  return { refundedCents, hasActiveRequest }
}

export async function createRefundRequest(
  input: CreateRefundRequestInput,
  client?: SupabaseClient
): Promise<CreateRefundResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, status: 400, reason: 'invalid_amount' }
  }
  const admin = client ?? createAdminClient()

  const order = await loadOrder(admin, input.orderId)
  if (!order) return { ok: false, status: 404, reason: 'order_not_found' }
  if (order.status !== 'confirmed' && order.status !== 'partially_refunded') {
    return { ok: false, status: 409, reason: 'order_not_refundable' }
  }
  if (input.creatorRole === 'buyer') {
    if (!input.requestedBy || input.requestedBy !== order.user_id) {
      return { ok: false, status: 403, reason: 'not_buyer_of_order' }
    }
  }

  const aggregate = await aggregateExistingRefunds(admin, input.orderId)
  if (aggregate.hasActiveRequest) {
    return { ok: false, status: 409, reason: 'refund_already_in_progress' }
  }
  if (aggregate.refundedCents + input.amountCents > order.total_cents) {
    return { ok: false, status: 400, reason: 'amount_exceeds_refundable' }
  }

  const initiator: RefundInitiatorEnum =
    input.creatorRole === 'buyer'
      ? 'buyer'
      : input.creatorRole === 'admin'
        ? 'admin'
        : 'organiser'

  const { data, error } = await admin
    .from('refunds')
    .insert({
      order_id: input.orderId,
      organisation_id: order.organisation_id,
      amount_cents: input.amountCents,
      currency: order.currency,
      reason: input.reason,
      status: 'pending',
      initiator,
      buyer_message: input.buyerMessage ?? null,
      organiser_internal_notes: input.organiserInternalNotes ?? null,
      requested_by: input.requestedBy,
      requested_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[refund-mutations] insert failed', { orderId: input.orderId, error })
    return { ok: false, status: 400, reason: 'insert_failed' }
  }

  const refund = data as unknown as Refund

  await sendRefundEmail(admin, refund.organisation_id, 'refund_requested', {
    refundId: refund.id,
    orderId: refund.order_id,
    amountCents: refund.amount_cents,
    currency: refund.currency,
    reason: refund.reason,
    buyerMessage: refund.buyer_message,
  })

  return { ok: true, refund }
}

export interface ProcessRefundInput {
  refundId: string
  processedBy: string
  organisationId: string
}

export type ProcessRefundResult =
  | { ok: true; status: 'completed' | 'failed' | 'skipped_not_pending' | 'missing_payment_intent'; stripeRefundId?: string }
  | { ok: false; status: 403 | 404; reason: string }

export async function processRefund(
  input: ProcessRefundInput,
  client?: SupabaseClient
): Promise<ProcessRefundResult> {
  const admin = client ?? createAdminClient()

  const { data: refundRow } = await admin
    .from('refunds')
    .select('id, organisation_id, status, order_id, amount_cents, currency, reason, buyer_message')
    .eq('id', input.refundId)
    .maybeSingle()
  if (!refundRow) return { ok: false, status: 404, reason: 'refund_not_found' }
  const r = refundRow as unknown as Refund
  if (r.organisation_id !== input.organisationId) {
    return { ok: false, status: 403, reason: 'forbidden' }
  }

  const result = await executeStripeRefund(admin, {
    refundId: input.refundId,
    processedBy: input.processedBy,
  })

  if (result.status === 'completed') {
    await flipOrderStatus(admin, r.order_id)
    await sendRefundEmail(admin, r.organisation_id, 'refund_processed', {
      refundId: r.id,
      orderId: r.order_id,
      amountCents: r.amount_cents,
      currency: r.currency,
      reason: r.reason,
      buyerMessage: r.buyer_message,
    })
  } else if (result.status === 'failed' || result.status === 'missing_payment_intent') {
    await sendRefundEmail(admin, r.organisation_id, 'refund_failed', {
      refundId: r.id,
      orderId: r.order_id,
      amountCents: r.amount_cents,
      currency: r.currency,
      reason: r.reason,
      failureReason: result.failureReason ?? 'unknown',
    })
  }

  return {
    ok: true,
    status: result.status,
    stripeRefundId: result.stripeRefundId,
  }
}

async function flipOrderStatus(
  adminClient: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order } = await adminClient
    .from('orders')
    .select('total_cents, status')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return

  const { data: refunds } = await adminClient
    .from('refunds')
    .select('amount_cents, status')
    .eq('order_id', orderId)
  const completedSum = ((refunds ?? []) as { amount_cents: number | string; status: string }[])
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0)

  const total = Number((order as { total_cents: number | string }).total_cents ?? 0)
  const next = completedSum >= total ? 'refunded' : 'partially_refunded'
  await adminClient.from('orders').update({ status: next }).eq('id', orderId)
}

export interface CancelRefundRequestInput {
  refundId: string
  actorRole: 'buyer' | 'organiser'
  actorId: string
  organisationId?: string
  denialReason?: string | null
}

export type CancelRefundResult =
  | { ok: true; refund: Refund }
  | { ok: false; status: 403 | 404 | 409; reason: string }

export async function cancelRefundRequest(
  input: CancelRefundRequestInput,
  client?: SupabaseClient
): Promise<CancelRefundResult> {
  const admin = client ?? createAdminClient()

  const { data: refundRow } = await admin
    .from('refunds')
    .select('*')
    .eq('id', input.refundId)
    .maybeSingle()
  if (!refundRow) return { ok: false, status: 404, reason: 'refund_not_found' }
  const r = refundRow as unknown as Refund

  if (r.status !== 'pending') {
    return { ok: false, status: 409, reason: 'not_pending' }
  }
  if (input.actorRole === 'organiser') {
    if (input.organisationId !== r.organisation_id) {
      return { ok: false, status: 403, reason: 'forbidden' }
    }
  } else if (input.actorRole === 'buyer') {
    if (r.requested_by !== input.actorId) {
      return { ok: false, status: 403, reason: 'forbidden' }
    }
  }

  const { data: updated, error } = await admin
    .from('refunds')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      processed_by: input.actorId,
      organiser_internal_notes: input.denialReason
        ? [r.organiser_internal_notes, `[denied: ${input.denialReason}]`]
            .filter(Boolean)
            .join('\n')
        : r.organiser_internal_notes,
    })
    .eq('id', input.refundId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (error || !updated) {
    return { ok: false, status: 409, reason: 'update_failed' }
  }
  const next = updated as unknown as Refund

  if (input.actorRole === 'organiser') {
    await sendRefundEmail(admin, r.organisation_id, 'refund_denied', {
      refundId: next.id,
      orderId: next.order_id,
      amountCents: next.amount_cents,
      currency: next.currency,
      reason: next.reason,
      denialReason: input.denialReason ?? null,
    })
  }

  return { ok: true, refund: next }
}

export interface EscalateToDisputeInput {
  refundId: string
  organisationId: string
  actorId: string
  rationale: string
}

export type EscalateResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409; reason: string }

export async function escalateToDispute(
  input: EscalateToDisputeInput,
  client?: SupabaseClient
): Promise<EscalateResult> {
  const admin = client ?? createAdminClient()
  const { data: refundRow } = await admin
    .from('refunds')
    .select('id, organisation_id, status, organiser_internal_notes')
    .eq('id', input.refundId)
    .maybeSingle()
  if (!refundRow) return { ok: false, status: 404, reason: 'refund_not_found' }
  const r = refundRow as unknown as Refund
  if (r.organisation_id !== input.organisationId) {
    return { ok: false, status: 403, reason: 'forbidden' }
  }
  if (r.status !== 'cancelled' && r.status !== 'failed') {
    return { ok: false, status: 409, reason: 'only_cancelled_or_failed_can_escalate' }
  }
  await admin
    .from('refunds')
    .update({
      organiser_internal_notes: [
        r.organiser_internal_notes,
        `[escalated_to_dispute by=${input.actorId}: ${input.rationale}]`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    .eq('id', input.refundId)
  return { ok: true }
}
