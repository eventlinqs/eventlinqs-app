import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

/**
 * PAYMENT SENTINEL (docs/payments/WEBHOOK-CANON.md). Ends the recurring
 * webhook fear: a scheduled health check over the REAL deployed webhook
 * path, alerting the founder the moment payments could silently stall.
 *
 * Three checks, each mapped to a probable cause:
 *   A. SELF-PROBE: a synthetic event signed with THIS deployment's
 *      STRIPE_WEBHOOK_SECRET is POSTed through the real route. Expected 200.
 *      Non-200 = the handler itself is broken (processing error);
 *      unreachable = endpoint down.
 *   B. DRIFT WATCHDOG: paid orders stuck `pending` beyond the grace window
 *      while Stripe holds succeeded intents = deliveries failing signature
 *      verification (the secret drift class that bit us on 2026-07-12) or
 *      endpoint misdelivery.
 *   C. ENDPOINT CONFIG: exactly one ENABLED Stripe endpoint must point at
 *      this environment's canonical webhook URL.
 *
 * `?simulate=missign` (still cron-authed) signs probe A with a wrong secret
 * on purpose - the alert-path drill used for the documented proof.
 *
 * READ-ONLY against the payment engine: it sends a no-op event type the
 * webhook route verifies and acknowledges; it never mutates orders, seats,
 * or money.
 */

const PENDING_GRACE_MINUTES = 15
const ALERT_TO = () => process.env.PAYMENT_ALERT_EMAIL || 'lawaladams9@gmail.com'

type CheckResult = { name: string; ok: boolean; detail: string; probableCause?: string }

function signStripePayload(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

async function selfProbe(origin: string, missign: boolean): Promise<CheckResult> {
  const name = missign ? 'self-probe (deliberate mis-sign drill)' : 'self-probe'
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return { name, ok: false, detail: 'STRIPE_WEBHOOK_SECRET is not set on this deployment', probableCause: 'missing webhook secret env' }
  }
  const payload = JSON.stringify({
    id: `evt_sentinel_${Date.now()}`,
    object: 'event',
    type: 'sentinel.probe',
    data: { object: {} },
  })
  const signWith = missign ? `${secret}_WRONG` : secret
  try {
    const res = await fetch(`${origin}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': signStripePayload(payload, signWith), 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(15000),
    })
    if (missign) {
      // The drill EXPECTS rejection; reaching here with 200 would itself be
      // an alarm (signature verification not running).
      return res.status === 400
        ? { name, ok: false, detail: 'mis-signed probe correctly rejected (400) - drill alert follows', probableCause: 'signature mismatch (drill)' }
        : { name, ok: false, detail: `mis-signed probe returned ${res.status} - verification may be OFF`, probableCause: 'signature verification not enforcing' }
    }
    if (res.ok) return { name, ok: true, detail: `signed probe accepted (${res.status})` }
    if (res.status === 400) {
      return { name, ok: false, detail: 'correctly-signed probe rejected 400', probableCause: 'signature mismatch: deployment secret differs from the signer' }
    }
    return { name, ok: false, detail: `probe returned ${res.status}`, probableCause: 'webhook processing error' }
  } catch (err) {
    return { name, ok: false, detail: `probe unreachable: ${String(err).slice(0, 120)}`, probableCause: 'endpoint down' }
  }
}

async function driftWatchdog(): Promise<CheckResult> {
  const name = 'pending-order drift watchdog'
  try {
    const admin = createAdminClient()
    const cutoffNew = new Date(Date.now() - PENDING_GRACE_MINUTES * 60 * 1000).toISOString()
    const cutoffOld = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: stuck, error } = await admin
      .from('orders')
      .select('order_number, total_cents, created_at')
      .eq('status', 'pending')
      .gt('total_cents', 0)
      .lt('created_at', cutoffNew)
      .gt('created_at', cutoffOld)
      .limit(10)
    if (error) return { name, ok: false, detail: `orders query failed: ${error.message}`, probableCause: 'database unreachable from sentinel' }
    if (!stuck || stuck.length === 0) return { name, ok: true, detail: 'no paid orders stuck pending beyond the grace window' }
    return {
      name,
      ok: false,
      detail: `${stuck.length} paid order(s) pending > ${PENDING_GRACE_MINUTES}m: ${stuck.map(o => o.order_number).join(', ')}`,
      probableCause: 'webhook deliveries failing (signature mismatch or endpoint misdelivery) while payments succeed',
    }
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 160), probableCause: 'sentinel internal error' }
  }
}

async function endpointConfigCheck(origin: string): Promise<CheckResult> {
  const name = 'stripe endpoint config'
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { name, ok: false, detail: 'STRIPE_SECRET_KEY missing', probableCause: 'missing Stripe env' }
  try {
    const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=16', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json()) as { data?: { status: string; url: string }[] }
    const enabled = (j.data ?? []).filter(w => w.status === 'enabled')
    const host = new URL(origin).host
    const canonicalHost = process.env.WEBHOOK_CANONICAL_HOST || host
    const matching = enabled.filter(w => new URL(w.url).host === canonicalHost)
    if (matching.length === 1) return { name, ok: true, detail: `one enabled endpoint at ${canonicalHost}` }
    if (matching.length === 0) {
      return { name, ok: false, detail: `no ENABLED endpoint points at ${canonicalHost} (enabled: ${enabled.map(w => w.url).join(', ') || 'none'})`, probableCause: 'endpoint down or misconfigured' }
    }
    return { name, ok: false, detail: `${matching.length} enabled endpoints at ${canonicalHost} - two signers invite drift`, probableCause: 'duplicate endpoints (the historical two-secret failure)' }
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 160), probableCause: 'Stripe API unreachable from sentinel' }
  }
}

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const missign = request.nextUrl.searchParams.get('simulate') === 'missign'
  const origin = getSiteUrl()
  const deployment = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin

  const checks: CheckResult[] = [
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
