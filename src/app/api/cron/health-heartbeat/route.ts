import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runAllChecks, overallStatus } from '@/lib/health/checks'
import { sendHeartbeat } from '@/lib/health/runner'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * DAILY HEARTBEAT (docs/ops/HEALTH-ALERTS.md).
 *
 * One short daily email confirming all systems green (or listing any warnings),
 * so silence is never ambiguous: a MISSING heartbeat itself signals the monitor
 * is down. Cron-authed. `?dry=1` runs the checks without sending the email.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const results = await runAllChecks()
  const status = overallStatus(results)

  let sent = false
  if (!dry) {
    try {
      await sendHeartbeat(results)
      sent = true
    } catch (err) {
      console.error('[health-heartbeat] send failed:', err)
    }
  }

  return NextResponse.json({ ok: status !== 'critical', status, sent, dry, checkedAt: new Date().toISOString(), checks: results })
}
