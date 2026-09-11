/**
 * BUILD-FAILING GUARD: nothing this platform controls can refuse a machine
 * caller that has already proved who it is, and every such caller is on a
 * reviewed record with a verdict about the layer we do NOT control.
 *
 * WHY THIS EXISTS (close-out H2.1, 8 September 2026).
 *
 * On 7 September production reset a TLS handshake from a GitHub Actions runner
 * and the post-deploy smoke reported an outage that had not happened. The
 * owner's instruction went further than the smoke, and it was the right
 * instinct: "If production silently resets connections to an unfamiliar client
 * it may do the same to a Stripe webhook or a Supabase callback, and a dropped
 * payment webhook is a lost order nobody is told about."
 *
 * WHAT WAS ESTABLISHED, so the next reader does not re-investigate it.
 *
 *   The reset was at the TLS handshake. curl exited 35, CURLE_SSL_CONNECT_ERROR,
 *   "A problem occurred somewhere in the SSL/TLS handshake"
 *   (https://curl.se/libcurl/c/libcurl-errors.html, fetched 2026-09-08). The
 *   handshake precedes the request line, so no path, header or user agent had
 *   been sent. Nothing that reads an HTTP request can have been what answered,
 *   which rules out this platform's own rate limiter and rules out the user
 *   agent filtering that was suspected.
 *
 *   The project has NO firewall configuration at all. The Vercel API answers
 *   `{"active":null,"draft":null,"versions":[]}` for it, so there are no custom
 *   WAF rules, no IP blocks, no managed rulesets and no attack challenge mode.
 *   The only thing left on that side is the always-on system mitigation, which
 *   Vercel documents as covering "L3, L4, and L7 DDoS attacks" and which it
 *   says "can happen [to] block traffic from trusted sources like proxies or
 *   shared networks" (https://vercel.com/docs/vercel-firewall/ddos-mitigation,
 *   fetched 2026-09-08). A GitHub Actions runner is a shared datacentre
 *   address. A network-layer block of one looks exactly like a handshake reset.
 *
 *   The documented exemption is a System Bypass Rule, IP or CIDR based, limited
 *   to 25 per project on the Pro plan
 *   (https://vercel.com/docs/vercel-firewall/vercel-waf/system-bypass-rules,
 *   fetched 2026-09-08). Stripe publishes its 15 webhook source addresses at
 *   https://stripe.com/files/ips/ips_webhooks.json and gives seven days notice
 *   of a change (https://docs.stripe.com/ips, fetched 2026-09-08). Fifteen fits
 *   inside twenty-five.
 *
 * WHAT THIS GUARD JUDGES, and what it deliberately does not.
 *
 *   1. THE RECORD IS COMPLETE, BOTH WAYS. Every machine-to-machine entry point
 *      found on disk carries a row here, and every row still names a file that
 *      exists. A new webhook receiver added with no verdict fails the build,
 *      which is the only way a list like this does not rot.
 *
 *   2. A SIGNED WEBHOOK IS NEVER RATE LIMITED BY US. Stripe retries, but a
 *      429 to a signed webhook is us throwing away an event we were paid to
 *      receive, on the strength of an address we do not control.
 *
 *   3. A CRON THAT IS RATE LIMITED USES A FAIL-OPEN POLICY. A fail-closed
 *      limiter on the platform's own scheduler means "no Redis, no crons", and
 *      the crons are what reconcile payments and release payouts. Silence there
 *      is the expensive kind.
 *
 *   4. THE VERCEL-SIDE STATE MATCHES THE RECORD. With a VERCEL_TOKEN this
 *      reads the project's live System Bypass rules and fails if they differ
 *      from what is recorded below. Without one it SKIPS LOUDLY by name, the
 *      same shape as preview-deployment-state.mjs, because a guard that cannot
 *      see must say so rather than pass.
 *
 *      ITS VERDICT IS ONE NAMED CODE ON EVERY MACHINE (close-out F1.6). On
 *      8 September it skipped for a different reason on Vercel (no token) than
 *      in CI (Vercel answered 404), in two different sentence shapes, and
 *      neither was the reason it would skip on a laptop. Two full log reads
 *      went on noticing that. The verdict is now judged / no-token /
 *      no-project-ids / http-<status> / network-error, printed in one line with
 *      the build scope, so the three machines produce three lines that line up.
 *      A refusal quotes Vercel's own error code, because 404, 403 and 401 are
 *      documented side by side on that endpoint and the status alone does not
 *      say whether the token is wrong, unscoped, or pointed somewhere it cannot
 *      see.
 *
 *   It does NOT assert that bypass rules exist. Installing them changes
 *   production infrastructure and is the owner's call; the record carries the
 *   verdict PENDING-OWNER and the one command that changes it
 *   (`npm run firewall:bypass`). A guard that cannot go green until somebody
 *   presses a button is a guard somebody switches off.
 *
 * Run: node scripts/guards/machine-callers-reachable.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { renderVerdict } from './lib/clause-verdict.mjs'

const ROOT = process.cwd()
const TAG = '[machine-callers-reachable]'
const API_ROOT = join(ROOT, 'src', 'app', 'api')

/**
 * THE REVIEWED RECORD. One row per machine-to-machine caller this platform
 * depends on. `exposure` is the verdict about the layer we do not control.
 *
 *   BYPASSED      a System Bypass Rule is installed for its published addresses
 *   PENDING-OWNER the rule is not installed and installing it is his decision
 *   NOT-EXPOSED   the caller does not cross the public edge at all
 */
const RECORD = {
  'src/app/api/webhooks/stripe/route.ts': {
    caller: 'Stripe webhooks',
    proves: 'stripe-signature, verified against the endpoint secret before anything else runs',
    addresses: 'the 15 published at https://stripe.com/files/ips/ips_webhooks.json',
    exposure: 'PENDING-OWNER',
    why: 'A dropped webhook is a paid order the platform never records. Vercel system mitigation is the only thing that could drop one at the network layer, and the documented exemption is a System Bypass Rule. Install with: npm run firewall:bypass',
  },
  'src/app/api/cron/**': {
    caller: 'Vercel Cron',
    proves: 'CRON_SECRET as a bearer token, checked by requireCronAuth before any work',
    addresses: 'Vercel invokes these from inside its own platform',
    exposure: 'NOT-EXPOSED',
    why: 'Vercel documents cron invocations as originating from Vercel itself, so a Vercel system mitigation of an external address is not in the path. The risk here is ours, and clauses 2 and 3 below hold it.',
  },
}

/**
 * Routes that authenticate with a shared secret but are NOT callers the platform
 * DEPENDS ON, with the reason. Reviewed, printed every run, and enforced: a new
 * secret-gated route that is in neither this map nor the record above fails the
 * build, so the class cannot grow a member nobody judged.
 */
const EXCLUDED = {
  'src/app/api/health/sentry-error/route.ts':
    'a synthetic error probe run by hand during an investigation, not by any scheduler or vendor. Its rate limit is deliberate: every successful call bills a Sentry event, so 5 per minute is the point of the route rather than a risk to it.',
}

/**
 * Bypass rules this project expects to exist on Vercel. Kept in a JSON file
 * rather than in this source, because scripts/ops/firewall-bypass-machine-callers.mjs
 * rewrites it after a verified apply, and a script that edits a guard's source
 * is a script one bad regex away from disabling the guard.
 */
const EXPECTED = JSON.parse(readFileSync(join(ROOT, 'scripts', 'guards', 'lib', 'firewall-bypass-expected.json'), 'utf8'))
const EXPECTED_BYPASS_IPS = EXPECTED.expectedSourceIps ?? []

const failures = []
const notes = []

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

if (!existsSync(API_ROOT)) {
  console.error(`${TAG} FAIL - ${relative(ROOT, API_ROOT)} does not exist, so nothing could be enumerated.`)
  process.exit(1)
}

const routes = walk(API_ROOT).map((full) => {
  const rel = relative(ROOT, full).split('\\').join('/')
  return { rel, source: readFileSync(full, 'utf8') }
})

/** A machine caller proves itself with a secret or a signature, not a session. */
const isCron = (r) => r.rel.startsWith('src/app/api/cron/') && r.source.includes('requireCronAuth')
const isSignedWebhook = (r) => r.source.includes('constructWebhookEvent') || r.source.includes('stripe-signature')

/**
 * The whole class, so the enumeration cannot silently miss a member. A route
 * that reads a shared secret or token out of the environment is authenticating
 * a machine, whatever the route is called.
 */
const SECRET_ENV = /process\.env\.[A-Z0-9_]*(TOKEN|SECRET)/
const readsSharedSecret = (r) => isCron(r) || isSignedWebhook(r) || SECRET_ENV.test(r.source)

const cronRoutes = routes.filter(isCron)
const webhookRoutes = routes.filter((r) => isSignedWebhook(r) && !isCron(r))
const secretGated = routes.filter(readsSharedSecret)

// Every secret-gated route is either a caller we depend on (the record) or one
// we do not (the exclusions). Being in neither is the failure.
for (const route of secretGated) {
  if (isCron(route) || RECORD[route.rel] || EXCLUDED[route.rel]) continue
  failures.push(
    `${route.rel} authenticates a caller with a shared secret and appears in neither the reviewed record nor the reviewed exclusions. Decide which it is and say why.`,
  )
}
for (const key of Object.keys(EXCLUDED)) {
  if (!routes.some((r) => r.rel === key)) {
    failures.push(`The exclusions name ${key}, which is not a route handler on disk any more. Remove the row or fix the path.`)
  }
}

// 1. The record is complete, both ways.
const recordedCronGlob = 'src/app/api/cron/**'
for (const route of webhookRoutes) {
  if (!RECORD[route.rel]) {
    failures.push(
      `${route.rel} verifies a signature, so it is a machine-to-machine entry point, and it has no row in the reviewed record. Add one with an exposure verdict.`,
    )
  }
}
for (const key of Object.keys(RECORD)) {
  if (key === recordedCronGlob) {
    if (cronRoutes.length === 0) failures.push(`The record names ${key} but no cron route on disk calls requireCronAuth.`)
    continue
  }
  if (!routes.some((r) => r.rel === key)) {
    failures.push(`The record names ${key}, which is not a route handler on disk any more. Remove the row or fix the path.`)
  }
}

// 2. A signed webhook is never rate limited by us.
for (const route of webhookRoutes) {
  if (route.source.includes('applyRateLimit') || route.source.includes('rateLimitWithHeaders')) {
    failures.push(
      `${route.rel} applies a rate limit to a SIGNED webhook. A 429 there discards an event the platform was paid to receive, on the strength of a source address we do not control. Verify the signature and accept it.`,
    )
  }
}

// 3. A cron that is rate limited uses a fail-open policy.
const policySource = readFileSync(join(ROOT, 'src', 'lib', 'rate-limit', 'policies.ts'), 'utf8')
/** Read failClosed out of the policy table rather than trusting a rationale string. */
function policyFailsClosed(name) {
  const block = policySource.match(new RegExp(`'${name}':\\s*\\{[\\s\\S]*?\\n  \\},`))
  if (!block) return null
  return /failClosed:\s*true/.test(block[0])
}
for (const route of cronRoutes) {
  const applied = [...route.source.matchAll(/applyRateLimit\(\s*'([^']+)'/g)].map((m) => m[1])
  for (const name of applied) {
    const closed = policyFailsClosed(name)
    if (closed === null) {
      failures.push(`${route.rel} applies the rate-limit policy '${name}', which this guard could not find in src/lib/rate-limit/policies.ts.`)
    } else if (closed) {
      failures.push(
        `${route.rel} applies '${name}', which is failClosed. A fail-closed limiter on the platform's own scheduler means the crons stop the moment Upstash is unreachable, and these crons reconcile payments and release payouts. Make it fail open or take the limiter off the cron.`,
      )
    } else {
      notes.push(`${route.rel} applies '${name}' (fail-open), after requireCronAuth`)
    }
  }
}

// 4. The Vercel-side state matches the record.
/**
 * The project and team ids, resolved the way the two scripts that already need
 * them resolve them (preview-deployment-state.mjs, production-parity.mjs).
 *
 * CI CAUGHT THIS AND THE LOCAL GATE COULD NOT. `.vercel/project.json` is
 * gitignored, so it exists on this laptop and on nobody's runner. The first
 * version read it unconditionally and the build died with ENOENT after every
 * other guard had passed. The environment comes FIRST because that is where CI
 * puts it (ci.yml sets VERCEL_PROJECT_ID and VERCEL_ORG_ID beside VERCEL_TOKEN,
 * with a comment saying why), and the file is the local fallback.
 */
function resolveProjectIds(env) {
  let projectId = env.VERCEL_PROJECT_ID
  let teamId = env.VERCEL_ORG_ID
  if (!projectId || !teamId) {
    const file = join(ROOT, '.vercel', 'project.json')
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'))
        projectId = projectId || parsed.projectId
        teamId = teamId || parsed.orgId
      } catch (error) {
        // Named, never swallowed: an unreadable link file is worth saying out
        // loud, and the environment may still carry both ids.
        console.log(`${TAG} .vercel/project.json could not be read (${error.message}); only the environment remains`)
      }
    }
  }
  return { projectId, teamId }
}

/**
 * ONE SKIP VOCABULARY, ON EVERY MACHINE (close-out F1.6). The closed set and the
 * rendering live in ./lib/clause-verdict.mjs, where a test can drive them and
 * where a call site inventing a sixth shape throws rather than printing.
 */
const CLAUSE_4 = 'clause 4 (the live System Bypass rules)'
const CLAUSE_4_REMEDY = 'set VERCEL_TOKEN, or run `vercel login` once on this machine.'

/** Print the one comparable line. `detail` is never a credential. */
function reportClause4(code, detail) {
  for (const line of renderVerdict({ tag: TAG, clause: CLAUSE_4, code, detail, remedy: CLAUSE_4_REMEDY })) {
    console.log(line)
  }
}

/**
 * Vercel answers a refusal with a JSON body carrying its own error code, and
 * quoting it is the difference between "404" and a diagnosable fact. The read
 * endpoint documents 401 (not authorized), 403 (no permission) and 404 beside
 * each other (https://vercel.com/docs/rest-api/sdk/security/read-system-bypass,
 * fetched 2026-09-09), so the status alone does not say whether the token is
 * wrong, unscoped, or pointed at a project it cannot see.
 */
async function vercelErrorCode(res) {
  try {
    const body = await res.json()
    const code = body?.error?.code ?? body?.code
    const message = body?.error?.message ?? body?.message
    if (code || message) return `${code ?? 'no code'}: ${message ?? 'no message'}`
  } catch {
    // A refusal with no JSON body is itself worth saying, and is not an error here.
  }
  return 'no error body'
}

async function judgeBypassRules() {
  const token = process.env.VERCEL_TOKEN?.trim()
  let resolved = token ? { token, source: 'VERCEL_TOKEN from the environment' } : null
  if (!resolved) {
    const mod = await import('../lib/vercel-login.mjs')
    const found = mod.resolveVercelToken(process.env)
    if (found.token) resolved = { token: found.token, source: found.source }
    else {
      reportClause4('no-token', found.reason)
      return
    }
  }

  const { projectId, teamId } = resolveProjectIds(process.env)
  if (!projectId || !teamId) {
    reportClause4(
      'no-project-ids',
      'no VERCEL_PROJECT_ID, no VERCEL_ORG_ID and no .vercel/project.json to read them from',
    )
    return
  }
  const url = `https://api.vercel.com/v1/security/firewall/bypass?projectId=${projectId}&teamId=${teamId}`
  let payload = null
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${resolved.token}` }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) {
      reportClause4(
        `http-${res.status}`,
        `Vercel refused the read for project ${projectId} using ${resolved.source}, and said: ${await vercelErrorCode(res)}`,
      )
      return
    }
    payload = await res.json()
  } catch (err) {
    // Never a silent catch and never a pass: an unreadable answer is reported.
    reportClause4('network-error', err instanceof Error ? err.message : String(err))
    return
  }

  const rules = Array.isArray(payload?.result) ? payload.result : Array.isArray(payload) ? payload : []
  // Vercel answers with capitalised keys on this endpoint (Ip, Domain, Note),
  // confirmed against https://vercel.com/docs/rest-api/security/create-system-bypass-rule
  // (fetched 2026-09-08). Both spellings are read so a shape change is visible
  // rather than silently producing an empty list that looks like "no rules".
  const installed = rules.map((r) => r.Ip ?? r.ip ?? r.sourceIp ?? r.Domain ?? r.domain ?? JSON.stringify(r)).sort()
  const expected = [...EXPECTED_BYPASS_IPS].sort()
  reportClause4(
    'judged',
    `read with ${resolved.source}; live rules: ${installed.length === 0 ? 'none' : installed.join(', ')}`,
  )
  const added = installed.filter((ip) => !expected.includes(ip))
  const missing = expected.filter((ip) => !installed.includes(ip))
  if (added.length > 0) {
    failures.push(`System Bypass rules exist on the project that this record does not list: ${added.join(', ')}. Add them to EXPECTED_BYPASS_IPS with the reason, or remove them.`)
  }
  if (missing.length > 0) {
    failures.push(`This record expects System Bypass rules that are not installed: ${missing.join(', ')}. Run npm run firewall:bypass, or correct the record.`)
  }
}

await judgeBypassRules()

console.log(`${TAG} reviewed record, printed every run so it cannot rot unexamined:`)
for (const [path, row] of Object.entries(RECORD)) {
  console.log(`${TAG}   ${row.exposure.padEnd(13)} ${row.caller} (${path})`)
  console.log(`${TAG}                 addresses: ${row.addresses}`)
  console.log(`${TAG}                 proves itself with ${row.proves}`)
  console.log(`${TAG}                 ${row.why}`)
}
console.log(`${TAG} reviewed exclusions, secret-gated but not depended on:`)
for (const [path, why] of Object.entries(EXCLUDED)) console.log(`${TAG}   ${path}: ${why}`)
console.log(`${TAG} enumerated from disk: ${secretGated.length} secret-gated route(s) = ${webhookRoutes.length} signed webhook receiver(s), ${cronRoutes.length} cron route(s), ${Object.keys(EXCLUDED).length} excluded.`)
for (const note of notes) console.log(`${TAG}   ${note}`)

declareWork('machine-callers-reachable', {
  did: {
    'route handler read': routes.length,
    'signed webhook receiver judged': webhookRoutes.length,
    'secret-gated cron route judged': cronRoutes.length,
    'reviewed record row': Object.keys(RECORD).length,
    'secret-gated route classified': secretGated.length,
    'expected bypass rule compared': EXPECTED_BYPASS_IPS.length,
  },
  found: { problem: failures.length },
  zeroIsFine: {
    'expected bypass rule compared': `the record says ${EXPECTED.decision}: no System Bypass rule is installed, and installing one is the owner's decision, so zero is the state being asserted`,
  },
  exitOnZero: false,
})

if (failures.length > 0) {
  console.error(`${TAG} FAIL - ${failures.length} problem(s):`)
  for (const failure of failures) console.error(`${TAG}   ${failure}`)
  /*
   * process.exitCode, NOT process.exit(1).
   *
   * The drill for the bypass clause found this guard exiting 3221226505 rather
   * than 1, with a libuv assertion failure on UV_HANDLE_CLOSING in the Windows
   * async handle. process.exit() tears the loop down while
   * undici still holds the socket this guard's fetch opened, and libuv aborts.
   * The build was still blocked, because run-guards.mjs judges `status !== 0`,
   * but a guard that CRASHES instead of failing is a guard whose next reader
   * goes looking for a bug in Node.
   */
  process.exitCode = 1
} else {
  console.log(`${TAG} PASS - every machine caller is recorded, no signed webhook is rate limited, and every cron limiter fails open.`)
}
