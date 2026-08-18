/**
 * RATE LIMIT AUDIT: what is protected, what is not, and what must be configured in
 * production for any of it to be real.
 *
 * WHY AN AUDIT RATHER THAN A TEST. The throttle depends on an external service.
 * `.env.test` carries no Upstash credentials, so every limiter on TEST takes its
 * unconfigured branch and a behavioural test would measure the fallback rather than
 * the limit. What CAN be established without Upstash is the thing that actually
 * matters: for each protected surface, whether a missing Upstash means REFUSE
 * (failClosed) or ALLOW, and whether the surface is wired to a limiter at all.
 *
 * The dangerous state is not "the limit is too high". It is a surface that costs
 * real money or sends real email and is either unwired, or wired to a policy that
 * quietly allows everything when the service is absent. Both are invisible in
 * normal operation.
 *
 * It reads the policy table and the call sites out of the source, so it cannot
 * drift from what ships, and it names the surfaces the founder asked about
 * explicitly rather than only summarising.
 *
 * Read-only: no database, no network, no writes.
 * USAGE: node scripts/verify/rate-limit-audit.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const POLICIES = join(ROOT, 'src', 'lib', 'rate-limit', 'policies.ts')
const SRC = join(ROOT, 'src')

const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const scanned = []

// ---- 1. the policy table --------------------------------------------------
const src = readFileSync(POLICIES, 'utf8')
const policies = new Map()
// Each entry looks like:  'auth-login': { limit: 10, windowSeconds: 60, failClosed: true, ... }
const re = /'([a-z0-9-]+)'\s*:\s*\{([\s\S]*?)\n\s{2}\}/g
let m
while ((m = re.exec(src)) !== null) {
  const [, name, body] = m
  policies.set(name, {
    limit: /limit:\s*(\d+)/.exec(body)?.[1] ?? '?',
    window: /windowSec(?:onds)?:\s*(\d+)/.exec(body)?.[1] ?? '?',
    failClosed: /failClosed:\s*true/.test(body),
  })
}
scanned.push(`${policies.size} policies parsed from src/lib/rate-limit/policies.ts`)

// ---- 2. the call sites ----------------------------------------------------
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}
const files = existsSync(SRC) ? walk(SRC) : []
const callSites = new Map()
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  // EVERY invoker. The first version listed three names and missed
// `actionRateLimit`, which is the one the server ACTIONS use, so it reported
// checkout-reserve and auth-login as 'never called'. That would have told the
// founder the money path and the login path were unprotected when both are
// wired and failClosed. The list is derived from the exports of
// src/lib/rate-limit/{action,middleware}.ts.
  const cr = /(?:applyRateLimit|actionRateLimit|rateLimitAction|checkRateLimit|rateLimit)\s*\(\s*'([a-z0-9-]+)'/g
  let c
  while ((c = cr.exec(text)) !== null) {
    const rel = relative(ROOT, f).split('\\').join('/')
    if (!callSites.has(c[1])) callSites.set(c[1], new Set())
    callSites.get(c[1]).add(rel)
  }
}
scanned.push(`${files.length} TypeScript files scanned for limiter call sites`)

// ---- 3. the surfaces the founder named -----------------------------------
const NAMED = [
  { surface: 'Checkout (reserve a seat)', buckets: ['checkout-reserve'], why: 'inventory and money' },
  { surface: 'Signup', buckets: ['auth-signup'], why: 'free account creation, and it sends email' },
  { surface: 'Login', buckets: ['auth-login'], why: 'credential stuffing' },
  { surface: 'Password reset', buckets: ['auth-recover'], why: 'sends email to an address the attacker chooses' },
  { surface: 'Magic link / verification resend', buckets: ['auth-magic-link', 'auth-resend-verification'], why: 'email amplification' },
  { surface: 'AI endpoints', buckets: ['ai-chat', 'ai-chat-daily'], why: 'COSTS REAL MONEY per request' },
  { surface: 'Launch Kit composer (AI)', buckets: ['launch-compose', 'launch-compose-daily'], why: 'costs real money per request' },
  { surface: 'Event creation', buckets: [], why: 'organiser-authenticated write' },
  { surface: 'Media upload', buckets: ['media-upload', 'launch-upload'], why: 'storage cost, user bytes to a decoder' },
  { surface: 'Outbound email (Launch Kit)', buckets: ['launch-email'], why: 'sends real email' },
]

hr('1. THE SURFACES YOU ASKED ABOUT')
console.log(`  ${'surface'.padEnd(34)} ${'limit'.padStart(12)}  ${'no Upstash'.padEnd(10)} verdict`)
console.log(`  ${'-'.repeat(34)} ${'-'.repeat(12)}  ${'-'.repeat(10)} ${'-'.repeat(28)}`)
const problems = []
for (const n of NAMED) {
  if (n.buckets.length === 0) {
    console.log(`  ${n.surface.padEnd(34)} ${'NONE'.padStart(12)}  ${'ALLOWS'.padEnd(10)} NOT RATE LIMITED`)
    problems.push(`${n.surface}: no limiter at all (${n.why})`)
    continue
  }
  for (const b of n.buckets) {
    const p = policies.get(b)
    if (!p) {
      console.log(`  ${n.surface.padEnd(34)} ${'MISSING'.padStart(12)}  ${'?'.padEnd(10)} POLICY NOT FOUND (${b})`)
      problems.push(`${n.surface}: policy '${b}' does not exist`)
      continue
    }
    const wired = callSites.has(b)
    const limit = `${p.limit}/${p.window}s`
    const onAbsent = p.failClosed ? 'REFUSES' : 'ALLOWS'
    let verdict
    if (!wired) { verdict = 'POLICY EXISTS, NEVER CALLED'; problems.push(`${n.surface}: policy '${b}' is never called`) }
    else if (!p.failClosed) { verdict = 'wired, but OPEN without Upstash'; problems.push(`${n.surface}: '${b}' is failOpen (${n.why})`) }
    else verdict = 'wired, closed without Upstash'
    console.log(`  ${`${n.surface} [${b}]`.padEnd(34).slice(0, 34)} ${limit.padStart(12)}  ${onAbsent.padEnd(10)} ${verdict}`)
  }
}

// ---- 4. every policy, and the dead ones ----------------------------------
hr('2. EVERY POLICY, WITH ITS CALL SITES')
const dead = []
const openBuckets = []
for (const [name, p] of [...policies].sort()) {
  const sites = callSites.get(name)
  if (!sites) dead.push(name)
  if (!p.failClosed) openBuckets.push(name)
  console.log(`  ${name.padEnd(28)} ${`${p.limit}/${p.window}s`.padStart(11)}  ${p.failClosed ? 'failClosed' : 'failOPEN  '}  ${sites ? `${sites.size} call site(s)` : 'NEVER CALLED'}`)
}

hr('3. WHAT THIS MEANS')
console.log(`  policies defined            ${policies.size}`)
console.log(`  policies never called       ${dead.length}${dead.length ? `: ${dead.join(', ')}` : ''}`)
console.log(`  fail OPEN without Upstash   ${openBuckets.length}: ${openBuckets.join(', ')}`)
console.log('')
console.log('  A failOPEN policy is unlimited whenever Upstash is unreachable, which')
console.log('  includes a credential rotation, an outage, and a deploy where the variable')
console.log('  was not set. A failClosed policy REFUSES instead, which is correct for')
console.log('  anything that costs money or sends email, and wrong for anything a')
console.log('  first-time visitor needs in order to browse.')

hr('4. WHAT MUST BE CONFIGURED IN PRODUCTION')
console.log('  Two variables, and without BOTH every limiter takes its unconfigured branch:')
console.log('')
console.log('    UPSTASH_REDIS_REST_URL')
console.log('    UPSTASH_REDIS_REST_TOKEN')
console.log('')
console.log('  Both are declared in src/lib/env/manifest.mjs, so the env guards already')
console.log('  know about them; declaring is not the same as setting.')
console.log('')
console.log('  CONSEQUENCE OF LEAVING THEM UNSET IN PRODUCTION, stated concretely:')
console.log(`    - the ${policies.size - openBuckets.length} failClosed policies REFUSE every request. That means checkout,`)
console.log('      signup, login and password reset all return 429 to everybody. The')
console.log('      platform is effectively down, loudly, which is the safe direction but')
console.log('      is NOT a state to launch in.')
console.log(`    - the ${openBuckets.length} failOpen policies become unlimited.`)
console.log('')
console.log('  So this is not "nice to have before launch". Without Upstash, production is')
console.log('  either refusing paying customers or unthrottled on the endpoints that cost')
console.log('  money. Verify AFTER setting them by confirming a limiter actually returns')
console.log('  429 on the (limit + 1)th request against the preview.')

hr('WHAT THIS AUDIT SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
if (problems.length) {
  hr(`FINDINGS: ${problems.length}`)
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
}
console.log('')
