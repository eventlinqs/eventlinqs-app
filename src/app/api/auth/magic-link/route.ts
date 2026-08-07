import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { dispatchMagicLink } from '@/lib/auth/dispatch-auth-link'
import { safeAuthOrigin } from '@/lib/auth/safe-origin'
import { authMessage, MAGIC_LINK_GENERIC_RESPONSE } from '@/lib/auth/auth-errors'

export const dynamic = 'force-dynamic'

/**
 * MAGIC-LINK SIGN-IN REQUEST.
 *
 * Replaces the browser's `supabase.auth.signInWithOtp()`, which sent through
 * Supabase Auth's built-in mailer and its 2-per-hour project-wide cap. Same
 * root cause as password reset, same fix, same contracts: generic response for
 * every account-dependent outcome (brief 1.4), honest 502 for a real transport
 * failure (brief 1.5), and a response-time floor so the two cannot be told
 * apart by stopwatch.
 *
 * `next` is accepted so a user bounced off a protected route by middleware
 * lands back where they were headed. It is validated as an internal path here
 * rather than trusted, because it ends up inside an emailed URL.
 */

const BodySchema = z.object({
  email: z.string().email().max(254),
  next: z.string().max(512).optional(),
})

const RESPONSE_FLOOR_MS = 900

async function withFloor<T>(startedAt: number, value: T): Promise<T> {
  const elapsed = Date.now() - startedAt
  if (elapsed < RESPONSE_FLOOR_MS) {
    await new Promise((r) => setTimeout(r, RESPONSE_FLOOR_MS - elapsed))
  }
  return value
}

/**
 * Only same-origin absolute paths survive. Rejects protocol-relative `//host`
 * and any absolute URL, which is the open-redirect shape that matters most
 * here: this value is baked into a link we email, so a permissive check would
 * turn our own mail into a phishing carrier.
 */
export function safeNextPath(candidate: string | undefined): string {
  if (!candidate) return '/dashboard'
  if (!candidate.startsWith('/')) return '/dashboard'
  if (candidate.startsWith('//')) return '/dashboard'
  if (candidate.includes('://')) return '/dashboard'
  if (candidate.includes('\\')) return '/dashboard'
  return candidate
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  const limited = await applyRateLimit('auth-magic-link', request)
  if (limited) return limited

  let parsed: z.infer<typeof BodySchema>
  try {
    parsed = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const result = await dispatchMagicLink({
    email: parsed.email,
    origin: safeAuthOrigin(request),
    next: safeNextPath(parsed.next),
  })

  if (result.outcome === 'send_failed') {
    console.error('[auth/magic-link] transport failure', {
      email: parsed.email,
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
    console.info('[auth/magic-link] no deliverable account', { reason: result.reason })
  }

  return withFloor(
    startedAt,
    NextResponse.json({ ok: true, message: MAGIC_LINK_GENERIC_RESPONSE }, { status: 200 }),
  )
}
