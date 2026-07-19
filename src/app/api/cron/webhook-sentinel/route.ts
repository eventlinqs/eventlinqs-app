import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import {
  selfProbe,
  driftWatchdog,
  endpointConfigCheck,
  type PaymentCheckResult,
} from '@/lib/health/payment-checks'

export const runtime = 'nodejs'

/**
 * PAYMENT SENTINEL (docs/payments/WEBHOOK-CANON.md). Ends the recurring webhook
 * fear: a scheduled health check over the REAL deployed webhook path, alerting
 * the founder the moment payments could silently stall.
 *
 * The three payment checks now live in src/lib/health/payment-checks.ts so the
 * broader PLATFORM HEALTH SENTINEL (/api/cron/health-sentinel) runs the exact
 * same logic - one source of truth for the money path. This route stays as the
 * focused, fast, money-only probe wired into post-deploy smoke.
 *
 *   A. SELF-PROBE   - a synthetic event signed with THIS deployment's secret is
 *      POSTed through the real route. Non-200 = handler broken; unreachable = down.
 *   B. DRIFT WATCHDOG - paid orders stuck pending while Stripe holds succeeded
 *      intents = the secret-drift class (2026-07-12).
 *   C. ENDPOINT CONFIG - exactly one enabled Stripe endpoint at the canonical URL.
 *
 * `?simulate=missign` (still cron-authed) signs probe A with a wrong secret on
 * purpose - the alert-path drill used for the documented proof.
 */

const ALERT_TO = () => process.env.PAYMENT_ALERT_EMAIL || 'lawaladams9@gmail.com'

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const missign = request.nextUrl.searchParams.get('simulate') === 'missign'
  const origin = getSiteUrl()
  const deployment = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin

  const checks: PaymentCheckResult[] = [
    await selfProbe(origin, missign),
    ...(missign ? [] : [await driftWatchdog(), await endpointConfigCheck(origin)]),
  ]

  const failures = checks.filter(c => !c.ok)
  let alerted = false
  if (failures.length > 0) {
    const lines = failures
      .map(f => `- ${f.name}: ${f.detail}${f.probableCause ? `\n  Probable cause: ${f.probableCause}` : ''}`)
      .join('\n')
    try {
      await sendEmail({
        to: ALERT_TO(),
        subject: `Payment sentinel ALERT: ${failures[0].probableCause ?? failures[0].name}`,
        text: `The payment sentinel found a problem.\n\nDeployment: ${deployment}\nWebhook path: ${origin}/api/webhooks/stripe\nTime: ${new Date().toISOString()}\n\n${lines}\n\nRunbook: docs/payments/WEBHOOK-CANON.md\n\nEventLinqs payment sentinel`,
        html: `<p><strong>The payment sentinel found a problem.</strong></p><p>Deployment: ${deployment}<br/>Webhook path: ${origin}/api/webhooks/stripe<br/>Time: ${new Date().toISOString()}</p><pre>${lines}</pre><p>Runbook: docs/payments/WEBHOOK-CANON.md</p><p>EventLinqs payment sentinel</p>`,
      })
      alerted = true
    } catch (err) {
      console.error('[webhook-sentinel] alert email failed:', err)
    }
  }

  const status = failures.length === 0 ? 200 : 503
  return NextResponse.json({ ok: failures.length === 0, deployment, checks, alerted }, { status })
}
