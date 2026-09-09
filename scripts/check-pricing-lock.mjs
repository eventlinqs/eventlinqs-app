/**
 * LOCK 2 RUNNER: fails the build when live pricing_rules disagrees with
 * docs/PRICING.md.
 *
 * Runs in `prebuild`, beside check-public-env.mjs, and follows the same
 * operating contract: BLOCKING on every configured machine, Vercel AND a CI
 * runner, WARNING on a developer machine (so fresh clones still build without a
 * key), with a documented emergency bypass. The difference from the env guard is
 * that this one reads the database, because the value it protects lives in data
 * rather than in an environment variable, which is precisely why it drifted
 * unnoticed.
 *
 * CI USED TO BE EXCUSED AS A LAPTOP (close-out F1.2 and F1.3). On 8 September
 * 2026 this printed, inside GitHub Actions:
 *
 *     pricing_rules could not be read, so the locked values are UNVERIFIED.
console.warn(`${message}\n[pricing-lock] WARNING only (${bypass ? 'ALLOW_PRICING_DRIFT=1 is set' : `${scope} build`}); this WOULD block on Vercel and in CI.\n`)
 *
 * It could not read pricing_rules because the workflow carried
 * https://example.supabase.co, and it excused itself because everything that was
 * not Vercel was called a laptop. Both halves are fixed: CI now carries the TEST
 * project, and the scope comes from the one shared resolver in
 * src/lib/health/build-scope.mjs and is printed with the variable that decided it.
 *
 * Emergency bypass: ALLOW_PRICING_DRIFT=1. Use it only to ship a fix, and
 * scripts/guards/no-build-guard-bypass.mjs refuses it on any configured
 * machine (close-out F1.4).
 */
import { PRICING_LOCK_RULE, PRICING_DOC } from '../src/lib/health/pricing-lock.mjs'
import { describeBuildScope, resolveBuildScope } from '../src/lib/health/build-scope.mjs'

const { scope, blocks } = resolveBuildScope(process.env)
const bypass = process.env.ALLOW_PRICING_DRIFT === '1'

console.log(`[pricing-lock] ${describeBuildScope(process.env)}`)

let result
try {
  const facts = await PRICING_LOCK_RULE.resolve(process.env)
  result = PRICING_LOCK_RULE.validate(facts)
  if (result.ok) {
    console.log(
      `[pricing-lock] ok       ${PRICING_LOCK_RULE.name}  (${PRICING_LOCK_RULE.describe})` +
        (facts.live.ref ? `  project ${facts.live.ref}` : '') +
        (facts.live.readAs ? `, read as ${facts.live.readAs}` : ''),
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

if (blocks && !bypass) {
  console.error(`${message}\n[pricing-lock] BUILD BLOCKED.\n`)
  process.exit(1)
}

console.warn(
  `${message}\n[pricing-lock] WARNING only (${bypass ? 'ALLOW_PRICING_DRIFT=1 is set' : `${scope} build`}); this WOULD block on Vercel and in CI.\n`,
)
process.exit(0)
