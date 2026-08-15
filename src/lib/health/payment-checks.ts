import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveWebhookSecrets } from '@/lib/payments/stripe-adapter'
import { businessNameDivergence } from '@/lib/stripe/business-profile'

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

/**
 * Report every organisation whose name disagrees with the business name on its
 * connected Stripe account.
 *
 * WHY THIS EXISTS. Prefilling `business_profile.name` at account creation closes
 * the hole at the moment it was opened, but it cannot hold it shut: Stripe lets
 * the organiser edit the name inside the hosted onboarding form and, afterwards,
 * inside the Express Dashboard. That is how production ended up with an
 * organisation called "Party Pty Ltd" whose Stripe account reads "Eventlinqs",
 * with nothing anywhere reporting the disagreement. Silent divergence is the
 * actual defect; the empty form was only how it started.
 *
 * On the example itself: "Party Pty Ltd" is NOT a company and not EventLinqs'
 * legal entity. It is the founder's TEST organiser record, created with a
 * made-up name to put a real card through a $1 checkout, and it is deleted once
 * that passes. The divergence it exposed is real and this check stays; the name
 * is a fixture, so do not read it as a customer.
 *
 * ONE Stripe call, not one per organisation. `/v1/accounts` returns
 * `business_profile` inline, so a platform with a hundred organisers costs a
 * single request rather than a hundred, and the sentinel stays cheap enough to
 * run on every cron tick.
 *
 * Reports `ok: false` at WARNING severity only. A mismatched name is a real
 * problem worth a founder's attention, but it is not an outage: tickets still
 * sell and payouts still land, so it must never be allowed to mark the payment
 * path as down or wake anyone at night.
 */
export async function connectNameDivergenceCheck(): Promise<PaymentCheckResult> {
  const name = 'connect business-name divergence'
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return emit({ name, ok: false, detail: 'STRIPE_SECRET_KEY missing', probableCause: 'missing Stripe env' })
  try {
    const admin = createAdminClient()
    const { data: orgs, error } = await admin
      .from('organisations')
      .select('id, name, stripe_account_id')
      .not('stripe_account_id', 'is', null)
      .limit(200)
    if (error) return emit({ name, ok: false, detail: `organisations query failed: ${error.message}`, probableCause: 'database unreachable from sentinel' })
    if (!orgs || orgs.length === 0) return emit({ name, ok: true, detail: 'no connected organisations to compare' })

    const res = await fetch('https://api.stripe.com/v1/accounts?limit=100', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json()) as {
      error?: { message?: string }
      data?: { id: string; business_profile?: { name?: string | null } | null }[]
    }
    if (j.error) return emit({ name, ok: false, detail: `Stripe accounts list failed: ${j.error.message ?? 'unknown'}`, probableCause: 'Stripe API rejected the sentinel key' })

    const stripeNames = new Map<string, string | null>()
    for (const a of j.data ?? []) stripeNames.set(a.id, a.business_profile?.name ?? null)

    // Group BY CONNECTED ACCOUNT, not by organisation.
    //
    // The first cut of this check iterated organisations and reported one line
    // per row, which on TEST produced "31 of 40 disagree" where the same seeded
    // account appeared five times over. A monitor that reports one fault five
    // times teaches the reader to skim past it, so the unit of a finding here is
    // the ACCOUNT, reported once, however many organisations point at it.
    const byAccount = new Map<string, { id: string; name: string }[]>()
    for (const org of orgs) {
      if (!org.stripe_account_id || !stripeNames.has(org.stripe_account_id)) continue
      const list = byAccount.get(org.stripe_account_id) ?? []
      list.push({ id: org.id, name: org.name })
      byAccount.set(org.stripe_account_id, list)
    }

    if (byAccount.size === 0) {
      return emit({ name, ok: true, detail: `${orgs.length} connected organisation(s), none present in the first 100 Stripe accounts - nothing compared` })
    }

    // Two distinct faults, kept apart because they need different fixes.
    const diverged: string[] = []
    const shared: string[] = []
    for (const [accountId, owners] of byAccount) {
      // More than one organisation pointing at ONE connected account is its own
      // defect, and a worse one than a name mismatch: every organiser sharing it
      // is paid into the same Stripe account. Comparing names here is
      // meaningless (at most one of them can match), so it is reported as what
      // it is rather than as N name mismatches.
      if (owners.length > 1) {
        shared.push(`${accountId} is claimed by ${owners.length} organisations (${owners.slice(0, 3).map(o => `"${o.name}"`).join(', ')}${owners.length > 3 ? ', ...' : ''})`)
        continue
      }
      const verdict = businessNameDivergence(owners[0].name, stripeNames.get(accountId))
      if (verdict.status === 'diverged') {
        diverged.push(`"${verdict.platformName}" on EventLinqs is "${verdict.stripeName}" at Stripe (${accountId})`)
      }
    }

    if (diverged.length === 0 && shared.length === 0) {
      return emit({ name, ok: true, detail: `${byAccount.size} connected account(s) compared, every business name matches` })
    }

    const parts: string[] = []
    if (diverged.length > 0) {
      parts.push(`${diverged.length} of ${byAccount.size} connected account(s) disagree: ${diverged.slice(0, 5).join(' | ')}${diverged.length > 5 ? ` (+${diverged.length - 5} more)` : ''}`)
    }
    if (shared.length > 0) {
      parts.push(`${shared.length} connected account(s) shared by multiple organisations: ${shared.slice(0, 3).join(' | ')}${shared.length > 3 ? ` (+${shared.length - 3} more)` : ''}`)
    }
    return emit({
      name,
      ok: false,
      detail: parts.join(' || '),
      probableCause:
        shared.length > 0 && diverged.length === 0
          ? 'more than one organisation row carries the same stripe_account_id, so payouts for several organisers route to one Stripe account'
          : 'the organiser edited the business name inside Stripe, or the account was created before the platform prefilled business_profile.name',
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
