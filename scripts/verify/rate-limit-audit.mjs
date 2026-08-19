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
  // The policies module DEFINES the buckets; it is not a caller.
  const norm = f.split(String.fromCharCode(92)).join('/')
  if (norm.endsWith('src/lib/rate-limit/policies.ts')) continue
  const text = readFileSync(f, 'utf8')
  /*
   * TWO CALL SHAPES, and missing either one produces a false "never called".
   *
   *   applyRateLimit('bucket') / actionRateLimit('bucket')   the helpers
   *   POLICIES['bucket']                                     a direct lookup, then
   *                                                          checkRateLimit(...)
   *
   * This audit was wrong twice for exactly this reason, and both errors would have
   * been reported to the founder as findings. Version one knew three helper names
   * and missed `actionRateLimit`, so it called checkout-reserve and auth-login
   * unprotected when both are wired and fail closed. Version two still missed the
   * POLICIES[...] shape, so it called media-upload (4 real call sites) and
   * newsletter-subscribe (1) dead. A live limiter reported dead is the most
   * expensive kind of wrong here, because the response is to "wire" something that
   * is already wired.
   */
  const shapes = [
    /(?:applyRateLimit|actionRateLimit|rateLimitAction|rateLimitWithHeaders)\s*\(\s*'([a-z0-9-]+)'/g,
    /POLICIES\s*\[\s*'([a-z0-9-]+)'\s*\]/g,
  ]
  for (const cr of shapes) {
    cr.lastIndex = 0
    let c
    while ((c = cr.exec(text)) !== null) {
      const rel = relative(ROOT, f).split(String.fromCharCode(92)).join('/')
      if (!callSites.has(c[1])) callSites.set(c[1], new Set())
      callSites.get(c[1]).add(rel)
    }
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
  // NOT an AI spend path, despite the name and its position beside ai-chat. The
  // compose engine is DETERMINISTIC and spends no model tokens (founder ruling
  // 9 Aug 2026; src/app/launch/actions.ts:28 and src/lib/launch/compose.ts). Its
  // fail-OPEN is a documented decision, not an oversight: "a Redis blip must never
  // stop a stranger building a kit, because there is no spend to protect". An
  // earlier version of this audit labelled it an AI bill and it was wrong.
  { surface: 'Launch Kit composer (deterministic, no model tokens)', buckets: ['launch-compose', 'launch-compose-daily'], why: 'database writes and render CPU, NOT an API bill' },
  { surface: 'Event creation', buckets: ['event-create'], why: 'organiser-authenticated write' },
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
console.log('  READ THE TWO CASES SEPARATELY. They are not the same and an earlier version of')
console.log('  this audit conflated them, which overstated the risk of an outage.')
console.log('')
console.log('  MISSING CONFIG (no UPSTASH_* set), from src/lib/redis/rate-limit.ts:114:')
console.log('    failClosed AND NODE_ENV === production  -> BLOCK (429)')
console.log('    anything else                           -> ALLOW (unlimited)')
console.log('  So failClosed only ever matters for a deploy with the variables absent, and')
console.log('  only in production. Locally and in tests everything allows, by design.')
console.log('')
console.log('  STORE ERROR (configured but Upstash failing), same file:')
console.log('    -> degrades to a per-instance in-memory window for EVERY policy,')
console.log('       failClosed or not. It is bounded, not unlimited.')
console.log('  An outage therefore does NOT remove the limit from a failOpen policy. That')
console.log('  matters for sizing the risk: the exposure is a MISCONFIGURED DEPLOY, not an')
console.log('  Upstash incident.')

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
console.log(`    - IN PRODUCTION (NODE_ENV === 'production') the ${policies.size - openBuckets.length} failClosed policies REFUSE`)
console.log('      every request. That means checkout,')
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
