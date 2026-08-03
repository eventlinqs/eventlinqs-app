import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { dispatchVerificationResend } from '@/lib/auth/dispatch-auth-link'
import { safeAuthOrigin } from '@/lib/auth/safe-origin'
import { authMessage, RESEND_VERIFICATION_GENERIC_RESPONSE } from '@/lib/auth/auth-errors'

export const dynamic = 'force-dynamic'

/**
 * RESEND A SIGNUP CONFIRMATION.
 *
 * The last of the three flows left on Supabase Auth's built-in mailer. The May
 * 2026 closure report named it explicitly as a follow-up
 * (docs/hardening/auth-defects/closure-report.md, Defect 1) and it was never
 * done, so a user who missed the first confirmation email hit the same
 * 2-per-hour cap when they asked for another.
 *
 * Enumeration matters more here than anywhere else on the platform: an
 * unguarded resend endpoint answers "does this address have an unconfirmed
 * account" for any address on request. Both "no such user" and "already
 * confirmed" therefore fold into the same generic 200 as success, and the
 * response-time floor covers the timing side.
 */

const BodySchema = z.object({
  email: z.string().email().max(254),
})

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

  const limited = await applyRateLimit('auth-resend-verification', request)
  if (limited) return limited

  let email: string
  try {
    email = BodySchema.parse(await request.json()).email
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const result = await dispatchVerificationResend({
    email,
    origin: safeAuthOrigin(request),
  })

  if (result.outcome === 'send_failed') {
    console.error('[auth/resend-verification] transport failure', {
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
    console.info('[auth/resend-verification] nothing to resend', { reason: result.reason })
  }

  return withFloor(
    startedAt,
    NextResponse.json(
      { ok: true, message: RESEND_VERIFICATION_GENERIC_RESPONSE },
      { status: 200 },
    ),
  )
}
