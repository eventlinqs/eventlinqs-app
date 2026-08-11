import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isLinkPreviewCrawler } from '@/lib/broadcast/crawlers'
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

  // Artist-tagged links land on the artist share landing (SPEC 4.3), whose
  // metadata carries the artist share-card variant, so a link preview shows
  // "[Artist] live at [Event]". Missing artist degrades to the event page.
  let path = `/events/${event.slug}`
  if (link.artist_id) {
    const { data: artist } = await admin
      .from('artists')
      .select('slug')
      .eq('id', link.artist_id)
      .maybeSingle()
    if (artist?.slug) path = `/events/${event.slug}/with/${artist.slug}`
  }

  const destination = NextResponse.redirect(new URL(path, origin), 302)

  if (!(await isFeatureEnabled('broadcast_share'))) return destination

  const userAgent = request.headers.get('user-agent')

  // A link-preview crawler is not a click, and counting it as one tells the
  // organiser something false. Measured on production 8 August 2026: 57 clicks,
  // 3 views, 0 conversions, ALL 57 on facebook and x links across 55 distinct
  // visitor hashes, with only 1 of those 55 ever running the view beacon. That
  // is a crawler fleet building preview cards, not an audience. The panel would
  // have shown that organiser "57 clicks, 0 sales", which reads as "they
  // clicked and did not buy" when the truth is that nobody clicked.
  //
  // The redirect still happens and the cookie is simply not set: a shared link
  // must never break, and a crawler has no conversion to attribute anyway.
  if (isLinkPreviewCrawler(userAgent)) return destination

  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  await recordShareLinkEvent({
    linkId: link.id,
    kind: 'click',
    visitorHash: visitorHash(ip, userAgent),
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
