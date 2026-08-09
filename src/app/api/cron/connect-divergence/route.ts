import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { alertDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'
import { scanConnectDivergence, describeDivergence } from '@/lib/stripe/connect-divergence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * THE DIVERGENCE GUARD. Fails when the platform's payout columns disagree with
 * Stripe for any connected organisation. Reports; never corrects.
 *
 * WHY IT IS NOT THE RECONCILER RUN TWICE. The hourly reconcile at
 * /api/cron/connect-reconcile repairs drift. That is right for the organiser who is
 * stranded, and it is also how a systemic fault becomes invisible: if
 * `account.updated` is not being delivered at all, the reconcile patches everybody
 * every hour and the platform looks perfectly healthy because something broken is
 * being continuously papered over. This route is the one that says so out loud.
 *
 * So it is READ-ONLY, on purpose and by contract. src/lib/stripe/connect-divergence.ts
 * performs no write of any kind, not even to fix an obvious error, because a guard
 * that corrects what it finds destroys the evidence it exists to collect.
 *
 * SCHEDULING. Every six hours, at 47 minutes past, so it never lands on the same
 * minute as the hourly money crons (the schedule itself is in vercel.json; it is
 * not written here because a cron expression contains the two characters that end
 * a block comment, which is a lesson this file learned the hard way). It is
 * deliberately LESS frequent than the reconcile: the reconcile is the repair, this
 * is the audit, and an audit that runs as often as the repair only ever tells you
 * that the repair is working.
 *
 * WHAT RED MEANS. A 503 with a `blocking` list means at least one organisation's
 * ability to trade is described wrongly by the platform. That is the founder's own
 * lockout class: the row said restricted while Stripe said fully enabled. Somebody
 * either cannot sell when they should, or can when Stripe has stopped them. It is
 * always worth a human.
 *
 * Nothing here touches a charge, a payout, a fee or a refund. It reads, compares and
 * reports.
 */

const ALERT_TO = () => alertDestination()

/**
 * The report carries organisation names, which are organiser-supplied text. They go
 * into an HTML email, so they are escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const blocked = await applyRateLimit('cron-job', request)
  if (blocked) return blocked

  let report
  try {
    report = await scanConnectDivergence(createAdminClient())
  } catch (err) {
    console.error('[cron/connect-divergence] scan failed', { err })
    return NextResponse.json({ ok: false, error: 'scan_failed' }, { status: 500 })
  }

  const red = report.blocking.length > 0 || report.halfCleared.length > 0
  const summary = describeDivergence(report)

  console.log(
    `[cron/connect-divergence] ${red ? 'RED' : 'GREEN'} ` +
      `checked=${report.checked} blocking=${report.blocking.length} ` +
      `halfCleared=${report.halfCleared.length} stale=${report.informational.length} ` +
      `unreachable=${report.unreachable.length}` +
      (summary ? `\n${summary}` : ''),
  )

  let alerted = false
  if (red) {
    const origin = getSiteUrl()
    const body =
      `The platform's payout columns disagree with Stripe.\n\n` +
      `This is the class of fault that stranded organisation ` +
      `8baf2eaa-c592-41b7-a303-3df92b2eaa77: the row said restricted while Stripe ` +
      `reported the account fully enabled, and nothing noticed.\n\n` +
      `Checked: ${report.checked} connected organisations\n` +
      `Blocking: ${report.blocking.length}\n` +
      `Half-cleared rows: ${report.halfCleared.length}\n` +
      `Stale but harmless: ${report.informational.length}\n` +
      `Unreachable: ${report.unreachable.length}\n\n` +
      `${summary}\n\n` +
      `NOTHING WAS CHANGED. This guard only reports. The organiser can correct their\n` +
      `own row with Refresh Stripe status on ${origin}/dashboard/payouts, and the\n` +
      `hourly reconcile will also correct it. If this keeps firing, the repair is\n` +
      `working and the CAUSE is not: check that the Stripe webhook endpoint is a\n` +
      `CONNECT endpoint subscribed to account.updated, because a platform-only\n` +
      `endpoint never receives it no matter what events are ticked.\n\n` +
      `EventLinqs connect divergence guard`
    try {
      await sendEmail({
        to: ALERT_TO(),
        subject: `Connect divergence: ${report.blocking.length} organisation(s) described wrongly`,
        text: body,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
      })
      alerted = true
    } catch (err) {
      console.error('[cron/connect-divergence] alert email failed:', err)
    }
  }

  return NextResponse.json(
    {
      ok: !red,
      checked: report.checked,
      blocking: report.blocking,
      halfCleared: report.halfCleared,
      informational: report.informational.length,
      unreachable: report.unreachable,
      alerted,
      // Said explicitly in the payload so nobody reading a red response wonders
      // whether it also "helpfully" fixed anything.
      wrote: false,
    },
    { status: red ? 503 : 200 },
  )
}
