import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { captureException } from '@/lib/observability/sentry'
import { getSiteUrl } from '@/lib/site-url'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyBookedproofSignature } from '@/lib/connect/bookedproof/signature'
import { parseOrganiserReadRequest } from '@/lib/connect/bookedproof/request'
import { readOrganiserRows } from '@/lib/connect/bookedproof/read'
import { assembleResponse } from '@/lib/connect/bookedproof/assemble'

/**
 * POST /api/connect/bookedproof/organisers: Bookedproof's signed read of the
 * organisers it found (E51, "the won organiser"). The contract is
 * C:\dev\EVIDENCE\WI1\EL-BOOKEDPROOF-ORGANISER-READ-CONTRACT.md as the project
 * manager reconciled it at 10:05 on 23 October 2026.
 *
 * Server to server only: no CORS headers, no cookies read, nothing cached.
 * In this order, so nothing is parsed or read before the caller is proved:
 *
 *   503 not-configured   while BOOKEDPROOF_CONNECTOR_SECRET is unset, which is
 *                        production's state until Lawal rules on the privacy
 *                        disclosure (the contract's section 7)
 *   413 too-large        a body over 64 KB, refused before it is hashed
 *   401 unsigned | stale | bad-signature
 *   429                  the one caller's bucket, FAIL-CLOSED
 *   400 bad-request      with the reason
 *   200                  the answer, counts and sums only, nothing about a buyer
 */

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024

const refuse = (status: number, error: string, reason?: string) =>
  NextResponse.json(reason ? { error, reason } : { error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const secret = process.env.BOOKEDPROOF_CONNECTOR_SECRET?.trim()
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

  const limited = await applyRateLimit('bookedproof-organiser-read', request, 'bookedproof')
  if (limited) return limited

  const parsed = parseOrganiserReadRequest(rawBody)
  if (!parsed.ok) return refuse(400, 'bad-request', parsed.reason)

  try {
    const rows = await readOrganiserRows(parsed.value)
    const body = assembleResponse({
      emails: parsed.value.emails,
      pages: parsed.value.pages,
      since: parsed.value.since,
      rows,
      secret,
      origin: getSiteUrl(),
      now,
    })
    return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      where: 'api/connect/bookedproof/organisers',
    })
    return refuse(500, 'read-failed')
  }
}
