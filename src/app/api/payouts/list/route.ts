import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { getOrganiserPayouts } from '@/lib/payouts/queries'
import type { PayoutRecordStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: ReadonlyArray<PayoutRecordStatus | 'all'> = [
  'all',
  'pending',
  'in_transit',
  'paid',
  'failed',
  'canceled',
]

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
  const statusParam = url.searchParams.get('status')
  const currency = url.searchParams.get('currency') ?? undefined
  const fromDate = url.searchParams.get('from') ?? undefined
  const toDate = url.searchParams.get('to') ?? undefined
  const limit = parseIntParam(url.searchParams.get('limit'), 20)
  const offset = parseIntParam(url.searchParams.get('offset'), 0)

  const status =
    statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as PayoutRecordStatus | 'all')
      : 'all'

  const page = await getOrganiserPayouts(scope.org.organisationId, {
    status,
    currency,
    fromDate,
    toDate,
    limit,
    offset,
  })

  return NextResponse.json({ ok: true, ...page })
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}
