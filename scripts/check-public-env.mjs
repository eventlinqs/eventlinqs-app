/**
 * BUILD-TIME EMPTY / MALFORMED PUBLIC ENV GUARD.
 *
 * The founder's permanent requirement after the empty NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 * silently broke every map: a build must FAIL OUTRIGHT if a critical public
 * variable is empty or malformed, so a silently-broken deployment can never
 * ship again. NEXT_PUBLIC_ values are baked at build time, so this is the only
 * place the empty value can be caught before it is compiled into the bundle.
 *
 * Runs in `prebuild`. Active on Vercel builds (VERCEL set); on a local build it
 * WARNS but does not block (so local gates and fresh clones still build). Set
 * ALLOW_EMPTY_PUBLIC_ENV=1 to force past it in a genuine emergency.
 */
// @next/env is CommonJS, so it is imported by default export, not by name.
import nextEnv from '@next/env'
import { CRITICAL_ENV_RULES, evalEnvRule, ALWAYS_BLOCKING_RULES } from '../src/lib/health/critical-env.mjs'

// RESOLVE THE ENV THE WAY next build WILL, before judging it.
//
// This script runs in `prebuild`, as a plain node process. Node does not read
// .env files, so without this the guard inspected an EMPTY environment, passed,
// and `next build` then loaded .env.local a second later and baked whatever it
// found into the bundle. A guard that cannot see what the build will see is not
// a guard: this exact hole let a clean-shell build sail through while pointing
// at the production project.
//
// loadEnvConfig is Next's own loader, so the precedence (.env.production.local,
// .env.local, .env.production, .env, with existing process.env winning) cannot
// drift from the build's.
nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} })

const onVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV)
const bypass = process.env.ALLOW_EMPTY_PUBLIC_ENV === '1'
const env = process.env

const buildRules = CRITICAL_ENV_RULES.filter(r => r.buildCritical)
const results = buildRules.map(r => evalEnvRule(r, env))
const failures = results.filter(r => !r.ok)

for (const r of results) {
  const tag = r.ok ? 'ok  ' : r.state === 'empty' ? 'EMPTY' : r.state === 'missing' ? 'MISSING' : 'MALFORMED'
  console.log(`[public-env] ${tag.padEnd(9)} ${r.name}  (${r.describe})${r.ok ? '' : ' - ' + r.reason}`)
}

// Server-critical secrets are not build-baked, so they cannot block the build -
// but a MISSING one is silently catastrophic at runtime. CRON_SECRET is the
// worst: requireCronAuth fails closed, so with it unset EVERY cron (payment
// sentinel, reservation expiry, payout holds, event disbursement, the health
// heartbeat) is rejected 401 and the platform goes quiet with no error anywhere.
// Surface it loudly in the build log on every deploy.
const serverRules = CRITICAL_ENV_RULES.filter(r => !r.buildCritical)
const serverResults = serverRules.map(r => evalEnvRule(r, env))
const serverBad = serverResults.filter(r => !r.ok)
if (serverBad.length > 0 && onVercel) {
  console.warn(
    `\n[public-env] ==================== SERVER SECRET WARNING ====================\n` +
      serverBad.map(f => `  ! ${f.name}: ${f.reason}`).join('\n') +
      (serverBad.some(f => f.name === 'CRON_SECRET')
        ? `\n\n  CRON_SECRET is missing or weak: cron auth FAILS CLOSED, so every\n  scheduled job (payment sentinel, reservation expiry, payout holds,\n  event disbursement, health heartbeat) will be rejected 401 and run\n  NEVER, with no error surfaced. Set it in Vercel for this environment.`
        : '') +
      `\n[public-env] ===============================================================\n`,
  )
}

if (failures.length === 0) {
  console.log('[public-env] all critical public env vars present, non-empty, and well-formed.')
  process.exit(0)
}

// ── ALWAYS-BLOCKING CLASS ───────────────────────────────────────────────────
// Most failures here are "a value is missing or malformed", which on a local
// machine is a fresh-clone nuisance and only warns. A handful are a different
// class entirely: never a nuisance, never correct, and each one has already cost
// this project real money or real time.
//
//   SUPABASE_ENV_ISOLATION            pointed at the LIVE database
//   STRIPE_LIVE_KEY_PAIRING           test keys, or a mismatched pair, on production
//   ENV_MANIFEST_FORBIDDEN_AND_CROSS  a variable on a scope that forbids it, a
//                                     stored guard bypass, or a cross-variable
//                                     disagreement
//
// These block wherever they fire, local included, and ALLOW_EMPTY_PUBLIC_ENV
// deliberately does NOT bypass them: that flag is for empty values, not for the
// wrong database, not for a dead checkout, and certainly not for a guard someone
// switched off and forgot. Each rule carries its own named, deliberate override
// where one is legitimate (ALLOW_PRODUCTION_SUPABASE=1), so reaching here means
// no override was set.
//
// The list is derived from the rules themselves (`alwaysBlocking: true`), not
// re-typed here, so a new rule joins this class by declaring it.
const alwaysBlockingFailures = failures.filter(f => ALWAYS_BLOCKING_RULES.has(f.name))
if (alwaysBlockingFailures.length > 0) {
  console.error(
    `\n[public-env] ==================== BUILD BLOCKED ====================\n` +
      alwaysBlockingFailures.map(f => `  ! ${f.name}: ${f.reason}`).join('\n') +
      `\n[public-env] =======================================================\n`,
  )
  process.exit(1)
}

const summary = failures.map(f => `  - ${f.name}: ${f.reason}`).join('\n')
if (onVercel && !bypass) {
  console.error(
    `\n[public-env] BUILD BLOCKED. ${failures.length} build-critical rule(s) failed:\n${summary}\n\n` +
      `Why this blocks: a NEXT_PUBLIC_ value is compiled into the browser bundle at build time, so shipping it empty or malformed breaks the feature with no runtime error (the exact map failure this guard exists to prevent), and a variable that fails its declared shape in src/lib/env/manifest.mjs is wrong in a way nothing downstream will report.\n` +
      `Fix: set the correct value in Vercel → Project → Settings → Environment Variables for this scope, then redeploy. The manifest states what each variable must look like and which scopes it belongs on.\n` +
      `Emergency bypass (not recommended, and it does NOT cover the always-blocking class above): set ALLOW_EMPTY_PUBLIC_ENV=1.\n`,
  )
  process.exit(1)
}

console.warn(
  `\n[public-env] WARNING (not blocking - ${onVercel ? 'bypass set' : 'local build'}): ${failures.length} critical public var(s) empty/malformed:\n${summary}\n`,
)
process.exit(0)
