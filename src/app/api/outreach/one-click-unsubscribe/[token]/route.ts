import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUnsubscribeToken } from '@/lib/consent/token'
import { applyRateLimit } from '@/lib/rate-limit/middleware'

/**
 * THE ADDRESS THE List-Unsubscribe HEADER OF EVERY ORGANISER CRM EMAIL POINTS AT (window 6, 28 October 2026).
 *
 * The same rules as /api/marketing/one-click-unsubscribe/[token], whose header carries the reasoning and the sources
 * (RFC 8058, https://www.rfc-editor.org/rfc/rfc8058.html: "A mail receiver can do a one-click unsubscription by
 * performing an HTTPS POST to the HTTPS URI in the List-Unsubscribe header"):
 *
 *   POST unsubscribes, at once: outreach_unsubscribe_by_token (migration 20261028221001) writes the contact's own
 *        address to outreach_unsubscribes, the one suppression list, once, and the triggers void every message held
 *        or queued for it. It always answers 200: a mailbox provider reads anything else as a broken facility, and a
 *        distinguishable answer would tell a stranger which tokens exist.
 *   GET  changes nothing and sends the person to the page that explains and offers the button, because scanners and
 *        link previews fetch every URI in a message.
 *
 * Keyed by the token for the rate limit, never the IP (policy outreach-one-click).
 */

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { token } = await params

  const blocked = await applyRateLimit('outreach-one-click', request, token)
  if (blocked) return blocked

  // A value that cannot be a token matches no contact, and no database is asked (src/lib/consent/token.ts).
  if (!isUnsubscribeToken(token)) {
    return NextResponse.json({ ok: true, outcome: 'no-matching-contact' }, { status: 200 })
  }

  const admin = createAdminClient()
  const result = await admin.rpc('outreach_unsubscribe_by_token', { p_token: token.toLowerCase(), p_comment: 'One-click unsubscribe (RFC 8058).' })
  if (result.error) {
    // The one answer that is not 200: nothing was recorded, so the provider must try again.
    return NextResponse.json({ ok: false, outcome: 'not-recorded' }, { status: 503 })
  }

  const outcome = result.data === 'done' ? 'unsubscribed' : result.data === 'already' ? 'already-unsubscribed' : 'no-matching-contact'
  return NextResponse.json({ ok: true, outcome }, { status: 200 })
}

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { token } = await params
  const destination = new URL(`/unsubscribe/outreach?t=${encodeURIComponent(token)}`, request.url)
  return NextResponse.redirect(destination, 303)
}
