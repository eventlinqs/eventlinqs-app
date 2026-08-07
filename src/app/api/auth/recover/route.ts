import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { dispatchPasswordReset } from '@/lib/auth/dispatch-auth-link'
import { safeAuthOrigin } from '@/lib/auth/safe-origin'
import { authMessage, RECOVERY_GENERIC_RESPONSE } from '@/lib/auth/auth-errors'

export const dynamic = 'force-dynamic'

/**
 * PASSWORD RESET REQUEST.
 *
 * Replaces the browser's `supabase.auth.resetPasswordForEmail()` call, which
 * routed the email through Supabase Auth's built-in mailer and its 2-per-hour
 * project-wide cap. That cap is what answered the founder "Error sending
 * recovery email" on 2026-08-02.
 *
 * TWO CONTRACTS, AND THEY PULL IN OPPOSITE DIRECTIONS.
 *
 * Brief 1.4 / OWASP: the response must not reveal whether an address has an
 * account. So `no_account` and `sent` return byte-identical bodies.
 *
 * Brief 1.5: a genuine send failure must be told apart from an accepted
 * request, and the user must see the correct message for each. So a transport
 * failure returns 502 with honest copy.
 *
 * The residual: during a mail outage, a 502 versus a 200 does distinguish a
 * registered address from an unregistered one. That is a deliberate, narrow
 * trade, reachable only while our mail is already down, and taken because a
 * user silently told "check your inbox" during an outage will never get the
 * email and has no way to know. It is documented rather than hidden. Under
 * normal operation - which is when enumeration attacks happen - the two paths
 * are indistinguishable in body, status and shape.
 *
 * TIMING. `no_account` short-circuits before any mail I/O, so it would
 * otherwise return in a fraction of the time a real send takes, which is an
 * enumeration oracle on its own (OWASP calls out the "time-based attack"
 * explicitly). A floor holds every response to the same minimum.
 */

const BodySchema = z.object({
  email: z.string().email().max(254),
})

/**
 * Minimum wall-clock time for any response, in ms. Sized above a warm Resend
 * send (typically 150 to 400ms from syd1) so the fast path cannot be told from
 * the slow one. Costs nothing that matters: this endpoint is fired once by a
 * human who is about to go and read their inbox.
 */
const RESPONSE_FLOOR_MS = 900

async function withFloor<T>(startedAt: number, value: T): Promise<T> {
  const elapsed = Date.now() - startedAt
  if (elapsed < RESPONSE_FLOOR_MS) {
    await new Promise((r) => setTimeout(r, RESPONSE_FLOOR_MS - elapsed))
  }
  return value
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  const limited = await applyRateLimit('auth-recover', request)
  if (limited) return limited

  let email: string
  try {
    email = BodySchema.parse(await request.json()).email
  } catch {
    // A malformed body is not an account signal, so it gets its own honest
    // validation message rather than the generic one.
    return NextResponse.json(
      { ok: false, message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const result = await dispatchPasswordReset({
    email,
    origin: safeAuthOrigin(request),
  })

  if (result.outcome === 'send_failed') {
    // Server-side diagnosis with enough detail to act on, per brief 1.5. The
    // address is logged because this is our own outage log, not a response.
    console.error('[auth/recover] transport failure', {
      email,
      reason: result.reason,
      at: new Date().toISOString(),
    })
    return withFloor(
      startedAt,
      NextResponse.json(
        { ok: false, message: authMessage('mail_transport_failed') },
        { status: 502 },
      ),
    )
  }

  if (result.outcome === 'no_account') {
    // Not an error. Logged at info so a founder debugging "I never got the
    // email" can see the request landed and why nothing was sent.
    console.info('[auth/recover] no deliverable account', { reason: result.reason })
  }

  return withFloor(
    startedAt,
    NextResponse.json({ ok: true, message: RECOVERY_GENERIC_RESPONSE }, { status: 200 }),
  )
}
