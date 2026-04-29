import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import {
  ALLOWED_CONNECT_COUNTRIES,
  createAccountLink,
  createExpressAccount,
  isAllowedConnectCountry,
} from '@/lib/stripe/connect'

export const dynamic = 'force-dynamic'

const RouteInput = z.object({
  organisationId: z.string().uuid(),
  country: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase()),
})

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/**
 * POST /api/stripe/connect/onboard
 *
 * Idempotent. If the organisation already has a `stripe_account_id`, we
 * skip account creation and just mint a fresh AccountLink. If not, we
 * create a Stripe Express account, persist the id, and then mint the
 * link. The country field can only be set once (Stripe forbids changing
 * it after creation), so subsequent requests ignore the input country.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await checkRateLimit({
    key: `connect-onboard:${ip}`,
    limit: 10,
    windowSec: 60,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many onboarding attempts. Try again in a minute.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RouteInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { organisationId, country } = parsed.data

  if (!isAllowedConnectCountry(country)) {
    return NextResponse.json(
      {
        error:
          'This country is not yet supported for payouts. Supported countries are listed in your account settings.',
        supportedCountries: ALLOWED_CONNECT_COUNTRIES,
      },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .select(
      'id, owner_id, name, email, stripe_account_id, stripe_account_country, stripe_charges_enabled'
    )
    .eq('id', organisationId)
    .single()
  if (orgError || !org) {
    return NextResponse.json(
      { error: 'Organisation not found or access denied' },
      { status: 404 }
    )
  }
  if (org.owner_id !== user.id) {
    return NextResponse.json(
      { error: 'Only the organisation owner can manage payouts.' },
      { status: 403 }
    )
  }

  let accountId = org.stripe_account_id
  const admin = createAdminClient()

  if (!accountId) {
    try {
      const account = await createExpressAccount({
        organisationId: org.id,
        country,
        email: org.email ?? user.email ?? '',
      })
      accountId = account.id
      const { error: updateError } = await admin
        .from('organisations')
        .update({
          stripe_account_id: accountId,
          stripe_account_country: country,
        })
        .eq('id', org.id)
      if (updateError) {
        console.error('[connect-onboard] failed to persist stripe_account_id', updateError)
        return NextResponse.json(
          { error: 'Could not save Stripe account. Try again.' },
          { status: 500 }
        )
      }
    } catch (err) {
      console.error('[connect-onboard] createExpressAccount failed', err)
      const message = err instanceof Error ? err.message : 'Unknown Stripe error'
      return NextResponse.json(
        { error: `Could not create Stripe account: ${message}` },
        { status: 502 }
      )
    }
  }

  if (!accountId) {
    return NextResponse.json({ error: 'No Stripe account on file.' }, { status: 500 })
  }

  try {
    const link = await createAccountLink({
      accountId,
      organisationId: org.id,
      type: 'onboarding',
      refreshUrl: `${appUrl()}/api/stripe/connect/refresh?org=${org.id}`,
      returnUrl: `${appUrl()}/api/stripe/connect/return?org=${org.id}`,
    })
    return NextResponse.json({ url: link.url, accountId }, { status: 200 })
  } catch (err) {
    console.error('[connect-onboard] createAccountLink failed', err)
    const message = err instanceof Error ? err.message : 'Unknown Stripe error'
    return NextResponse.json(
      { error: `Could not generate onboarding link: ${message}` },
      { status: 502 }
    )
  }
}
