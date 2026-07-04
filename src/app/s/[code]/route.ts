import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  SHARE_COOKIE,
  SHARE_COOKIE_MAX_AGE_SECONDS,
  isValidShareCode,
  recordShareLinkEvent,
  resolveShareLink,
  visitorHash,
} from '@/lib/broadcast/share-links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The tracked short link: /s/[code].
 * SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md section 2.3.
 *
 * A valid code records a click, sets the last-touch share cookie, and 302s
 * to the event page. A forged, tampered, or stale code writes NOTHING and
 * 302s to the events browse page: no 404, no error, no corrupted
 * attribution (Law 5 plus the adversarial gate in one behaviour).
 *
 * With broadcast_share off the redirect still works (a shared link must
 * never break) but no tracking is recorded and no cookie is set.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params
  const origin = request.nextUrl.origin
  const fallback = NextResponse.redirect(new URL('/events', origin), 302)

  // Strict format gate before any database work.
  if (!isValidShareCode(code)) return fallback

  const link = await resolveShareLink(code)
  if (!link) return fallback

  // Resolve the event slug for the destination. A link whose event has been
  // deleted degrades to the browse page rather than a dead end.
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('slug')
    .eq('id', link.event_id)
    .maybeSingle()
  if (!event?.slug) return fallback

  const destination = NextResponse.redirect(new URL(`/events/${event.slug}`, origin), 302)

  if (!(await isFeatureEnabled('broadcast_share'))) return destination

  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  await recordShareLinkEvent({
    linkId: link.id,
    kind: 'click',
    visitorHash: visitorHash(ip, request.headers.get('user-agent')),
  }).catch(() => {})

  // Last-touch share attribution: the most recent tracked link the browser
  // followed claims a later conversion for its channel.
  // Not httpOnly: the value is the public short code (already visible in the
  // URL bar), and the view beacon reads it client side on the ISR event page.
  destination.cookies.set(SHARE_COOKIE, link.code, {
    maxAge: SHARE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
  return destination
}
