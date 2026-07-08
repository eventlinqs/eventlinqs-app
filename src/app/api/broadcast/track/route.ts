import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  isValidShareCode,
  recordShareLinkEvent,
  resolveShareLink,
  visitorHash,
} from '@/lib/broadcast/share-links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  code: z.string().min(1).max(32),
  kind: z.literal('view'),
})

/**
 * The view beacon. The event page is ISR-cached, so a share-attributed view
 * is reported by a tiny client beacon instead of a server render side
 * effect. Only 'view' is accepted here: clicks are recorded by the /s/
 * redirect and conversions by the order confirmation path, both server
 * side, so a browser can never forge either through this endpoint.
 *
 * Views are deduped per (link, visitor, day) server side. A forged or
 * tampered code fails the strict format gate or the existence check and
 * writes nothing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = await applyRateLimit('share-track', request)
  if (blocked) return blocked

  if (!(await isFeatureEnabled('broadcast_share'))) {
    return NextResponse.json({ ok: true })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  if (!isValidShareCode(parsed.data.code)) {
    // Malformed codes are acknowledged and dropped: no oracle for probing.
    return NextResponse.json({ ok: true })
  }

  const link = await resolveShareLink(parsed.data.code)
  if (!link) {
    return NextResponse.json({ ok: true })
  }

  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  await recordShareLinkEvent({
    linkId: link.id,
    kind: 'view',
    visitorHash: visitorHash(ip, request.headers.get('user-agent')),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
