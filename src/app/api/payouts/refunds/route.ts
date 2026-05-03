import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { getRefundImpact } from '@/lib/payouts/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const blocked = await applyRateLimit('payouts-read', request)
  if (blocked) return blocked

  const scope = await resolveOrganiserScope()
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, error: scope.reason },
      { status: scope.status }
    )
  }

  const url = new URL(request.url)
  const limit = parseIntParam(url.searchParams.get('limit'), 20)
  const offset = parseIntParam(url.searchParams.get('offset'), 0)

  const page = await getRefundImpact(scope.org.organisationId, { limit, offset })
  return NextResponse.json({ ok: true, ...page })
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}
