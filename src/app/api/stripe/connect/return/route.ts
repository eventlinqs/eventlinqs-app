import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { isFullyOnboarded, retrieveAccount } from '@/lib/stripe/connect'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  org: z.string().uuid(),
})

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
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

  const { data: org } = await supabase
    .from('organisations')
    .select('id, owner_id, stripe_account_id')
    .eq('id', organisationId)
    .single()
  if (!org || org.owner_id !== user.id) {
    return NextResponse.redirect(`${appUrl()}/dashboard/payouts?status=not_found`, 303)
  }
  if (!org.stripe_account_id) {
    return NextResponse.redirect(
      `${appUrl()}/dashboard/payouts?status=needs_onboarding`,
      303
    )
  }

  try {
    const account = await retrieveAccount(org.stripe_account_id)
    const fullyOnboarded = isFullyOnboarded(account)
    const admin = createAdminClient()
    const update: Record<string, unknown> = {
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_capabilities: account.capabilities ?? {},
      stripe_requirements: account.requirements ?? {},
      stripe_onboarding_complete: fullyOnboarded,
    }
    const { error: updateError } = await admin
      .from('organisations')
      .update(update)
      .eq('id', org.id)
    if (updateError) {
      console.error('[connect-return] DB update failed', updateError)
    }

    const status = fullyOnboarded ? 'complete' : 'pending'
    return NextResponse.redirect(`${appUrl()}/dashboard/payouts?status=${status}`, 303)
  } catch (err) {
    console.error('[connect-return] retrieveAccount failed', err)
    return NextResponse.redirect(
      `${appUrl()}/dashboard/payouts?status=fetch_error`,
      303
    )
  }
}
