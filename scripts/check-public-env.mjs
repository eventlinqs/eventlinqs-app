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
import { CRITICAL_ENV_RULES, evalEnvRule } from '../src/lib/health/critical-env.mjs'

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

const summary = failures.map(f => `  - ${f.name}: ${f.reason}`).join('\n')
if (onVercel && !bypass) {
  console.error(
    `\n[public-env] BUILD BLOCKED. ${failures.length} critical public variable(s) are empty or malformed:\n${summary}\n\n` +
      `These NEXT_PUBLIC_ values are compiled into the browser bundle at build time. Shipping them empty silently breaks the feature with no runtime error (the exact map failure this guard exists to prevent).\n` +
      `Fix: set the correct value in Vercel → Project → Settings → Environment Variables for this scope, then redeploy.\n` +
      `Emergency bypass (not recommended): set ALLOW_EMPTY_PUBLIC_ENV=1.\n`,
  )
  process.exit(1)
}

console.warn(
  `\n[public-env] WARNING (not blocking - ${onVercel ? 'bypass set' : 'local build'}): ${failures.length} critical public var(s) empty/malformed:\n${summary}\n`,
)
process.exit(0)
