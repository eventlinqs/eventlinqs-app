import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileConnectedAccount } from '@/lib/stripe/reconcile-connect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Scheduled reconcile, so no organisation sits wrong indefinitely.
 *
 * THE FAILURE THIS BACKSTOPS. `payout_status` used to be a one-way door: the
 * deauthorize handler could set 'restricted' and no `account.updated` could ever
 * clear it, so an organisation could be permanently unable to sell while Stripe
 * reported it perfectly healthy. That specific bug is fixed, but the general shape
 * remains: a webhook is an at-least-once delivery that can also be a
 * never-delivered. An endpoint not subscribed to `account.updated`, a signing secret
 * rotated mid-flight, a 500 during a deploy, an event that arrived before the row
 * existed. Each one silently strands somebody until a human notices.
 *
 * Stripe's guidance is to treat the API as the authority and the event as a prompt
 * to look again (https://docs.stripe.com/connect/handling-api-verification, fetched
 * 2026-08-09). This route is the "look again" that needs no prompt.
 *
 * REPORTS AS WELL AS REPAIRS. Every row it changes is logged with the before and
 * after, because a reconcile that silently corrects a systemic divergence hides the
 * fact that something upstream is broken. If this route is changing rows every run,
 * the webhook is not working and somebody needs to know.
 *
 * CRON_SECRET-gated and fail-closed (src/lib/cron/auth.ts refuses when the secret is
 * unset rather than running open).
 *
 * Nothing here touches a charge, a payout, a fee or a refund. It mirrors the derived
 * Stripe-state columns and nothing else.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const blocked = await applyRateLimit('cron-job', request)
  if (blocked) return blocked

  const admin = createAdminClient()

  // Only organisations with a connected account. A row with no account is repaired
  // by reconcile when its owner next loads the payouts page, and sweeping all of
  // them here would spend a Stripe call per organisation for nothing.
  //
  // `?org=<uuid>` narrows the sweep to ONE organisation. Two reasons, both
  // operational rather than decorative: the founder can repair a single named
  // business on demand without waiting for the hour, and this route can be
  // exercised against a shared database without rewriting every other row on it,
  // which is otherwise a real hazard when the same TEST project backs several
  // people's work.
  const only = request.nextUrl.searchParams.get('org')
  if (only && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(only)) {
    return NextResponse.json({ ok: false, error: 'bad_org' }, { status: 400 })
  }

  let query = admin
    .from('organisations')
    .select('id, name')
    .not('stripe_account_id', 'is', null)
    .order('updated_at', { ascending: true })
  if (only) query = query.eq('id', only)
  const { data: orgs, error } = await query

  if (error) {
    console.error('[cron/connect-reconcile] org list failed', { error })
    return NextResponse.json({ ok: false, error: 'org_list_failed' }, { status: 500 })
  }

  const changed: Array<{ id: string; name: string; payoutStatus: string; canSell: boolean }> = []
  const failed: Array<{ id: string; reason: string }> = []
  let checked = 0

  for (const org of orgs ?? []) {
    checked++
    const result = await reconcileConnectedAccount(admin, org.id as string)
    if (!result.ok) {
      // A Stripe outage must not abort the sweep: the next organisation may be fine,
      // and a partial sweep beats no sweep.
      failed.push({ id: org.id as string, reason: result.reason })
      continue
    }
    if (result.changed) {
      changed.push({
        id: org.id as string,
        name: (org.name as string) ?? '',
        payoutStatus: result.payoutStatus,
        canSell: result.canSell,
      })
    }
  }

  // Loud on purpose. A non-empty `changed` list means the platform's view had
  // drifted from Stripe's, which is a signal about the webhook rather than a
  // routine outcome.
  if (changed.length > 0) {
    console.warn('[cron/connect-reconcile] corrected drifted organisations', {
      checked,
      correctedCount: changed.length,
      corrected: changed,
    })
  }
  if (failed.length > 0) {
    console.error('[cron/connect-reconcile] some organisations could not be reconciled', {
      failedCount: failed.length,
      failed,
    })
  }

  return NextResponse.json({
    ok: true,
    checked,
    corrected: changed.length,
    failed: failed.length,
    // Returned so a manual founder trigger shows what moved without reading logs.
    correctedOrganisations: changed,
  })
}
