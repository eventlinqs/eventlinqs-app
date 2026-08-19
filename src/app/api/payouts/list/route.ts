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
  // ?org=<id> names WHICH of the caller's businesses this is about. Without it the
  // caller's first organisation is used. resolveOrganiserScope verifies ownership
  // and returns 403 for an id belonging to somebody else, so this parameter cannot
  // be used to read another owner's payouts.
  const scope = await resolveOrganiserScope(
    new URL(request.url).searchParams.get('org') ?? undefined,
  )
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, error: scope.reason },
      { status: scope.status }
    )
  }

  // THE LIMIT IS KEYED TO THE ORGANISATION AND THEREFORE RUNS AFTER THE SCOPE
  // RESOLVES, which is why this sits below the auth check rather than above it
  // (founder ruling, 19 August 2026). It used to run first with no identifier, so
  // the bucket was the forwarded IP while the rationale said "per user": a shared
  // office or a carrier NAT put every organiser behind it into one bucket of sixty
  // a minute. See docs/RATE-LIMIT-DOCTRINE.md section 5.
  //
  // The trade this makes, stated rather than left to be discovered: an
  // unauthenticated caller is now refused as unauthenticated instead of consuming
  // somebody's window, and is no longer throttled by THIS policy. That costs
  // nothing to serve, because resolveOrganisationScope returns 401 from the cookie
  // with no database read, and it is the same ordering every other authenticated
  // write on the platform already uses.
  const blocked = await applyRateLimit('payouts-read', request, scope.org.organisationId)
  if (blocked) return blocked

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
