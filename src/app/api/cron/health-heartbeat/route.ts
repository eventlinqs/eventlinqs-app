import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runAllChecks, overallStatus } from '@/lib/health/checks'
import { sendHeartbeat } from '@/lib/health/runner'
import { readMorningReport } from '@/lib/admin/morning-report'
import { melbourneDateWords, morningReportEmail } from '@/lib/admin/morning-report-email'
import { sendEmail } from '@/lib/email/send'
import { founderDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'

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

  // THE 08:00 REPORT, SENT HERE (the PM's 22:14 of 19 November 2026, item 4; src/lib/admin/morning-report-email.ts):
  // this cron runs daily at 08:00 Melbourne on Vercel's own scheduler, where GitHub's never started the state report's
  // daily job from 6 to 18 November. A failed read or send is named in the answer and the log, never thrown.
  let report: 'sent' | 'dry' | string = 'dry'
  if (!dry) {
    try {
      const now = new Date()
      const read = await readMorningReport(now)
      const email = morningReportEmail(read, { dateWords: melbourneDateWords(now), adminUrl: `${getSiteUrl()}/admin/today` })
      await sendEmail({ to: founderDestination(), ...email, messageType: 'platform_morning_report', recipientRole: 'platform_owner' })
      report = 'sent'
    } catch (err) {
      report = `not sent: ${err instanceof Error ? err.message : String(err)}`
      console.error('[health-heartbeat] the 08:00 report was not sent:', err)
    }
  }

  return NextResponse.json({ ok: status !== 'critical', status, sent, report, dry, checkedAt: new Date().toISOString(), checks: results })
}
