import { NextResponse, type NextRequest } from 'next/server'
import { readGoPieceLink, recordGoPress } from '@/lib/growth/go'
import { goDestination, viaOf } from '@/lib/growth/go-math'
import { QA_HEADER, qaPressOf } from '@/lib/broadcast/qa-marker'

/**
 * /go/[piece]: one press on the link in bio, counted (go_presses), then the visitor lands on the piece's own page on
 * this site (src/lib/growth/go-math.ts holds the rules and why). 302 as /out/[slug] answers; never indexed, never
 * cached, so every press reaches the count. A piece that is unknown or was never posted lands on /events (Law 5).
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ piece: string }> }) {
  const { piece } = await params
  const via = viaOf(request.nextUrl.searchParams.get('via'))
  let stored: string | null = null
  try {
    stored = await readGoPieceLink(piece)
  } catch (err) {
    console.warn('[go] the piece could not be read', err instanceof Error ? err.message : String(err))
  }
  // A verified QA press is recorded as a test; an unverified marker is recorded as neither (qa-marker.ts).
  const qa = await qaPressOf(request.headers.get(QA_HEADER))
  if (stored !== null && qa !== 'refused') {
    await recordGoPress({
      pieceId: piece,
      via,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      isTest: qa === 'test',
    })
  }
  const response = NextResponse.redirect(goDestination(stored, request.nextUrl.origin, via), 302)
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set('Cache-Control', 'no-store')
  return response
}
