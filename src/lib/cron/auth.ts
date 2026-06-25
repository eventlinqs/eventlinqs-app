import { NextResponse, type NextRequest } from 'next/server'

/**
 * Cron authorisation, FAIL CLOSED.
 *
 * Returns a 401 response when the request is not an authorised cron call, or
 * null when it is. A cron route MUST refuse to run when CRON_SECRET is unset:
 * an absent secret is treated as locked, never open. This is deliberate. The
 * money-moving crons (event-disbursement, payout-holds-release) and the alert
 * cron were previously guarded by `if (cronSecret && ...)`, which skipped auth
 * entirely when the secret was missing and left them publicly triggerable on
 * any deploy that forgot to set it. Failing closed means a misconfigured
 * environment disables the crons rather than exposing them.
 *
 * Vercel Cron sends the secret as `Authorization: Bearer <CRON_SECRET>`.
 *
 * Usage in a route handler:
 *   const denied = requireCronAuth(request)
 *   if (denied) return denied
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  return null
}
