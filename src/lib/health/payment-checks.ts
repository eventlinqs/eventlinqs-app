import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Payment-path health checks, extracted from the original webhook-sentinel
 * route so BOTH the payment sentinel cron AND the platform health sentinel
 * run the SAME battle-tested logic (docs/payments/WEBHOOK-CANON.md). One
 * source of truth for the money path; the health monitor wraps these, it does
 * not reimplement them.
 *
 * READ-ONLY against the payment engine: the self-probe sends a no-op event the
 * webhook route verifies and acknowledges; nothing mutates orders, seats, or
 * money.
 */

export const PENDING_GRACE_MINUTES = 15

export type PaymentCheckResult = {
  name: string
  ok: boolean
  detail: string
  probableCause?: string
}

export function signStripePayload(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

export async function selfProbe(origin: string, missign: boolean): Promise<PaymentCheckResult> {
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

export async function driftWatchdog(): Promise<PaymentCheckResult> {
  const name = 'pending-order drift watchdog'
  try {
    const admin = createAdminClient()
    const cutoffNew = new Date(Date.now() - PENDING_GRACE_MINUTES * 60 * 1000).toISOString()
    const cutoffOld = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: stuck, error } = await admin
      .from('orders')
      .select('id, order_number, total_cents, created_at')
      .eq('status', 'pending')
      .gt('total_cents', 0)
      .lt('created_at', cutoffNew)
      .gt('created_at', cutoffOld)
      .limit(10)
    if (error) return { name, ok: false, detail: `orders query failed: ${error.message}`, probableCause: 'database unreachable from sentinel' }
    if (!stuck || stuck.length === 0) return { name, ok: true, detail: 'no paid orders stuck pending beyond the grace window' }

    // TRUE DRIFT ONLY: an abandoned checkout (buyer never paid) is normal and
    // expires through its own flow. Alert only when Stripe holds a SUCCEEDED
    // intent for a stuck-pending order - money taken, order not confirmed, the
    // 2026-07-12 incident class. Cross-checking Stripe is what stops the
    // monitor crying wolf over ordinary abandoned carts.
    const key = process.env.STRIPE_SECRET_KEY
    let succeededOrderIds = new Set<string>()
    if (key) {
      const res = await fetch('https://api.stripe.com/v1/events?types[]=payment_intent.succeeded&limit=50', {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      })
      const j = (await res.json()) as { data?: { data: { object: { metadata?: Record<string, string> } } }[] }
      succeededOrderIds = new Set(
        (j.data ?? [])
          .map(e => e.data?.object?.metadata?.order_id)
          .filter((v): v is string => Boolean(v)),
      )
    }
    const drifted = stuck.filter(o => succeededOrderIds.has(o.id))
    if (drifted.length === 0) {
      return {
        name,
        ok: true,
        detail: `${stuck.length} pending order(s) are abandoned checkouts (no succeeded intent) - no drift`,
      }
    }
    return {
      name,
      ok: false,
      detail: `${drifted.length} order(s) PAID at Stripe but still pending: ${drifted.map(o => o.order_number).join(', ')}`,
      probableCause: 'webhook deliveries failing (signature mismatch or endpoint misdelivery) while payments succeed',
    }
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 160), probableCause: 'sentinel internal error' }
  }
}

export async function endpointConfigCheck(origin: string): Promise<PaymentCheckResult> {
  const name = 'stripe endpoint config'
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { name, ok: false, detail: 'STRIPE_SECRET_KEY missing', probableCause: 'missing Stripe env' }
  try {
    const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=16', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json()) as { data?: { status: string; url: string; application?: string | null }[] }
    const enabled = (j.data ?? []).filter(w => w.status === 'enabled')
    const host = new URL(origin).host
    const canonicalHost = process.env.WEBHOOK_CANONICAL_HOST || host
    const matching = enabled.filter(w => new URL(w.url).host === canonicalHost)

    // The invariant is per DELIVERY CHANNEL, not per host. Stripe splits
    // deliveries into ACCOUNT events (payment_intent, charge, checkout.session,
    // transfer) and CONNECTED-ACCOUNT events (account.*, payout.*,
    // charge.dispute.*), and an endpoint serves one channel or the other. The
    // platform deliberately runs one of each at the same URL, each with its own
    // signing secret - which is why the route verifies against every secret in
    // STRIPE_WEBHOOK_SECRETS.
    //
    // What still must never happen is TWO endpoints on the SAME channel: that
    // is the historical drift failure, where deliveries alternate between two
    // signers and half of them 400.
    // A connected-account endpoint is identified by a NON-NULL `application`
    // (the Connect application it is attached to). Stripe does not echo the
    // `connect: true` create parameter back as a boolean on the object, so
    // testing for one silently classifies every endpoint as an account
    // endpoint - and the duplicate check then fires on a correct setup.
    const accountEps = matching.filter(w => !w.application)
    const connectEps = matching.filter(w => Boolean(w.application))

    if (accountEps.length === 0) {
      return { name, ok: false, detail: `no ENABLED account endpoint points at ${canonicalHost} (enabled: ${enabled.map(w => w.url).join(', ') || 'none'})`, probableCause: 'endpoint down or misconfigured' }
    }
    const dupes: string[] = []
    if (accountEps.length > 1) dupes.push(`${accountEps.length} account`)
    if (connectEps.length > 1) dupes.push(`${connectEps.length} connected-account`)
    if (dupes.length > 0) {
      return { name, ok: false, detail: `${dupes.join(' and ')} enabled endpoints at ${canonicalHost} - two signers on one channel invite drift`, probableCause: 'duplicate endpoints on the same delivery channel (the historical two-secret failure)' }
    }
    return {
      name,
      ok: true,
      detail: `1 account endpoint${connectEps.length === 1 ? ' + 1 connected-account endpoint' : ' (no connected-account endpoint)'} at ${canonicalHost}`,
    }
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 160), probableCause: 'Stripe API unreachable from sentinel' }
  }
}
