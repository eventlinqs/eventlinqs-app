import { NextResponse, type NextRequest } from 'next/server'
import { SHARE_COOKIE } from '@/lib/broadcast/share-codes'
import { followOutbound, outboundDeps } from '@/lib/broadcast/outbound'

/**
 * /out/[slug]: a curated listing's one button out to the organiser's own page or booking site, counted on the way
 * (src/lib/broadcast/outbound.ts holds the rules and why).
 *
 * 302, AS THE FOUNDER'S RULING OF 15 AUGUST 2026 ASKED. /e/[code] answers 307 only because a page's redirect() cannot
 * be told otherwise (its header records that); a Route Handler can, NextResponse.redirect(url, init) taking the status
 * (node_modules/next/dist/server/web/spec-extension/response.js, Next 16.3.0: 302 is in its allowed set, read 27 October
 * 2026). A listing that is gone sends the visitor to the events page, never to an error (Law 5).
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const answer = await followOutbound(
    {
      slug,
      cookieCode: request.cookies.get(SHARE_COOKIE)?.value ?? null,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
    outboundDeps(),
  )
  const location = answer.kind === 'missing' ? '/events' : answer.location
  const response = NextResponse.redirect(new URL(location, request.url), 302)
  // A hop, not a page: never indexed, never cached, so every press reaches the count.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set('Cache-Control', 'no-store')
  return response
}
