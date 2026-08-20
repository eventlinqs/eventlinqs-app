import { createAdminClient } from '@/lib/supabase/admin'
import { loadOrderContext, eligibilityFor } from './request-service'

/**
 * THE REFUND PANEL'S STATE, FOR A SERVER COMPONENT TO RENDER.
 *
 * THIS IS DELIBERATELY NOT A SERVER ACTION, and the reason is a defect this file
 * exists to correct. It was first written as an export of
 * `orders/[order_id]/confirmation/refund-actions.ts`, which carries `'use server'`.
 * Every export of such a module is a CALLABLE ENDPOINT, so a function that takes
 * an order id and returns that order's refund state, its live ticket ids and the
 * organiser's decision notes was reachable by anybody who could guess a uuid, with
 * no auth check at all.
 *
 * `scripts/security/entrypoint-authz-audit.mjs` caught it on the first run after
 * it was written: "1 entry point(s) establish no caller identity". That is the
 * guard doing exactly the job it was built for.
 *
 * The fix is not to bolt an auth check onto an action that should never have been
 * one. It is to move the function off the action surface entirely, so there is no
 * endpoint to protect. The caller is the confirmation page, a server component,
 * which has already established WHOSE order it is rendering before it calls this.
 */
export async function getRefundPanelState(orderId: string) {
  const admin = createAdminClient()
  const ctx = await loadOrderContext(admin, orderId)
  if (!ctx) return null
  const eligibility = eligibilityFor(ctx)

  const { data: latest } = await admin
    .from('refund_requests')
    .select('id, status, created_at, decided_at, decision_note, decline_reason, auto_approved, auto_decision_reason')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    eligibility,
    liveTicketIds: ctx.liveTicketIds,
    latestRequest: latest ?? null,
  }
}
