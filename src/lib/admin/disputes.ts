import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/payments/payout'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin dispute (chargeback) data access.
 *
 * ARCHITECTURE: EventLinqs sales are Stripe DESTINATION charges, so a
 * chargeback is raised against the PLATFORM account, not the connected
 * organiser account. Disputes therefore read and respond on the platform
 * client (getStripeClient()): stripe.disputes.list / .retrieve / .update /
 * .close all target the platform balance. This module never touches our
 * charge, fee, or payout math; responding to a dispute only submits evidence
 * to Stripe.
 *
 * Stripe is the single source of truth for dispute state. We do not persist a
 * dispute mirror; we read live and map to the shapes below. The related
 * EventLinqs order is resolved (best effort) from the payment intent so the
 * detail page can deep-link into /admin/orders, but a missing match is never a
 * failure.
 */

/** A dispute status that requires the platform to submit evidence. */
const SUBMITTABLE_STATUSES: ReadonlySet<Stripe.Dispute.Status> = new Set<Stripe.Dispute.Status>([
  'needs_response',
  'warning_needs_response',
])

export interface AdminDispute {
  id: string
  amountCents: number
  currency: string
  reason: string
  status: Stripe.Dispute.Status
  createdAt: string
  /** evidence_details.due_by as an ISO timestamp, or null when none is set. */
  dueBy: string | null
  /**
   * Urgency of the evidence deadline, computed here (not in render so the
   * page stays a pure component): past_due when the deadline has passed,
   * due_soon within three days, otherwise null. Only set for submittable
   * disputes with a deadline.
   */
  dueStatus: 'past_due' | 'due_soon' | null
  chargeId: string | null
  paymentIntentId: string | null
  isSubmittable: boolean
  evidenceSubmitted: boolean
}

export interface AdminDisputeEvidence {
  productDescription: string | null
  customerCommunication: string | null
  uncategorizedText: string | null
}

export interface AdminDisputeDetail extends AdminDispute {
  evidenceDetails: {
    dueBy: string | null
    hasEvidence: boolean
    pastDue: boolean
    submissionCount: number
  }
  evidence: AdminDisputeEvidence
  /** Resolved EventLinqs order, when the payment intent maps to one. */
  relatedOrder: { id: string; orderNumber: string } | null
}

export type DisputesListResult =
  | { ok: true; disputes: AdminDispute[] }
  | { ok: false; error: string }

export type DisputeDetailResult =
  | { ok: true; dispute: AdminDisputeDetail }
  | { ok: false; error: string }

function epochToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

function chargeIdOf(dispute: Stripe.Dispute): string | null {
  const charge = dispute.charge
  if (!charge) return null
  return typeof charge === 'string' ? charge : charge.id
}

function paymentIntentIdOf(dispute: Stripe.Dispute): string | null {
  const pi = dispute.payment_intent
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

/**
 * An evidence field reads back as a string (the submitted text), a Stripe.File
 * (for file-type fields), or null. The text evidence fields we surface are
 * plain strings; normalise anything else to null so the UI only ever shows
 * real submitted text.
 */
function evidenceText(value: string | Stripe.File | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

function dueStatusOf(submittable: boolean, dueBySeconds: number | null | undefined): 'past_due' | 'due_soon' | null {
  if (!submittable || typeof dueBySeconds !== 'number' || !Number.isFinite(dueBySeconds)) return null
  const delta = dueBySeconds * 1000 - Date.now()
  if (delta < 0) return 'past_due'
  if (delta <= THREE_DAYS_MS) return 'due_soon'
  return null
}

function toAdminDispute(dispute: Stripe.Dispute): AdminDispute {
  const submittable = SUBMITTABLE_STATUSES.has(dispute.status)
  return {
    id: dispute.id,
    amountCents: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    createdAt: epochToIso(dispute.created) ?? '',
    dueBy: epochToIso(dispute.evidence_details?.due_by),
    dueStatus: dueStatusOf(submittable, dispute.evidence_details?.due_by),
    chargeId: chargeIdOf(dispute),
    paymentIntentId: paymentIntentIdOf(dispute),
    isSubmittable: submittable,
    evidenceSubmitted: (dispute.evidence_details?.submission_count ?? 0) > 0,
  }
}

/** Sort key: disputes that still need a response surface first, then newest. */
function sortOpenFirst(a: AdminDispute, b: AdminDispute): number {
  if (a.isSubmittable !== b.isSubmittable) return a.isSubmittable ? -1 : 1
  return b.createdAt.localeCompare(a.createdAt)
}

export async function listDisputes(opts?: {
  limit?: number
  status?: Stripe.Dispute.Status
}): Promise<DisputesListResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100)
  try {
    const stripe = getStripeClient()
    const params: Stripe.DisputeListParams = { limit, expand: ['data.charge'] }
    const page = await stripe.disputes.list(params)
    const disputes = page.data
      .filter(d => (opts?.status ? d.status === opts.status : true))
      .map(toAdminDispute)
      .sort(sortOpenFirst)
    return { ok: true, disputes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Stripe to load disputes.' }
  }
}

/**
 * Count of disputes that currently need a platform response. Powers the
 * dashboard "Active disputes" tile. Reads one page (the dashboard only needs
 * the live open count, which is small in practice) and counts the submittable
 * statuses.
 */
export async function countOpenDisputes(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const stripe = getStripeClient()
    const page = await stripe.disputes.list({ limit: 100 })
    const count = page.data.reduce((n, d) => (SUBMITTABLE_STATUSES.has(d.status) ? n + 1 : n), 0)
    return { ok: true, count }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Stripe to count disputes.' }
  }
}

/**
 * Resolve the EventLinqs order behind a Stripe payment intent. The payment
 * intent id is stored on the `payments` row (gateway_payment_id) which links to
 * the order via order_id; the orders table itself holds no payment intent
 * column. A missing match returns null (never an error) so the detail page
 * degrades gracefully.
 */
async function resolveRelatedOrder(paymentIntentId: string | null): Promise<{ id: string; orderNumber: string } | null> {
  if (!paymentIntentId) return null
  try {
    const db = createAdminClient()
    const { data: payment } = await db
      .from('payments')
      .select('order_id')
      .eq('gateway_payment_id', paymentIntentId)
      .maybeSingle()
    const orderId = payment?.order_id
    if (!orderId) return null

    const { data: order } = await db
      .from('orders')
      .select('id, order_number')
      .eq('id', orderId)
      .maybeSingle()
    if (!order) return null
    return { id: order.id, orderNumber: order.order_number }
  } catch {
    return null
  }
}

export async function getDispute(id: string): Promise<DisputeDetailResult> {
  try {
    const stripe = getStripeClient()
    const dispute = await stripe.disputes.retrieve(id, { expand: ['charge', 'payment_intent'] })
    const base = toAdminDispute(dispute)
    const relatedOrder = await resolveRelatedOrder(base.paymentIntentId)

    const detail: AdminDisputeDetail = {
      ...base,
      evidenceDetails: {
        dueBy: epochToIso(dispute.evidence_details?.due_by),
        hasEvidence: dispute.evidence_details?.has_evidence ?? false,
        pastDue: dispute.evidence_details?.past_due ?? false,
        submissionCount: dispute.evidence_details?.submission_count ?? 0,
      },
      evidence: {
        productDescription: evidenceText(dispute.evidence?.product_description),
        customerCommunication: evidenceText(dispute.evidence?.customer_communication),
        uncategorizedText: evidenceText(dispute.evidence?.uncategorized_text),
      },
      relatedOrder,
    }
    return { ok: true, dispute: detail }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Stripe to load this dispute.' }
  }
}
