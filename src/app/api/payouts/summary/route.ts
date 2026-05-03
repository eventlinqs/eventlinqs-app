import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import {
  getOrganiserPayoutSummary,
  getReserveReleaseSchedule,
} from '@/lib/payouts/queries'

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
  const daysAhead = parseIntParam(url.searchParams.get('daysAhead'), 30)

  const [summary, schedule] = await Promise.all([
    getOrganiserPayoutSummary(scope.org.organisationId),
    getReserveReleaseSchedule(scope.org.organisationId, daysAhead),
  ])

  return NextResponse.json({
    ok: true,
    summary,
    reserve_release_schedule: schedule,
  })
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) return fallback
  return parsed
}
