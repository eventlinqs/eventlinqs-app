'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { voidPayoutById, getStripeClient } from '@/lib/payments/payout'
import { runEventDisbursements } from '@/lib/payments/event-transfer'
import { getDefaultTransferGateway } from '@/lib/payments/gateway-factory'
import { PAYOUT_CURRENCY } from '@/lib/admin/payouts'

const DisburseSchema = z.object({
  organisationId: z.string().uuid(),
})

const VoidSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(['failed', 'canceled']).default('failed'),
  reason: z.string().max(500).nullable().optional(),
})

export type DisburseActionResult =
  | { ok: true; transferred: number; considered: number; totalCents: number }
  | { ok: false; error: string }

export type VoidActionResult =
  | { ok: true; reversed: boolean; alreadyReversed: boolean }
  | { ok: false; error: string }

/**
 * Operator-initiated disbursement (funds-holding model). Triggers the same
 * platform->connected event transfers as the post-event cron, scoped to this
 * organisation: every ended event past the buffer with held funds is disbursed
 * (net of fee, reserve, and any open chargeback hold) via createEventTransfer.
 * Gated by admin.payouts.disburse and audit-logged. Money movement and overpay
 * protection live in disburse_transfer / createEventTransfer.
 */
export async function submitDisburse(input: {
  organisationId: string
}): Promise<DisburseActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.payouts.disburse')

  const parsed = DisburseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid disbursement request.' }

  const admin = createAdminClient()
  let summary
  try {
    summary = await runEventDisbursements(admin, getDefaultTransferGateway(), getStripeClient(), {
      organisationId: parsed.data.organisationId,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Disbursement failed.' }
  }

  const totalCents = summary.results
    .filter((r) => r.status === 'transferred')
    .reduce((s, r) => s + (r.amountCents ?? 0), 0)

  await recordAuditEvent({
    action: 'admin.payout.disburse',
    targetType: 'organisation',
    targetId: parsed.data.organisationId,
    metadata: {
      organisation_id: parsed.data.organisationId,
      transferred: summary.transferred,
      considered: summary.considered,
      failed: summary.failed,
      total_cents: totalCents,
      currency: PAYOUT_CURRENCY,
    },
    session,
  })

  revalidatePath('/admin/payouts')
  revalidatePath(`/admin/payouts/${parsed.data.organisationId}`)
  return { ok: true, transferred: summary.transferred, considered: summary.considered, totalCents }
}

/**
 * Voids a failed/canceled payout, compensating the ledger. Idempotent via
 * void_payout. Gated by admin.payouts.disburse and audit-logged.
 */
export async function submitVoidPayout(input: {
  payoutId: string
  status?: 'failed' | 'canceled'
  reason?: string | null
}): Promise<VoidActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.payouts.disburse')

  const parsed = VoidSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid void request.' }

  const admin = createAdminClient()
  let result
  try {
    result = await voidPayoutById(admin, parsed.data.payoutId, parsed.data.status, parsed.data.reason ?? null)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Void failed.' }
  }

  if (!result.success) {
    return { ok: false, error: result.error ?? 'Void failed.' }
  }

  await recordAuditEvent({
    action: 'admin.payout.void',
    targetType: 'payout',
    targetId: parsed.data.payoutId,
    metadata: {
      status: parsed.data.status,
      reason: parsed.data.reason ?? null,
      reversed: Boolean(result.reversed),
      already_reversed: Boolean(result.already_reversed),
    },
    session,
  })

  revalidatePath('/admin/payouts')
  return {
    ok: true,
    reversed: Boolean(result.reversed),
    alreadyReversed: Boolean(result.already_reversed),
  }
}

export type FasterPayoutActionResult = { ok: true } | { ok: false; error: string }

const FasterGrantSchema = z.object({
  organisationId: z.string().uuid(),
  bufferDays: z.number().int().min(0).max(30),
  note: z.string().max(500).optional(),
})

/**
 * Item 21: Lawal switches faster payouts on for one proven organiser, with the buffer after the event he chooses
 * (supabase/migrations/20261027160001_faster_payouts.sql). The database refuses an organiser who does not qualify (the
 * locked M6 plan's Tier 3 and a Stripe account paying out) and says why; that sentence is returned here as it is.
 * Gated by admin.payouts.faster, which super_admin alone holds, and audit-logged.
 */
export async function submitFasterPayoutGrant(input: {
  organisationId: string
  bufferDays: number
  note?: string
}): Promise<FasterPayoutActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.payouts.faster')
  const parsed = FasterGrantSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a buffer of 0 to 30 days.' }

  const { error } = await createAdminClient()
    .from('faster_payout_grants')
    .insert({
      organisation_id: parsed.data.organisationId,
      buffer_days: parsed.data.bufferDays,
      granted_by: session.userId,
      note: parsed.data.note ?? null,
    })
  if (error) {
    const refused = /refused: (.*)$/.exec(error.message)?.[1]
    if (refused) return { ok: false, error: refused }
    if (error.code === '23505') return { ok: false, error: 'Faster payouts are already on for this organiser.' }
    return { ok: false, error: 'Faster payouts were not switched on. Try again.' }
  }
  await recordAuditEvent({
    action: 'admin.payout.faster_on',
    targetType: 'organisation',
    targetId: parsed.data.organisationId,
    metadata: { organisation_id: parsed.data.organisationId, buffer_days: parsed.data.bufferDays },
    session,
  })
  revalidatePath(`/admin/payouts/${parsed.data.organisationId}`)
  return { ok: true }
}

/** Item 21: Lawal switches faster payouts off for an organiser, at once; the next run uses the platform's buffer. */
export async function submitFasterPayoutRevoke(input: { organisationId: string }): Promise<FasterPayoutActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.payouts.faster')
  const parsed = z.object({ organisationId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That organiser was not found.' }
  const { error } = await createAdminClient()
    .from('faster_payout_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organisation_id', parsed.data.organisationId)
    .is('revoked_at', null)
  if (error) return { ok: false, error: 'Faster payouts were not switched off. Try again.' }
  await recordAuditEvent({
    action: 'admin.payout.faster_off',
    targetType: 'organisation',
    targetId: parsed.data.organisationId,
    metadata: { organisation_id: parsed.data.organisationId },
    session,
  })
  revalidatePath(`/admin/payouts/${parsed.data.organisationId}`)
  return { ok: true }
}
