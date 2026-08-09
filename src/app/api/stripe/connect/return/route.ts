import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { getAppUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  org: z.string().uuid(),
})

// HARD-07: resolve the app origin through the shared deploy-safe helper so no
// deployed environment can ever emit a localhost redirect into Stripe.
function appUrl(): string {
  return getAppUrl()
}

/**
 * GET /api/stripe/connect/return?org=<organisation_id>
 *
 * Stripe redirects organisers here when they exit the hosted onboarding
 * flow. We re-fetch the account state from Stripe (rather than trust
 * the redirect alone), persist the latest capability flags, and route
 * the organiser to the payouts dashboard with a status hint.
 *
 * The webhook handler is the canonical source of truth for tier
 * promotion; this route only mirrors what we already see in the API
 * response so the dashboard can render the right state without waiting
 * for the webhook to land.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await checkRateLimit({
    key: `connect-return:${ip}`,
    limit: 30,
    windowSec: 60,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many return attempts. Try again in a minute.' },
      { status: 429 }
    )
  }

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({ org: url.searchParams.get('org') })
  if (!parsed.success) {
    return NextResponse.redirect(`${appUrl()}/dashboard/payouts?status=invalid_return`, 303)
  }
  const { org: organisationId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(
      `${appUrl()}/login?next=${encodeURIComponent('/dashboard/payouts')}`,
      303
    )
  }

  // Service role read, ownership enforced immediately below (owner_id !== user.id
  // -> 403). owner_id and stripe_account_id are revoked from `authenticated` by
  // column privilege (migration 20260808000010). Identity is already verified via
  // getUser() above.
  const { data: org } = await createAdminClient()
    .from('organisations')
    .select('id, owner_id, stripe_account_id')
    .eq('id', organisationId)
    .single()
  if (!org || org.owner_id !== user.id) {
    return NextResponse.redirect(`${appUrl()}/dashboard/payouts?status=not_found`, 303)
  }

  // Every redirect from here on carries `&org=`, including the failure branches.
  //
  // WHY THAT MATTERS AND WHY IT IS NOT COSMETIC. A person may run several
  // businesses, each with its own Stripe account. Somebody who has just finished
  // onboarding business B and hits a failure branch would, without this, be dropped
  // onto the payouts page for business A, be shown A's healthy state, and conclude
  // that B was connected when it was not. The one branch above keeps no org because
  // the organisation is not the caller's to name.
  const payouts = (status: string) =>
    `${appUrl()}/dashboard/payouts?status=${status}&org=${encodeURIComponent(org.id)}`

  if (!org.stripe_account_id) {
    return NextResponse.redirect(payouts('needs_onboarding'), 303)
  }

  try {
    // RECONCILE, rather than a partial write of its own.
    //
    // This block used to update five columns and, like the account.updated handler,
    // it omitted payout_status. It also omitted stripe_account_country and
    // payout_destination. So returning from Stripe onboarding could leave a row that
    // disagreed with Stripe in exactly the way that stranded the founder, and it was
    // a THIRD place where the definition of "what Stripe says" could drift.
    //
    // reconcileConnectedAccount is now the only definition. The return path is a
    // trigger, not a writer.
    const { reconcileConnectedAccount } = await import('@/lib/stripe/reconcile-connect')
    const admin = createAdminClient()
    const result = await reconcileConnectedAccount(admin, org.id)

    if (!result.ok) {
      console.error('[connect-return] reconcile failed', { orgId: org.id, reason: result.reason })
      // Send them to payouts either way: the Refresh Stripe status control there is
      // the retry, so a failed reconcile is recoverable in the browser rather than a
      // dead end.
      return NextResponse.redirect(payouts('pending'), 303)
    }

    // `org` carries the id needed for the redirect, so the account is only fetched
    // for the status word shown in the query string.
    return NextResponse.redirect(payouts(result.canSell ? 'complete' : 'pending'), 303)
  } catch (err) {
    console.error('[connect-return] reconcile threw', err)
    return NextResponse.redirect(payouts('fetch_error'), 303)
  }
}
