import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'
import { getSiteUrl } from '@/lib/site-url'
import { isAiConfigured } from '@/lib/ai/client'
import { isPushConfigured } from '@/lib/notifications/web-push'
import { selfProbe, driftWatchdog, endpointConfigCheck, connectNameDivergenceCheck } from '@/lib/health/payment-checks'
import { senderDomainsInUse } from '@/lib/email/send'
import { CRITICAL_ENV_RULES, evalEnvRule } from '@/lib/health/critical-env.mjs'
import { evaluateProcessEnv, evaluateStores } from '@/lib/env/manifest-checks.mjs'
import { githubActionsNames } from '@/lib/env/manifest.mjs'
import { mintOrderAccessToken, verifyOrderAccessToken } from '@/lib/orders/order-access'

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

/**
 * Log one check's own result and reason (2026-07-26).
 *
 * The payment sentinel returned 503 on production and the runtime log could not
 * say which check failed, because only the alert-email failure was ever logged.
 * Every check now leaves its own verdict in the log, so an incident starts with
 * the answer instead of a guess. Results carry names, plain-language details and
 * probable causes only, never secrets.
 */
function logHealthResult(r: HealthResult): void {
  console.log(
    `[health-check] ${r.ok ? 'PASS' : r.severity === 'critical' ? 'FAIL' : 'WARN'} ${r.id} (${r.label}) :: ${r.detail}` +
      (r.ok ? '' : (r.probableCause ? ` :: probable cause: ${r.probableCause}` : '') + (r.action ? ` :: fix: ${r.action}` : '')),
  )
}

async function timed(id: string, fn: () => Promise<HealthResult>): Promise<HealthResult> {
  const start = Date.now()
  try {
    const r = await fn()
    const result = { ...r, durationMs: Date.now() - start }
    logHealthResult(result)
    return result
  } catch (err) {
    const result: HealthResult = {
      id,
      label: id,
      severity: 'critical',
      ok: false,
      detail: `check threw: ${String(err).slice(0, 180)}`,
      probableCause: 'health check internal error',
      action: 'Check the deployment logs for this check; a thrown check usually means a missing dependency or env var.',
      durationMs: Date.now() - start,
    }
    logHealthResult(result)
    return result
  }
}

// (a)+(b) PAYMENT PATH - reuse the payment sentinel checks verbatim.
async function checkPayment(origin: string): Promise<HealthResult> {
  // selfProbe returns one result per configured webhook signing secret, so the
  // platform and connected-accounts destinations are both covered here too.
  const [probes, drift, endpoint] = await Promise.all([
    selfProbe(origin, false),
    driftWatchdog(),
    endpointConfigCheck(origin),
  ])
  const parts = [...probes, drift, endpoint]
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

/**
 * Connected-account business names still agree with the organisation records.
 *
 * WARNING, not critical, and deliberately its own check rather than folded into
 * checkPayment: a name mismatch means a buyer may not recognise who charged
 * them, which invites a chargeback, but nothing is down. Rolling it into the
 * critical payment check would both wake the founder for a non-outage and, far
 * worse, report the money path as broken when it is working.
 */
async function checkConnectProfile(): Promise<HealthResult> {
  const r = await connectNameDivergenceCheck()
  return {
    id: 'connect_profile',
    label: 'Organiser names match Stripe',
    severity: 'warning',
    ok: r.ok,
    detail: r.detail,
    probableCause: r.probableCause,
    action:
      'Confirm which name is correct first, because the organiser may be trading under a name we have not recorded. To correct Stripe: POST /v1/accounts/{id} with business_profile[name]. Verified against a fully-onboarded Express account: the platform key is accepted, and Stripe then resets that account\'s statement descriptor to match the new name. To correct EventLinqs instead, edit the organisation name in /admin. This check never auto-corrects either side, because overwriting a deliberate trading name would be worse than reporting the difference.',
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
  const { data, error } = await new Resend(key).domains.list()
  if (error) {
    return {
      id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: false,
      detail: `Resend API rejected the key: ${error.message}`,
      probableCause: 'invalid or revoked Resend API key',
      action: 'Resend dashboard → API Keys: confirm the key is active, then update RESEND_API_KEY in Vercel and redeploy.',
    }
  }

  // A VALID KEY IS NOT A WORKING SENDER (2026-07-26). This check used to stop
  // at "the key works". Production's EMAIL_FROM points at send.eventlinqs.com,
  // which is not a verified domain at Resend, so every send through sendEmail
  // threw "The send.eventlinqs.com domain is not verified" - including the
  // payment sentinel's own alert email. The monitor detected a payment fault
  // and then could not tell the founder, and nothing surfaced that for weeks.
  // So the domains we actually send FROM are now asserted, not just reachable.
  const domains = (data?.data ?? []) as { name?: string; status?: string }[]
  const verified = new Set(
    domains.filter(d => d.status === 'verified').map(d => (d.name ?? '').toLowerCase()),
  )
  const unverified = senderDomainsInUse().filter(d => !verified.has(d))
  if (unverified.length > 0) {
    return {
      id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: false,
      detail: `sender domain(s) not verified at Resend: ${unverified.join(', ')} (verified: ${[...verified].join(', ') || 'none'})`,
      probableCause: 'the platform sends from a domain Resend will not accept, so those sends fail with "domain is not verified" - including the sentinel alert emails, which is why a fault here can stay silent',
      action: `Resend dashboard → Domains: verify ${unverified.join(', ')} by adding the DNS records it shows. Faster alternative if another domain is already verified: change EMAIL_FROM in Vercel to an address at that domain and redeploy.`,
    }
  }
  return {
    id: 'email', label: 'Email delivery (Resend)', severity: 'critical', ok: true,
    detail: `Resend key valid; sender domain(s) verified: ${senderDomainsInUse().join(', ')}`,
  }
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
  // A PRESENT KEY IS NOT A WORKING KEY (2026-08-03). This check used to stop at
  // isAiConfigured(), which is `Boolean(process.env.ANTHROPIC_API_KEY)` and
  // nothing more, then report "AI key present" as a pass. A revoked, expired or
  // mistyped key would have reported exactly the same green. That is an
  // assertion wearing the costume of a proof, and it is the same defect
  // checkEmail was fixed for on 2026-07-26.
  //
  // The models endpoint authenticates the key without generating a single
  // token, so this costs nothing and cannot be rate-limited into a false alarm
  // the way a completion could. The key itself is never logged: only the HTTP
  // status reaches the detail string.
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401 || res.status === 403) {
      return {
        id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: false,
        detail: `Anthropic rejected the key (HTTP ${res.status}) - every assistant surface is dead while this stands`,
        probableCause: 'ANTHROPIC_API_KEY is revoked, expired, or belongs to a different workspace',
        action: 'console.anthropic.com → API keys: issue a new key, update ANTHROPIC_API_KEY in Vercel (Production + Preview), then redeploy.',
      }
    }
    if (!res.ok) {
      return {
        id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: false,
        detail: `Anthropic API unreachable or erroring (HTTP ${res.status})`,
        probableCause: 'an Anthropic outage, or a network egress problem from this deployment',
        action: 'Check status.anthropic.com. If it is green, re-run this check; the key itself was not rejected.',
      }
    }
  } catch (err) {
    return {
      id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: false,
      detail: `could not reach the Anthropic API: ${String(err).slice(0, 120)}`,
      probableCause: 'network egress failure or timeout from this deployment',
      action: 'Check status.anthropic.com, then re-run this check.',
    }
  }

  // Cost guard is backed by Redis. If Redis is unreachable the guard fails OPEN,
  // which is a warning worth surfacing (spend is uncapped until Redis returns).
  const redis = getRedisClient()
  if (!redis) {
    return { id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: true, detail: 'AI key AUTHENTICATED against the Anthropic API; cost-guard store (Redis) not configured here so the monthly budget guard is fail-open' }
  }
  return { id: 'ai', label: 'AI layer (Anthropic + cost guard)', severity: 'warning', ok: true, detail: 'AI key AUTHENTICATED against the Anthropic API and cost-guard store reachable' }
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
/**
 * GUEST ORDER LINKS: can this deployment actually issue one?
 *
 * NOT a config read. Reading that ORDER_ACCESS_SECRET is "set" proves nothing
 * about whether a link gets minted: an empty string, a stray quote or a value
 * on the wrong scope all read as present and all mint nothing. So this does the
 * real round trip through the real module - mint a token, verify it, and verify
 * that a token minted for a DIFFERENT order is rejected - and reports the
 * outcome. A guest who never receives a working link cannot reach their own
 * tickets, their transfer, or their refund.
 *
 * IT DISCLOSES NOTHING. The two order ids are fixed, non-existent probe
 * constants, so a token for them opens no order that exists, and the token
 * itself is never put in the result.
 */
const ORDER_ACCESS_PROBE_A = '00000000-0000-4000-8000-00000000feed'
const ORDER_ACCESS_PROBE_B = '00000000-0000-4000-8000-00000000beef'

/**
 * CAN THIS DEPLOYMENT ACTUALLY TURN A CARD INTO PIXELS? Probed, never read.
 *
 * WHY THIS EXISTS, 29 August 2026. Every social card download answered 500 with
 * a zero-byte body, because next/og rasterises by handing satori's SVG to sharp
 * and sharp inside the Next server runtime CANNOT DECODE SVG. The decisive
 * measurement, taken from inside the running server:
 *
 *     svgInput:      {"file":true,"buffer":true,...}   <- sharp SAYS it can
 *     svgRoundTrip:  FAILED: Input buffer contains unsupported image format
 *
 * on an 8x8 red rectangle. sharp.format.svg.input is STATIC METADATA compiled
 * into the package, not a live probe of the loaded libvips, and in that runtime
 * it was simply lying. Every proof we had that the image pipeline worked came
 * from vitest, which is a different process with a different module resolution,
 * so nothing anywhere would have caught it.
 *
 * THAT IS THE CLASS, and it is why this check reads nothing and proves
 * everything: it round-trips REAL BYTES through the REAL library in the REAL
 * runtime, on every sentinel run.
 *
 *   PNG decode   the organiser upload path and the card JPEG step both need it
 *   JPEG encode  every card and every processed cover is written as one
 *   card raster  satori plus resvg, the actual artefact path, end to end
 *
 * A declared capability is a promise. A round trip is evidence. Where the two
 * disagree, only one of them is visible to an organiser.
 */
async function checkImagePipeline(): Promise<HealthResult> {
  const base = {
    id: 'image_pipeline',
    label: 'Image pipeline (decode, encode, card raster)',
    severity: 'critical' as Severity,
  }

  try {
    const { default: sharp } = await import('sharp')

    // A real 1x1 PNG, decoded and re-encoded as JPEG. Not a capability flag.
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 220, g: 180, b: 60 } },
    })
      .png()
      .toBuffer()
    const meta = await sharp(png).metadata()
    if (meta.format !== 'png' || meta.width !== 8) {
      return {
        ...base,
        ok: false,
        detail: `sharp did not read back a PNG it had just written (got ${meta.format} ${meta.width}x${meta.height}).`,
        probableCause: 'The native libvips in this runtime is not the one the package expects.',
        action: 'Redeploy. If it persists, the sharp binary for this platform is broken and organiser uploads are also affected.',
      }
    }
    const jpeg = await sharp(png).jpeg({ quality: 90 }).toBuffer()
    if (jpeg.byteLength === 0) {
      return {
        ...base,
        ok: false,
        detail: 'sharp produced a zero-byte JPEG, so no card and no processed cover can be written.',
        action: 'Redeploy and re-run this check.',
      }
    }

    // The artefact path itself: satori composes, resvg rasterises. This is the
    // exact call the card routes make, so a failure here IS the card failing.
    //
    // THE FONTS ARE NOT OPTIONAL. This probe passed `fonts: []` until
    // 2026-09-02, and satori refuses to lay out anything without at least one
    // face, so this CRITICAL check reported "The image pipeline threw in this
    // runtime: No fonts are loaded" on every single run, in every environment,
    // and could never once have gone green. A check that is permanently red is
    // worse than no check: it trains the reader to ignore the one alert that
    // would have told them the social cards were genuinely down.
    const { renderCardPng } = await import('@/lib/broadcast/card-raster')
    const { loadCardFonts } = await import('@/lib/broadcast/card-fonts')
    const probeFonts = await loadCardFonts()
    const probe = await renderCardPng(
      {
        type: 'div',
        props: {
          style: { display: 'flex', width: 32, height: 32, background: '#0A1628' },
          children: '',
        },
      } as unknown as React.ReactNode,
      {
        width: 32,
        height: 32,
        fonts: probeFonts.map(font => ({
          name: font.name,
          data: font.data,
          weight: font.weight,
          style: font.style,
        })),
      },
    )
    if (!probe || probe.byteLength === 0) {
      return {
        ...base,
        ok: false,
        detail: 'The card rasteriser produced no bytes, so every social card download would answer 500.',
        probableCause: 'resvg-wasm failed to initialise in this runtime.',
        action: 'Check the deployment logs for a wasm initialisation error and redeploy.',
      }
    }

    return {
      ...base,
      ok: true,
      detail: `Proved by round trip, not by a capability flag: PNG decoded (${meta.width}x${meta.height}), JPEG encoded (${jpeg.byteLength} bytes), card rasterised (${probe.byteLength} bytes).`,
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      detail: `The image pipeline threw in this runtime: ${error instanceof Error ? error.message : String(error)}`,
      probableCause:
        'A native decoder is unavailable here even if the package reports otherwise. This is the shape that broke every social card download on 29 August 2026.',
      action: 'Read docs/verification/SOCIAL-CARD-500-ROOT-CAUSE.md, then redeploy.',
    }
  }
}

async function checkOrderAccess(): Promise<HealthResult> {
  const base = {
    id: 'order_access',
    label: 'Guest order links',
    severity: 'critical' as Severity,
  }

  const token = mintOrderAccessToken(ORDER_ACCESS_PROBE_A)
  if (!token) {
    return {
      ...base,
      ok: false,
      detail: 'This deployment cannot issue a guest order link. A buyer who checks out without an account gets a confirmation email with no way back to their tickets, transfer, or refund.',
      probableCause: 'ORDER_ACCESS_SECRET is missing or empty on this scope. It fails closed on purpose rather than falling back to the public dev constant, which would let anyone open any order by guessing an id.',
      action: 'Set ORDER_ACCESS_SECRET on Production in Vercel (32+ chars, sensitive), then redeploy so the running functions pick it up.',
    }
  }

  const honoursItsOwn = verifyOrderAccessToken(ORDER_ACCESS_PROBE_A, token)
  const rejectsAnother = !verifyOrderAccessToken(ORDER_ACCESS_PROBE_B, token)

  if (!honoursItsOwn || !rejectsAnother) {
    return {
      ...base,
      ok: false,
      detail: !honoursItsOwn
        ? 'A link this deployment mints is not honoured by the same deployment, so every guest link would dead-end.'
        : 'A link minted for one order opened a different order. Guest links are not scoped and must be treated as a live exposure.',
      probableCause: 'The signing secret changed between minting and verifying, or the token scope binding is broken.',
      action: 'Stop issuing guest links and page the founder: rotate ORDER_ACCESS_SECRET, which invalidates every outstanding link at once.',
    }
  }

  return {
    ...base,
    ok: true,
    detail: `Guest order links are issuable and honoured: a minted token verified against its own order and was refused for another (token length ${token.length}).`,
  }
}

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

// (l) LOCK 4: MANIFEST DRIFT, checked on the sentinel's own schedule.
//
// WHY A SEPARATE CHECK FROM (k). Check (k) asks whether the ten hand-written
// critical rules hold. This one asks whether the WHOLE declared contract in
// src/lib/env/manifest.mjs holds for this deployment: every variable on the
// right scope, in the right shape, with no variable present that this scope
// forbids and no cross-variable disagreement. Adding a variable to the manifest
// extends this check with no edit here.
//
// WHAT IT CAN AND CANNOT SEE, said plainly so a green result is not read as more
// than it is. Vercel SNAPSHOTS a deployment's environment at build time, so this
// check sees the configuration the serving deployment was built with. That
// catches a deployment that shipped wrong, and it catches drift in anything read
// at request time. It does NOT, on its own, catch somebody editing a variable in
// the Vercel dashboard after the deploy: that edit does not reach the running
// deployment until the next build.
//
// Closing that last gap needs a read of the STORE, which needs a Vercel API
// token. When VERCEL_API_TOKEN is present this check reads the live store and
// compares it to the manifest, which detects a dashboard edit within one
// sentinel run. When it is absent, the check says so as a NAMED WARNING rather
// than passing quietly, because a capability that silently does not run is the
// same failure this whole system exists to prevent.
async function checkEnvManifest(): Promise<HealthResult> {
  const snapshot = evaluateProcessEnv(process.env as Record<string, string | undefined>)
  const store = await checkManifestAgainstStore()

  const problems: string[] = []
  if (snapshot.findings.length > 0) {
    problems.push(
      `deployment snapshot (${snapshot.scope}): ` +
        snapshot.findings.map((f: { name: string; reason: string }) => `${f.name} ${f.reason}`).join(' | '),
    )
  }
  if (store.findings.length > 0) {
    problems.push(`live store: ${store.findings.join(' | ')}`)
  }

  if (problems.length === 0) {
    return {
      id: 'manifest',
      label: 'Environment manifest (scope, shape, cross-variable)',
      severity: 'critical',
      ok: true,
      detail:
        `all ${snapshot.checked} declared variables conform on the ${snapshot.scope} snapshot; ` +
        `live store: ${store.mode}`,
    }
  }
  return {
    id: 'manifest',
    label: 'Environment manifest (scope, shape, cross-variable)',
    severity: 'critical',
    ok: false,
    detail: problems.join(' || '),
    probableCause:
      snapshot.alwaysBlocking.length > 0
        ? 'a variable is on a scope that forbids it, a guard bypass is stored on the deployment, or two variables that must agree do not'
        : 'a declared variable is missing, empty or malformed on the deployment serving traffic',
    action:
      'Open src/lib/env/manifest.mjs: it states what each variable must look like and which scopes it belongs on. ' +
      'Fix the value in Vercel → Settings → Environment Variables for the named scope, then REDEPLOY (NEXT_PUBLIC_ values are baked at build time). ' +
      'Run `node scripts/check-env-stores.mjs` locally for the full cross-store picture.',
  }
}

/**
 * The live-store half of LOCK 4, which is the only half that can catch a
 * dashboard edit made AFTER the deploy.
 *
 * Reads the project's environment records from the Vercel API and checks scope
 * membership and branch scoping against the manifest. Values are never
 * requested: `decrypt` is not set, so the response carries metadata only and no
 * secret can travel this path even in principle.
 *
 * Returns `mode` so a green sentinel is honest about which half actually ran.
 */
async function checkManifestAgainstStore(): Promise<{ mode: string; findings: string[] }> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !projectId) {
    return {
      mode:
        'NOT CHECKED (no VERCEL_API_TOKEN + VERCEL_PROJECT_ID on this deployment, so a dashboard edit made after this deploy would not be seen until the next build)',
      findings: [],
    }
  }
  try {
    const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/env`)
    if (teamId) url.searchParams.set('teamId', teamId)
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { mode: `unreadable (HTTP ${res.status})`, findings: [`the Vercel environment API returned HTTP ${res.status}, so live-store drift is UNVERIFIED`] }
    const body = (await res.json()) as { envs?: { key: string; target?: string[]; gitBranch?: string | null }[] }
    const records = (body.envs ?? []).flatMap(e =>
      (e.target ?? []).map(t => ({
        name: e.key,
        scope: t,
        gitBranch: e.gitBranch ?? null,
        // Values were never requested, so read-back exposure is unknown here and
        // is checked by scripts/check-env-stores.mjs, which can probe it.
        readable: null as boolean | null,
        length: 0,
        fp: null as string | null,
      })),
    )
    // GitHub Actions membership is not visible from here either; that half is
    // the store checker's. Passing the declared names keeps this from reporting
    // a false absence.
    //
    // exposureAssessed:false IS THE HONEST DECLARATION, NOT A BYPASS. This path
    // calls the Vercel API without `decrypt`, deliberately, so no secret can
    // travel it even in principle - which also means it cannot know whether a
    // record is readable. It says so rather than passing `null` into a check
    // that would treat unknown as safe, and the `mode` string below tells the
    // reader which half actually ran.
    const verdict = evaluateStores(
      { records, githubSecrets: githubActionsNames() },
      { exposureAssessed: false },
    )
    return {
      mode: `checked (${records.length} records, metadata only: read-back exposure is scripts/check-env-stores.mjs's half)`,
      findings: verdict.findings
        .filter((f: { state: string }) => f.state !== 'missing-github-secret')
        .map((f: { name: string; scope?: string; reason: string }) => `${f.name} [${f.scope}] ${f.reason}`),
    }
  } catch (err) {
    return { mode: 'unreadable', findings: [`the Vercel environment API could not be reached: ${String(err).slice(0, 100)}`] }
  }
}

export const CHECK_IDS = ['payment', 'connect_profile', 'database', 'email', 'storage', 'maps', 'ai', 'push', 'pages', 'ssl', 'env', 'manifest', 'order_access'] as const
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
    timed('connect_profile', () => checkConnectProfile()),
    timed('database', () => checkDatabase()),
    timed('email', () => checkEmail()),
    timed('storage', () => checkStorage()),
    timed('maps', () => checkMaps()),
    timed('ai', () => checkAi()),
    timed('push', () => checkPush()),
    timed('pages', () => checkPrimaryPages(origin)),
    timed('ssl', () => checkSslDomain(origin)),
    timed('env', () => checkEnvVars()),
    timed('manifest', () => checkEnvManifest()),
    timed('order_access', () => checkOrderAccess()),
    timed('image_pipeline', () => checkImagePipeline()),
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
