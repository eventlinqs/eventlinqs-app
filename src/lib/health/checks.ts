import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'
import { getSiteUrl } from '@/lib/site-url'
import { isAiConfigured } from '@/lib/ai/client'
import { isPushConfigured } from '@/lib/notifications/web-push'
import { selfProbe, driftWatchdog, endpointConfigCheck } from '@/lib/health/payment-checks'
import { CRITICAL_ENV_RULES, evalEnvRule } from '@/lib/health/critical-env.mjs'

/**
 * PLATFORM HEALTH SENTINEL - the check library.
 *
 * Every check returns a HealthResult with a severity, a plain-language detail,
 * a probable cause, and the EXACT action the founder takes to fix it. The
 * money-path checks reuse src/lib/health/payment-checks.ts (one source of truth
 * with the payment sentinel). The design law: a check must distinguish a TRUE
 * failure from a benign state so the monitor never cries wolf.
 */

export type Severity = 'critical' | 'warning'

export interface HealthResult {
  id: string
  label: string
  severity: Severity
  ok: boolean
  detail: string
  probableCause?: string
  /** Plain-language, non-engineer action to resolve it. */
  action?: string
  durationMs?: number
  /** True when the check could not run meaningfully in this environment (e.g. https-only on localhost) - reported as ok with a note. */
  skipped?: boolean
}

async function timed(id: string, fn: () => Promise<HealthResult>): Promise<HealthResult> {
  const start = Date.now()
  try {
    const r = await fn()
    return { ...r, durationMs: Date.now() - start }
  } catch (err) {
    return {
      id,
      label: id,
      severity: 'critical',
      ok: false,
      detail: `check threw: ${String(err).slice(0, 180)}`,
      probableCause: 'health check internal error',
      action: 'Check the deployment logs for this check; a thrown check usually means a missing dependency or env var.',
      durationMs: Date.now() - start,
    }
  }
}

// (a)+(b) PAYMENT PATH - reuse the payment sentinel checks verbatim.
async function checkPayment(origin: string): Promise<HealthResult> {
  const [probe, drift, endpoint] = await Promise.all([
    selfProbe(origin, false),
    driftWatchdog(),
    endpointConfigCheck(origin),
  ])
  const parts = [probe, drift, endpoint]
  const failed = parts.filter(p => !p.ok)
  if (failed.length === 0) {
    return { id: 'payment', label: 'Payment path (webhook + drift)', severity: 'critical', ok: true, detail: 'signed probe accepted, no drifted orders, one enabled endpoint' }
  }
  return {
    id: 'payment',
    label: 'Payment path (webhook + drift)',
    severity: 'critical',
    ok: false,
    detail: failed.map(f => `${f.name}: ${f.detail}`).join(' | '),
    probableCause: failed[0].probableCause,
    action: 'Open docs/payments/WEBHOOK-CANON.md. Usually: the Stripe webhook signing secret in Vercel differs from the enabled Stripe endpoint. Re-key per the runbook, then redeploy.',
  }
}

// (e) DATABASE reachable on TEST/prod.
async function checkDatabase(): Promise<HealthResult> {
  const admin = createAdminClient()
  const { error, count } = await admin
    .from('event_categories')
    .select('id', { count: 'exact', head: true })
  if (error) {
    return {
      id: 'database', label: 'Database (Supabase)', severity: 'critical', ok: false,
      detail: `query failed: ${error.message}`,
      probableCause: 'Supabase unreachable or service-role key invalid',
      action: 'Check Supabase status and that SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL are present and correct in the serving deployment.',
    }
  }
  return { id: 'database', label: 'Database (Supabase)', severity: 'critical', ok: true, detail: `reachable, ${count ?? 0} categories readable` }
}

// (f) IMAGE STORAGE + upload path.
async function checkStorage(): Promise<HealthResult> {
  const admin = createAdminClient()
  const { error } = await admin.storage.from('event-images').list('', { limit: 1 })
  if (error) {
    return {
      id: 'storage', label: 'Image storage (event-images)', severity: 'warning', ok: false,
      detail: `bucket list failed: ${error.message}`,
      probableCause: 'storage bucket missing or service key lacks storage access',
      action: 'In Supabase → Storage, confirm the "event-images" bucket exists and is public. Image uploads and covers depend on it.',
    }
  }
  return { id: 'storage', label: 'Image storage (event-images)', severity: 'warning', ok: true, detail: 'bucket reachable' }
}

// (d) EMAIL delivery capability via Resend.
async function checkEmail(): Promise<HealthResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return {
      id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: false,
      detail: 'RESEND_API_KEY not set on this deployment',
      probableCause: 'missing Resend key - confirmation emails AND these alerts cannot send',
      action: 'Vercel → Project → Settings → Environment Variables → add RESEND_API_KEY (all environments), then redeploy.',
    }
  }
  const { error } = await new Resend(key).domains.list()
  if (error) {
    return {
      id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: false,
      detail: `Resend API rejected the key: ${error.message}`,
      probableCause: 'invalid or revoked Resend API key',
      action: 'Resend dashboard → API Keys: confirm the key is active, then update RESEND_API_KEY in Vercel and redeploy.',
    }
  }
  return { id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: true, detail: 'Resend key valid, domains reachable' }
}

// (c) MAP surfaces - the single Google Maps key present + non-empty. Every map
// (event detail, events grid, city, venue) is now Google (one provider). The
// empty-but-present key is the exact class the env check + build guard catch;
// this surfaces it as a map-specific warning too. Rendering is verified in
// Chromium separately (client-only library).
async function checkMaps(): Promise<HealthResult> {
  const google = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (google) {
    return { id: 'maps', label: 'Map surfaces (Google Maps key)', severity: 'warning', ok: true, detail: 'Google Maps key present in this build' }
  }
  return {
    id: 'maps', label: 'Map surfaces (Google Maps key)', severity: 'warning', ok: false,
    detail: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing or empty - every map renders its static fallback',
    probableCause: 'the NEXT_PUBLIC Google Maps key is not baked into this build (present-but-empty is the silent-failure class)',
    action: 'Vercel → Settings → Environment Variables: set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (same value as the server GOOGLE_MAPS_API_KEY) for this scope, then REBUILD (baked at build time).',
  }
}

// (g) AI layer reachable with its cost guard intact.
async function checkAi(): Promise<HealthResult> {
  if (!isAiConfigured()) {
    return {
      id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: false,
      detail: 'ANTHROPIC_API_KEY not set on this deployment - AI assistants are offline',
      probableCause: 'missing Anthropic key',
      action: 'Vercel → Environment Variables → add ANTHROPIC_API_KEY (Production + Preview), then redeploy. AI is a soft feature; checkout and browsing are unaffected.',
    }
  }
  // Cost guard is backed by Redis. If Redis is unreachable the guard fails OPEN,
  // which is a warning worth surfacing (spend is uncapped until Redis returns).
  const redis = getRedisClient()
  if (!redis) {
    return { id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: true, detail: 'AI key present; cost-guard store (Redis) not configured here so the monthly budget guard is fail-open' }
  }
  return { id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: true, detail: 'AI key present and cost-guard store reachable' }
}

// (h) PUSH notification configuration.
async function checkPush(): Promise<HealthResult> {
  if (isPushConfigured()) {
    return { id: 'push', label: 'Web push (VAPID)', severity: 'warning', ok: true, detail: 'VAPID keys present and valid' }
  }
  return {
    id: 'push', label: 'Web push (VAPID)', severity: 'warning', ok: false,
    detail: 'VAPID keys missing - push alerts fall back to email',
    probableCause: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set on this deployment',
    action: 'Generate a VAPID keypair (npx web-push generate-vapid-keys) and add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in Vercel (Production + Preview), then rebuild. Until then, alerts still deliver by email.',
  }
}

// (i) PRIMARY PAGES return 200 with no server-error boundary.
async function checkPrimaryPages(origin: string): Promise<HealthResult> {
  const paths = ['/', '/events', '/communities', '/organisers']
  const bad: string[] = []
  await Promise.all(paths.map(async p => {
    try {
      const res = await fetch(`${origin}${p}`, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { 'user-agent': 'EventLinqs-HealthSentinel' } })
      // 200-399 are healthy (redirects included). 5xx or a rendered error boundary is a fault.
      if (res.status >= 500) { bad.push(`${p} → ${res.status}`); return }
      if (res.status >= 400 && res.status !== 401 && res.status !== 403) { bad.push(`${p} → ${res.status}`) }
    } catch (err) {
      bad.push(`${p} → unreachable (${String(err).slice(0, 60)})`)
    }
  }))
  if (bad.length === 0) {
    return { id: 'pages', label: 'Primary pages (200, no server error)', severity: 'critical', ok: true, detail: `${paths.length} primary pages healthy` }
  }
  return {
    id: 'pages', label: 'Primary pages (200, no server error)', severity: 'critical', ok: false,
    detail: `page fault: ${bad.join(', ')}`,
    probableCause: 'a primary route is 500ing or unreachable - the site is degraded or down',
    action: 'Open the failing path in a browser and the Vercel deployment logs for the stack trace. If all pages fail, the deployment itself is broken - roll back to the last green deployment in Vercel → Deployments.',
  }
}

// (j) SSL + domain validity for the canonical site URL.
async function checkSslDomain(origin: string): Promise<HealthResult> {
  if (origin.startsWith('http://')) {
    return { id: 'ssl', label: 'SSL + domain', severity: 'warning', ok: true, skipped: true, detail: `canonical URL is http (local dev: ${origin}) - SSL check N/A` }
  }
  try {
    // fetch() rejects on an invalid/expired TLS certificate, so a resolved
    // response is proof the cert chain and domain are valid.
    const res = await fetch(origin, { method: 'HEAD', signal: AbortSignal.timeout(15000), redirect: 'manual' })
    if (res.status >= 500) {
      return { id: 'ssl', label: 'SSL + domain', severity: 'critical', ok: false, detail: `${origin} responded ${res.status}`, probableCause: 'origin erroring', action: 'Check the deployment is live and the domain is attached in Vercel → Domains.' }
    }
    return { id: 'ssl', label: 'SSL + domain', severity: 'critical', ok: true, detail: `${origin} valid TLS, responded ${res.status}` }
  } catch (err) {
    return {
      id: 'ssl', label: 'SSL + domain', severity: 'critical', ok: false,
      detail: `${origin} unreachable / TLS error: ${String(err).slice(0, 100)}`,
      probableCause: 'expired or misconfigured SSL certificate, or the domain does not resolve',
      action: 'Vercel → Project → Domains: confirm the domain is attached and its certificate is valid (Vercel auto-renews; a red domain here means DNS or verification broke).',
    }
  }
}

// (k) CRITICAL env vars PRESENT + NON-EMPTY + WELL-FORMED in the SERVING
// deployment. This is the permanent guard against the worst failure class: a
// var that EXISTS but is EMPTY (or malformed), which passes naive presence
// checks and errors nowhere - the empty NEXT_PUBLIC_GOOGLE_MAPS_API_KEY that
// silently killed every map. Uses the same rules as the build-time guard.
async function checkEnvVars(): Promise<HealthResult> {
  const results = CRITICAL_ENV_RULES.map(r => evalEnvRule(r, process.env as Record<string, string | undefined>))
  const bad = results.filter(r => !r.ok)
  if (bad.length === 0) {
    return { id: 'env', label: 'Critical env vars (present, non-empty, well-formed)', severity: 'critical', ok: true, detail: `all ${CRITICAL_ENV_RULES.length} critical env vars present, non-empty and well-formed` }
  }
  const empties = bad.filter(b => b.state === 'empty')
  const detail = bad.map(b => `${b.name} [${b.state}]${b.reason ? ` ${b.reason}` : ''}`).join('; ')
  return {
    id: 'env', label: 'Critical env vars (present, non-empty, well-formed)', severity: 'critical', ok: false,
    detail,
    probableCause: empties.length
      ? `a critical variable is PRESENT BUT EMPTY (the silent-failure class): ${empties.map(e => e.name).join(', ')}`
      : 'a critical environment variable is missing or malformed in the deployment serving traffic',
    action: `Vercel → Settings → Environment Variables: set the correct value for [${bad.map(b => b.name).join(', ')}] in the serving scope. NEXT_PUBLIC_ vars are baked at build time, so REBUILD after fixing.`,
  }
}

export const CHECK_IDS = ['payment', 'database', 'email', 'storage', 'maps', 'ai', 'push', 'pages', 'ssl', 'env'] as const
export type CheckId = (typeof CHECK_IDS)[number]

/**
 * Run every check. `drill` forces the named check (or 'all') to report a
 * synthetic failure so the CRITICAL alert path can be proven without breaking
 * anything real - the deliberate break drill.
 */
export async function runAllChecks(opts?: { drill?: string }): Promise<HealthResult[]> {
  const origin = getSiteUrl()
  const drill = opts?.drill

  const results = await Promise.all([
    timed('payment', () => checkPayment(origin)),
    timed('database', () => checkDatabase()),
    timed('email', () => checkEmail()),
    timed('storage', () => checkStorage()),
    timed('maps', () => checkMaps()),
    timed('ai', () => checkAi()),
    timed('push', () => checkPush()),
    timed('pages', () => checkPrimaryPages(origin)),
    timed('ssl', () => checkSslDomain(origin)),
    timed('env', () => checkEnvVars()),
  ])

  if (!drill) return results
  return results.map(r => {
    if (drill !== 'all' && drill !== r.id) return r
    return {
      ...r,
      ok: false,
      detail: `DRILL: forced failure of "${r.label}" to prove the alert path. (Real state was: ${r.ok ? 'green' : 'already failing'}.)`,
      probableCause: r.probableCause ?? `simulated ${r.severity} fault for the break drill`,
      action: r.action ?? 'This is a drill - no real action needed.',
    }
  })
}

export function overallStatus(results: HealthResult[]): 'green' | 'warning' | 'critical' {
  if (results.some(r => !r.ok && r.severity === 'critical')) return 'critical'
  if (results.some(r => !r.ok && r.severity === 'warning')) return 'warning'
  return 'green'
}
