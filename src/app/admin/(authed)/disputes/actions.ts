'use server'

import { z } from 'zod'
import type Stripe from 'stripe'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getStripeClient } from '@/lib/payments/payout'

/**
 * Admin dispute (chargeback) server actions. Gated by admin.refunds.process
 * (there is no dedicated dispute capability; the refund operator owns disputes
 * too). Responding to a Stripe dispute submits evidence on the PLATFORM client,
 * which does not touch our charge, fee, or payout math. Every action is audited
 * and revalidates the detail, list, and dashboard so the open count stays live.
 */

const SubmitEvidenceSchema = z.object({
  id: z.string().min(1),
  productDescription: z.string().max(20000).optional().nullable(),
  customerCommunication: z.string().max(20000).optional().nullable(),
  uncategorizedText: z.string().max(20000).optional().nullable(),
  submit: z.boolean(),
})

export type SubmitDisputeEvidenceInput = z.infer<typeof SubmitEvidenceSchema>

export type SubmitDisputeEvidenceResult =
  | { ok: true; submitted: boolean }
  | { ok: false; error: string }

export type CloseDisputeResult =
  | { ok: true }
  | { ok: false; error: string }

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Save and optionally submit dispute evidence. With submit=false the evidence
 * is saved as a draft on Stripe (editable until the due date); with submit=true
 * it is finalised and sent for review. Only the provided text fields are
 * written, so a draft save never clears an existing field unintentionally.
 */
export async function submitDisputeEvidence(
  input: SubmitDisputeEvidenceInput,
): Promise<SubmitDisputeEvidenceResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.refunds.process')

  const parsed = SubmitEvidenceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid dispute evidence.' }

  const { id, submit } = parsed.data
  const evidence: Stripe.DisputeUpdateParams.Evidence = {}
  const changed: string[] = []

  const productDescription = trimToNull(parsed.data.productDescription)
  if (productDescription !== null) {
    evidence.product_description = productDescription
    changed.push('product_description')
  }
  const customerCommunication = trimToNull(parsed.data.customerCommunication)
  if (customerCommunication !== null) {
    evidence.customer_communication = customerCommunication
    changed.push('customer_communication')
  }
  const uncategorizedText = trimToNull(parsed.data.uncategorizedText)
  if (uncategorizedText !== null) {
    evidence.uncategorized_text = uncategorizedText
    changed.push('uncategorized_text')
  }

  if (changed.length === 0) {
    return { ok: false, error: 'Add at least one piece of evidence before saving or submitting.' }
  }

  try {
    const stripe = getStripeClient()
    await stripe.disputes.update(id, { evidence, submit })

    await recordAuditEvent({
      action: 'admin.dispute.evidence.submit',
      targetType: 'stripe_dispute',
      targetId: id,
      metadata: { fields_changed: changed, submit },
      session,
    })

    revalidatePath(`/admin/disputes/${id}`)
    revalidatePath('/admin/disputes')
    revalidatePath('/admin')
    return { ok: true, submitted: submit }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe rejected the evidence update.' }
  }
}

/**
 * Close a dispute. This accepts (forfeits) the dispute: the disputed amount is
 * conceded and no further evidence can be submitted. The UI requires an explicit
 * confirmation before calling this.
 */
export async function closeDispute(id: string): Promise<CloseDisputeResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.refunds.process')

  const parsed = z.string().min(1).safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid dispute id.' }

  try {
    const stripe = getStripeClient()
    await stripe.disputes.close(parsed.data)

    await recordAuditEvent({
      action: 'admin.dispute.close',
      targetType: 'stripe_dispute',
      targetId: parsed.data,
      metadata: { action: 'accepted_forfeited' },
      session,
    })

    revalidatePath(`/admin/disputes/${parsed.data}`)
    revalidatePath('/admin/disputes')
    revalidatePath('/admin')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe rejected the close request.' }
  }
}
