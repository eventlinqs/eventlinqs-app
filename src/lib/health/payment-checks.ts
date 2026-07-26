import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveWebhookSecrets } from '@/lib/payments/stripe-adapter'

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

/**
 * Every check reports its OWN result and reason to the runtime log.
 *
 * Why (2026-07-26): the payment sentinel returned 503 on production and the
 * logs could not say WHICH of its checks failed, because only the alert-email
 * failure was ever logged. A monitor that can tell you something is wrong but
 * not what is wrong costs an investigation every time it fires. Every result
 * now passes through here, so the answer is in the log before anyone asks.
 *
 * Safe to log: a result carries a name, a plain-language detail and a probable
 * cause. It never carries a signing secret, an API key or a card detail.
 */
function emit(result: PaymentCheckResult): PaymentCheckResult {
  const status = result.ok ? 'PASS' : 'FAIL'
  console.log(
    `[payment-check] ${status} ${result.name} :: ${result.detail}` +
      (result.probableCause ? ` :: probable cause: ${result.probableCause}` : ''),
  )
  return result
}

/**
 * A one-way fingerprint, so a log line can say WHICH signing secret a probe
 * used without ever printing the secret. Matches the fingerprint that
 * scripts/verify/webhook-signature-probe.mjs prints, so a manual probe and a
 * sentinel log line can be correlated by eye.
 */
function secretFingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10)
}

export function signStripePayload(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

/** POST one synthetic `sentinel.probe` through the REAL webhook route. */
async function probeOnce(
  origin: string,
  signWith: string,
  opts: { name: string; missign: boolean },
): Promise<PaymentCheckResult> {
  const { name, missign } = opts
  const payload = JSON.stringify({
    id: `evt_sentinel_${Date.now()}`,
    object: 'event',
    type: 'sentinel.probe',
    data: { object: {} },
  })
  try {
    const res = await fetch(`${origin}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': signStripePayload(payload, signWith), 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(15000),
    })
    if (missign) {
      return emit(
        res.status === 400
          ? { name, ok: false, detail: 'mis-signed probe correctly rejected (400) - drill alert follows', probableCause: 'signature mismatch (drill)' }
          : { name, ok: false, detail: `mis-signed probe returned ${res.status} - verification may be OFF`, probableCause: 'signature verification not enforcing' },
      )
    }
    if (res.ok) return emit({ name, ok: true, detail: `signed probe accepted (${res.status})` })
    if (res.status === 400) {
      return emit({ name, ok: false, detail: 'correctly-signed probe rejected 400', probableCause: 'the deployment did not accept a secret it is configured with: STRIPE_SECRET_KEY may be unset (getStripeClient throws before verification and the route reports it as Invalid signature), or the route is not reading this secret' })
    }
    return emit({ name, ok: false, detail: `probe returned ${res.status}`, probableCause: 'webhook processing error' })
  } catch (err) {
    return emit({ name, ok: false, detail: `probe unreachable: ${String(err).slice(0, 120)}`, probableCause: 'endpoint down' })
  }
}

/**
 * Probe the real webhook route ONCE PER CONFIGURED SIGNING SECRET.
 *
 * Why one per secret (2026-07-26): Stripe mints a DIFFERENT signing secret per
 * endpoint, and the platform runs two at the same URL - the account endpoint
 * (payment_intent, charge, checkout.session, transfer) and the
 * connected-accounts endpoint (account.*, payout.*, charge.dispute.*). The
 * previous probe signed with `STRIPE_WEBHOOK_SECRET` (singular) only, so the
 * pair in `STRIPE_WEBHOOK_SECRETS` was never exercised on the deployment that
 * serves them. `resolveWebhookSecrets()` is imported from the adapter rather
 * than re-parsed here, so the sentinel and the route can never disagree about
 * which secrets this deployment accepts.
 *
 * WHAT THIS PROVES: for every secret this deployment holds, the real route is
 * reachable, `getStripeClient()` constructs (so `STRIPE_SECRET_KEY` is set and
 * non-empty), and the multi-secret verification loop accepts that secret.
 *
 * WHAT THIS DOES NOT PROVE, deliberately stated so no one reads more into a
 * green result than it carries: it does NOT prove Stripe is SIGNING with these
 * secrets. The prober and the route read the same env, so a secret that is
 * configured will always verify against itself even if Stripe holds a
 * different one for that endpoint. Only a real Stripe delivery proves that,
 * and `endpointConfigCheck` below catches the structural half of it by
 * asserting we hold at least one secret per enabled delivery channel.
 */
export async function selfProbe(origin: string, missign: boolean): Promise<PaymentCheckResult[]> {
  const secrets = resolveWebhookSecrets()
  if (secrets.length === 0) {
    return [
      emit({
        name: 'self-probe',
        ok: false,
        detail: 'no webhook signing secret is set (STRIPE_WEBHOOK_SECRETS or STRIPE_WEBHOOK_SECRET)',
        probableCause: 'missing webhook secret env',
      }),
    ]
  }

  if (missign) {
    // The drill deliberately corrupts the FIRST secret so the alert path can be
    // exercised on demand. One probe is enough to prove rejection works.
    return [
      await probeOnce(origin, `${secrets[0]}_WRONG`, {
        name: 'self-probe (deliberate mis-sign drill)',
        missign: true,
      }),
    ]
  }

  // Sequential, not parallel: two or three probes is a trivial cost, and an
  // ordered set of log lines is far easier to read during an incident.
  const results: PaymentCheckResult[] = []
  for (let i = 0; i < secrets.length; i++) {
    results.push(
      await probeOnce(origin, secrets[i], {
        name: `self-probe (secret ${i + 1} of ${secrets.length}, fp ${secretFingerprint(secrets[i])})`,
        missign: false,
      }),
    )
  }
  return results
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
    if (error) return emit({ name, ok: false, detail: `orders query failed: ${error.message}`, probableCause: 'database unreachable from sentinel' })
    if (!stuck || stuck.length === 0) return emit({ name, ok: true, detail: 'no paid orders stuck pending beyond the grace window' })

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
      return emit({
        name,
        ok: true,
        detail: `${stuck.length} pending order(s) are abandoned checkouts (no succeeded intent) - no drift`,
      })
    }
    return emit({
      name,
      ok: false,
      detail: `${drifted.length} order(s) PAID at Stripe but still pending: ${drifted.map(o => o.order_number).join(', ')}`,
      probableCause: 'webhook deliveries failing (signature mismatch or endpoint misdelivery) while payments succeed',
    })
  } catch (err) {
    return emit({ name, ok: false, detail: String(err).slice(0, 160), probableCause: 'sentinel internal error' })
  }
}

export async function endpointConfigCheck(origin: string): Promise<PaymentCheckResult> {
  const name = 'stripe endpoint config'
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return emit({ name, ok: false, detail: 'STRIPE_SECRET_KEY missing', probableCause: 'missing Stripe env' })
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
      return emit({ name, ok: false, detail: `no ENABLED account endpoint points at ${canonicalHost} (enabled: ${enabled.map(w => w.url).join(', ') || 'none'})`, probableCause: 'endpoint down or misconfigured' })
    }
    const dupes: string[] = []
    if (accountEps.length > 1) dupes.push(`${accountEps.length} account`)
    if (connectEps.length > 1) dupes.push(`${connectEps.length} connected-account`)
    if (dupes.length > 0) {
      return emit({ name, ok: false, detail: `${dupes.join(' and ')} enabled endpoints at ${canonicalHost} - two signers on one channel invite drift`, probableCause: 'duplicate endpoints on the same delivery channel (the historical two-secret failure)' })
    }

    // SECRET COVERAGE (2026-07-26). Stripe mints one signing secret per
    // ENDPOINT, so N enabled endpoints at our host need N secrets configured.
    // Hold fewer and every delivery from the uncovered endpoint fails signature
    // verification and 400s forever, while payments keep succeeding: the exact
    // 2026-07-25 failure, where the connected-accounts endpoint existed and its
    // secret did not. Counting is the strongest check available, because Stripe
    // never reveals an existing endpoint's secret, so a secret cannot be
    // matched to its endpoint from here.
    const channelsEnabled = accountEps.length + connectEps.length
    const secretsHeld = resolveWebhookSecrets().length
    if (secretsHeld < channelsEnabled) {
      return emit({
        name,
        ok: false,
        detail: `${channelsEnabled} enabled endpoint(s) at ${canonicalHost} but only ${secretsHeld} signing secret(s) configured`,
        probableCause: 'at least one Stripe endpoint has no matching secret in STRIPE_WEBHOOK_SECRETS, so every delivery from it will 400 while payments succeed',
      })
    }

    return emit({
      name,
      ok: true,
      detail: `1 account endpoint${connectEps.length === 1 ? ' + 1 connected-account endpoint' : ' (no connected-account endpoint)'} at ${canonicalHost}, ${secretsHeld} signing secret(s) configured`,
    })
  } catch (err) {
    return emit({ name, ok: false, detail: String(err).slice(0, 160), probableCause: 'Stripe API unreachable from sentinel' })
  }
}
