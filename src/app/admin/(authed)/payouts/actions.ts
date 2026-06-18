'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPayout, voidPayoutById, getStripeClient } from '@/lib/payments/payout'
import { PAYOUT_CURRENCY } from '@/lib/admin/payouts'

const DisburseSchema = z.object({
  organisationId: z.string().uuid(),
  // Optional explicit amount (cents). Omitted/null disburses the full balance.
  amountCents: z.number().int().positive().nullable().optional(),
})

const VoidSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(['failed', 'canceled']).default('failed'),
  reason: z.string().max(500).nullable().optional(),
})

export type DisburseActionResult =
  | { ok: true; payoutId: string; amountCents: number; availableAfterCents: number }
  | { ok: false; error: string }

export type VoidActionResult =
  | { ok: true; reversed: boolean; alreadyReversed: boolean }
  | { ok: false; error: string }

/**
 * Operator-initiated disbursement. Gated by admin.payouts.disburse; the money
 * movement and overpay protection live in createPayout / disburse_payout. Every
 * attempt that creates a payout is audit-logged with actor, org, and amount.
 */
export async function submitDisburse(input: {
  organisationId: string
  amountCents?: number | null
}): Promise<DisburseActionResult> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.payouts.disburse')

  const parsed = DisburseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid disbursement request.' }

  const admin = createAdminClient()
  const result = await createPayout(admin, getStripeClient(), {
    organisationId: parsed.data.organisationId,
    currency: PAYOUT_CURRENCY,
    amountCents: parsed.data.amountCents ?? null,
    actor: session.userId,
  })

  if (!result.success) {
    return { ok: false, error: result.error }
  }

  await recordAuditEvent({
    action: 'admin.payout.disburse',
    targetType: 'payout',
    targetId: result.payoutId,
    metadata: {
      organisation_id: parsed.data.organisationId,
      amount_cents: result.amountCents,
      currency: PAYOUT_CURRENCY,
      available_after_cents: result.availableAfterCents,
      stripe_payout_id: result.stripePayoutId,
    },
    session,
  })

  revalidatePath('/admin/payouts')
  revalidatePath(`/admin/payouts/${parsed.data.organisationId}`)
  return {
    ok: true,
    payoutId: result.payoutId,
    amountCents: result.amountCents,
    availableAfterCents: result.availableAfterCents,
  }
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
