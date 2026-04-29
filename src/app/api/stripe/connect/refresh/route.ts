import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { createAccountLink } from '@/lib/stripe/connect'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  org: z.string().uuid(),
})

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/**
 * GET /api/stripe/connect/refresh?org=<organisation_id>
 *
 * Stripe redirects organisers here when an AccountLink expires before
 * they finish onboarding. We mint a fresh link and redirect them back
 * into the Stripe-hosted flow. Idempotent and safe to retry.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await checkRateLimit({
    key: `connect-refresh:${ip}`,
    limit: 30,
    windowSec: 60,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many refresh attempts. Try again in a minute.' },
      { status: 429 }
    )
  }

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({ org: url.searchParams.get('org') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid org param' }, { status: 400 })
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

  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .select('id, owner_id, stripe_account_id')
    .eq('id', organisationId)
    .single()
  if (orgError || !org) {
    return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  }
  if (org.owner_id !== user.id) {
    return NextResponse.json(
      { error: 'Only the organisation owner can manage payouts.' },
      { status: 403 }
    )
  }
  if (!org.stripe_account_id) {
    return NextResponse.redirect(
      `${appUrl()}/dashboard/payouts?status=needs_onboarding`,
      303
    )
  }

  try {
    const link = await createAccountLink({
      accountId: org.stripe_account_id,
      organisationId: org.id,
      type: 'onboarding',
      refreshUrl: `${appUrl()}/api/stripe/connect/refresh?org=${org.id}`,
      returnUrl: `${appUrl()}/api/stripe/connect/return?org=${org.id}`,
    })
    if (!link.url) {
      return NextResponse.redirect(
        `${appUrl()}/dashboard/payouts?status=link_error`,
        303
      )
    }
    return NextResponse.redirect(link.url, 303)
  } catch (err) {
    console.error('[connect-refresh] createAccountLink failed', err)
    return NextResponse.redirect(
      `${appUrl()}/dashboard/payouts?status=link_error`,
      303
    )
  }
}
