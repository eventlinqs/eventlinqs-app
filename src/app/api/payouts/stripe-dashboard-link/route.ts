import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { createDashboardLoginLink } from '@/lib/stripe/connect'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const blocked = await applyRateLimit('payouts-stripe-link', request)
  if (blocked) return blocked

  const scope = await resolveOrganiserScope()
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, error: scope.reason },
      { status: scope.status }
    )
  }

  if (!scope.org.stripeAccountId) {
    return NextResponse.json(
      { ok: false, error: 'stripe_not_connected' },
      { status: 409 }
    )
  }

  try {
    const link = await createDashboardLoginLink(scope.org.stripeAccountId)
    return NextResponse.json({ ok: true, url: link.url, created: link.created })
  } catch (err) {
    console.error('[payouts/stripe-dashboard-link] mint failed', {
      organisationId: scope.org.organisationId,
      error: err instanceof Error ? err.message : err,
    })
    return NextResponse.json(
      { ok: false, error: 'stripe_link_failed' },
      { status: 502 }
    )
  }
}
