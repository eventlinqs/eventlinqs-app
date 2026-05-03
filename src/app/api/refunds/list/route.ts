import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserRefundScope } from '@/lib/refunds/auth'
import { getOrganiserRefunds, getRefundStatistics } from '@/lib/refunds/queries'
import type { RefundStatus } from '@/types/database'

const VALID_STATUS: (RefundStatus | 'all')[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'all']

export async function GET(request: Request) {
  const blocked = await applyRateLimit('refunds-read', request)
  if (blocked) return blocked

  const scope = await resolveOrganiserRefundScope()
  if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: scope.status })

  const url = new URL(request.url)
  const rawStatus = url.searchParams.get('status') ?? 'all'
  const status = (VALID_STATUS.includes(rawStatus as RefundStatus | 'all')
    ? rawStatus
    : 'all') as RefundStatus | 'all'
  const fromDate = url.searchParams.get('fromDate') ?? undefined
  const toDate = url.searchParams.get('toDate') ?? undefined
  const limit = Number(url.searchParams.get('limit') ?? '20')
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const includeStats = url.searchParams.get('includeStats') === 'true'

  const [page, stats] = await Promise.all([
    getOrganiserRefunds(scope.org.organisationId, {
      status,
      fromDate,
      toDate,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
    includeStats ? getRefundStatistics(scope.org.organisationId) : Promise.resolve(null),
  ])

  return NextResponse.json({
    rows: page.rows,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    stats,
  })
}
