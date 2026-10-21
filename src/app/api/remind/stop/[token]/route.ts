import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { stopReminderByToken } from '@/lib/walk-in/reminder-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * THE ONE-CLICK STOP for Remind me (WI1), the target of the List-Unsubscribe
 * header each Remind me email carries. A mail client POSTs here with
 * "List-Unsubscribe=One-Click" (RFC 8058, the same pair the platform's other
 * mail carries: src/lib/consent/one-click.ts) and the row stops at once.
 *
 * AUTH POSTURE: public by design; the per-row token IS the credential, and the
 * only thing it can do is stop mail to the address it belongs to. Declared in
 * scripts/security/entrypoint-authz-audit.mjs. Rate limited by
 * marketing-one-click, the limit the platform's other one-click stop uses.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Keyed by the TOKEN, as the platform's other one-click stop is: the caller is
  // a mailbox provider, and its requests arrive from a handful of addresses.
  const blocked = await applyRateLimit('marketing-one-click', request, token)
  if (blocked) return blocked
  try {
    await stopReminderByToken(token)
    // The same answer whatever the token, so a guess learns nothing.
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/remind/stop] the stop could not be saved', error)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
