'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { approveRefundRequest, declineRefundRequest } from '@/lib/refunds/request-service'
import { sendRefundDecisionToBuyer } from '@/lib/refunds/notify'
import { captureException } from '@/lib/observability/sentry'

/**
 * THE ORGANISER'S DECISION ON A BUYER'S REFUND REQUEST.
 *
 * Approving routes through approveRefundRequest, which routes through
 * requestTicketRefund, which is the SAME function the per-order refund panel has
 * always called. There is no second refund path and there must never be one.
 *
 * Authorisation is resolveEventAccess, the shared definition, so an
 * organisation_members manager can decide a request exactly as they can already
 * issue a refund. An owner-only check here would have made the founder's "any
 * organiser can refund" ruling unreachable for a venue with staff, which is the
 * bug the orders page already carries a comment about.
 */

const ApproveSchema = z.object({
  eventId: z.string().uuid(),
  requestId: z.string().uuid(),
  note: z.string().max(1000).optional().nullable(),
})

const DeclineSchema = z.object({
  eventId: z.string().uuid(),
  requestId: z.string().uuid(),
  reason: z.enum(['outside_policy', 'event_proceeding', 'non_refundable_costs', 'suspected_abuse', 'other']),
  note: z.string().min(10).max(1000),
})

export type DecisionResult = { ok: true; message: string } | { ok: false; message: string }

async function guard(eventId: string, requestId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Sign in to decide this request.' }

  const access = await resolveEventAccess(eventId)
  if (!access.allowed) {
    return {
      ok: false as const,
      message: 'You do not have access to this event. Ask an owner or a manager of this organisation to give you access.',
    }
  }

  const admin = createAdminClient()
  // The request must belong to THIS event. Without this, a valid manager of event
  // A could pass the id of a request on event B.
  const { data: req } = await admin
    .from('refund_requests')
    .select('id, event_id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!req || req.event_id !== eventId) {
    return { ok: false as const, message: 'That refund request is not on this event.' }
  }

  return { ok: true as const, admin, userId: user.id, userEmail: user.email ?? null }
}

export async function approveRequest(input: {
  eventId: string
  requestId: string
  note?: string | null
}): Promise<DecisionResult> {
  const parsed = ApproveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'That request did not look right. Reload and try again.' }

  const g = await guard(parsed.data.eventId, parsed.data.requestId)
  if (!g.ok) return { ok: false, message: g.message }

  const res = await approveRefundRequest(g.admin, {
    requestId: parsed.data.requestId,
    actorId: g.userId,
    initiator: 'organiser',
    auto: false,
    note: parsed.data.note ?? null,
  })

  if (res.ok) {
    await g.admin.from('audit_log').insert({
      actor_id: g.userId,
      actor_email_snapshot: g.userEmail,
      actor_role_snapshot: 'organiser',
      action: 'organiser.refund_request.approve',
      target_type: 'refund_request',
      target_id: parsed.data.requestId,
      metadata: { event_id: parsed.data.eventId },
    })
    try {
      await sendRefundDecisionToBuyer(g.admin, parsed.data.requestId)
    } catch (e) {
      captureException(e, { scope: 'refund-decision-notify', request_id: parsed.data.requestId })
    }
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/refunds`)
  return res.ok ? { ok: true, message: res.message } : { ok: false, message: res.message }
}

export async function declineRequest(input: {
  eventId: string
  requestId: string
  reason: string
  note: string
}): Promise<DecisionResult> {
  const parsed = DeclineSchema.safeParse(input)
  if (!parsed.success) {
    /*
     * THE NOTE IS REQUIRED AND THE REFUSAL SAYS WHY. Zod's own message would be
     * "String must contain at least 10 character(s)", which tells an organiser
     * nothing about the reason the rule exists.
     */
    return {
      ok: false,
      message: 'Give the buyer a reason of at least a few words. A decline with no explanation is the most common cause of a card chargeback, which costs you the money and a fee on top.',
    }
  }

  const g = await guard(parsed.data.eventId, parsed.data.requestId)
  if (!g.ok) return { ok: false, message: g.message }

  const res = await declineRefundRequest(g.admin, {
    requestId: parsed.data.requestId,
    actorId: g.userId,
    reason: parsed.data.reason,
    note: parsed.data.note,
  })

  if (res.ok) {
    await g.admin.from('audit_log').insert({
      actor_id: g.userId,
      actor_email_snapshot: g.userEmail,
      actor_role_snapshot: 'organiser',
      action: 'organiser.refund_request.decline',
      target_type: 'refund_request',
      target_id: parsed.data.requestId,
      metadata: { event_id: parsed.data.eventId, reason: parsed.data.reason },
    })
    try {
      await sendRefundDecisionToBuyer(g.admin, parsed.data.requestId)
    } catch (e) {
      captureException(e, { scope: 'refund-decision-notify', request_id: parsed.data.requestId })
    }
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/refunds`)
  return res.ok ? { ok: true, message: res.message } : { ok: false, message: res.message }
}
