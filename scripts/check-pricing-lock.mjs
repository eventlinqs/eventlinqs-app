/**
 * LOCK 2 RUNNER: fails the build when live pricing_rules disagrees with
 * docs/PRICING.md.
 *
 * Runs in `prebuild`, beside check-public-env.mjs, and follows the same
 * operating contract: BLOCKING on Vercel, WARNING on a local build (so gates and
 * fresh clones still build without a service key), with a documented emergency
 * bypass. The difference from the env guard is that this one reads the database,
 * because the value it protects lives in data rather than in an environment
 * variable, which is precisely why it drifted unnoticed.
 *
 * Emergency bypass: ALLOW_PRICING_DRIFT=1. Use it only to ship a fix.
 */
import { PRICING_LOCK_RULE, PRICING_DOC } from '../src/lib/health/pricing-lock.mjs'

const onVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV)
const bypass = process.env.ALLOW_PRICING_DRIFT === '1'

let result
try {
  const facts = await PRICING_LOCK_RULE.resolve(process.env)
  result = PRICING_LOCK_RULE.validate(facts)
  if (result.ok) {
    console.log(
      `[pricing-lock] ok       ${PRICING_LOCK_RULE.name}  (${PRICING_LOCK_RULE.describe})` +
        (facts.live.ref ? `  project ${facts.live.ref}` : ''),
    )
  }
} catch (e) {
  // A missing or malformed docs/PRICING.md is itself a failure: there is no
  // authority left to check against.
  result = { ok: false, reason: e.message }
}

for (const w of result.warnings ?? []) {
  console.warn(`[pricing-lock] WARNING  ${w}`)
}

if (result.ok) {
  process.exit(0)
}

const message =
  `\n[pricing-lock] ${PRICING_LOCK_RULE.name} FAILED.\n    ${result.reason}\n\n` +
  `    ${PRICING_DOC} is the single authority for every fee figure. Nothing else may\n` +
  `    carry a fee number as a literal. If this fired, one of two things happened:\n` +
  `      1. Someone changed a rate in /admin/pricing or in the database directly.\n` +
  `         Revert it, or update ${PRICING_DOC} with founder approval and commit.\n` +
  `      2. The pricing lock migration has not been applied to this database.\n` +
  `         Apply supabase/migrations/20260727000001_pricing_locked_values.sql.\n` +
  `    Emergency bypass (only to ship a fix): ALLOW_PRICING_DRIFT=1\n`

if (onVercel && !bypass) {
  console.error(`${message}\n[pricing-lock] BUILD BLOCKED.\n`)
  process.exit(1)
}

console.warn(`${message}\n[pricing-lock] WARNING only (${onVercel ? 'bypass set' : 'local build'}); this WOULD block on Vercel.\n`)
process.exit(0)
