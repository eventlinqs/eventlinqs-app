import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { captureException } from '@/lib/observability/sentry'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyBookedproofSignature } from '@/lib/connect/bookedproof/signature'
import { isPlatformScope, parsePlatformPageRequest, platformSecretFor } from '@/lib/connect/bookedproof/platform-request'
import { readPlatformPage } from '@/lib/connect/bookedproof/platform-read'
import { logPlatformRead } from '@/lib/connect/bookedproof/platform-log'

/**
 * POST /api/connect/bookedproof/platform/<scope>: Bookedproof's signed, read
 * only read of EventLinqs, its customer one (trial gate T3, "day 1, connected"),
 * one page of one scope: organisations, events, buyers (only those whose
 * consent wording names Bookedproof) or ledger. The project manager's rulings
 * of 26 October 2026, 22:35 (3) and 22:45 (3).
 *
 * Server to server only: no CORS headers, no cookies read, nothing cached.
 * In this order, so nothing is parsed or read before the caller is proved:
 *
 *   404 unknown-scope    a scope that is not one of the four
 *   503 not-configured   while that scope's own secret is unset, so each scope
 *                        is switched on by its own secret and off without it
 *   413 too-large        a body over 4 KB, refused before it is hashed
 *   401 unsigned | stale | bad-signature, under that scope's secret alone
 *   429                  the one caller's bucket, FAIL-CLOSED
 *   400 bad-request      with the reason
 *   200                  {scope, rows, next, read_at}; the read is then logged
 */

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4 * 1024

const refuse = (status: number, error: string, reason?: string) =>
  NextResponse.json(reason ? { error, reason } : { error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request, ctx: { params: Promise<{ scope: string }> }) {
  const { scope } = await ctx.params
  if (!isPlatformScope(scope)) return refuse(404, 'unknown-scope')

  const secret = platformSecretFor(scope)
  if (!secret) return refuse(503, 'not-configured')

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return refuse(413, 'too-large')

  const now = new Date()
  const verdict = verifyBookedproofSignature({
    secret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    rawBody,
    now,
  })
  if (!verdict.ok) return refuse(401, verdict.reason)

  const limited = await applyRateLimit('bookedproof-platform-read', request, 'bookedproof')
  if (limited) return limited

  const parsed = parsePlatformPageRequest(rawBody)
  if (!parsed.ok) return refuse(400, 'bad-request', parsed.reason)

  try {
    const page = await readPlatformPage(scope, parsed.value, now)
    await logPlatformRead({ scope, rows: page.rows.length, after: parsed.value.after, next: page.next })
    return NextResponse.json(
      { scope, rows: page.rows, next: page.next, read_at: now.toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      where: 'api/connect/bookedproof/platform',
      scope,
    })
    return refuse(500, 'read-failed')
  }
}
