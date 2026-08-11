/**
 * THE PROOF THAT THE LOCKS CAN FAIL.
 *
 *   node scripts/verify/env-locks-verify.mjs
 *
 * A lock nobody has ever seen fire is a lock nobody has proven exists. This
 * harness takes a KNOWN-GOOD production environment and a KNOWN-GOOD store
 * inventory, breaks exactly ONE manifest expectation at a time, and asserts two
 * things per case:
 *
 *   1. the evaluator FAILS, and
 *   2. the failure NAMES the right rule.
 *
 * Then it restores and asserts the same input passes clean. A case that fails to
 * fail is reported as loudly as a case that fails to pass, because a guard that
 * cannot fire is worse than no guard: it is a guard everyone trusts.
 *
 * NO SECRETS ANYWHERE. Every value here is a synthetic string built from
 * repeated characters. Nothing in this file is or resembles a real credential,
 * and the evaluators it drives return findings, never values.
 *
 * Exits 0 when every case behaved as declared, 1 otherwise.
 */

import { evaluateProcessEnv, evaluateStores } from '../../src/lib/env/manifest-checks.mjs'
import { ENV_MANIFEST, storePolicyFor } from '../../src/lib/env/manifest.mjs'
// ONE known-good production environment, shared with the CI-blocking half in
// tests/unit/security/env-manifest.test.ts. It used to be a second copy living
// in this file, and a variable added to the manifest reached only one of the
// two. See the header of the fixture for the whole story.
import { rep, ACCOUNT, goodProductionEnv } from '../../tests/fixtures/env/good-production-env.mjs'

/** A synthetic STORE inventory that satisfies the whole manifest. */
function goodInventory() {
  const records = []
  for (const entry of ENV_MANIFEST) {
    for (const scope of ['production', 'preview', 'development']) {
      // storePolicyFor: a correct STORE never holds a secret on the Development
      // scope, because Vercel cannot mark it sensitive there (ruling R3).
      if (storePolicyFor(entry, scope) !== 'required') continue
      records.push({
        name: entry.name,
        scope,
        gitBranch: null,
        // A record that must be sensitive is modelled as unreadable, which is
        // exactly what a sensitive record looks like from outside the store.
        readable: !entry.mustBeSensitive,
        length: 64,
        fp: 'aaaaaaaa',
      })
    }
  }
  return {
    records,
    githubSecrets: ENV_MANIFEST.filter(e => e.githubActions).map(e => e.name),
  }
}

const results = []
function expectFailure(lock, label, findings, expectedRuleOrVar) {
  const hit = findings.find(f => f.name === expectedRuleOrVar)
  const ok = Boolean(hit)
  results.push({ lock, label, ok })
  console.log(`  ${ok ? 'FIRES ' : 'SILENT'}  [${lock}] ${label}`)
  if (ok) console.log(`            reason: ${hit.reason.split('\n')[0].slice(0, 150)}`)
  else console.log(`            EXPECTED a finding named "${expectedRuleOrVar}", got: ${findings.map(f => f.name).join(', ') || '(none)'}`)
}
function expectClean(lock, label, findings) {
  const ok = findings.length === 0
  results.push({ lock, label, ok })
  console.log(`  ${ok ? 'CLEAN ' : 'DIRTY '}  [${lock}] ${label}`)
  if (!ok) for (const f of findings) console.log(`            unexpected: ${f.name}: ${f.reason.split('\n')[0].slice(0, 150)}`)
}

console.log(`\nENV LOCK PROOF  (manifest declares ${ENV_MANIFEST.length} variables)\n${'='.repeat(72)}`)

// ── BASELINE: the known-good inputs must be clean, or every "it fired" below
// would be meaningless. This is the restore half of break-restore.
console.log('\nBASELINE (the known-good inputs)')
expectClean('2', 'a complete, correct production environment passes', evaluateProcessEnv(goodProductionEnv()).findings)
expectClean('3', 'a complete, correct store inventory passes', evaluateStores(goodInventory()).findings)

// ── LOCK 2: the build guard, one broken expectation at a time ───────────────
console.log('\nLOCK 2  the production BUILD guard')

{
  const env = goodProductionEnv()
  delete env.STRIPE_WEBHOOK_SECRETS
  expectFailure('2', 'a variable MISSING from a required scope', evaluateProcessEnv(env).findings, 'STRIPE_WEBHOOK_SECRETS')
}
{
  const env = goodProductionEnv()
  env.RESEND_API_KEY = ''
  expectFailure('2', 'a variable PRESENT BUT EMPTY (the silent-failure class)', evaluateProcessEnv(env).findings, 'RESEND_API_KEY')
}
{
  const env = goodProductionEnv()
  env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'not-a-google-key'
  expectFailure('2', 'a variable that FAILS ITS SHAPE REGEX', evaluateProcessEnv(env).findings, 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
}
{
  const env = goodProductionEnv()
  env.EMAIL_FROM = 'EventLinqs <noreply@send.eventlinqs.com>'
  expectFailure('2', 'the sender drifting back to the UNVERIFIED Resend domain', evaluateProcessEnv(env).findings, 'EMAIL_FROM')
}
{
  const env = goodProductionEnv()
  env.HOMEPAGE_SEED_FIXTURE = '1'
  expectFailure('2', 'a variable PRESENT ON A SCOPE THAT FORBIDS IT (fixture on production)', evaluateProcessEnv(env).findings, 'HOMEPAGE_SEED_FIXTURE')
}
{
  const env = goodProductionEnv()
  env.ALLOW_EMPTY_PUBLIC_ENV = '1'
  const out = evaluateProcessEnv(env)
  expectFailure('2', 'a GUARD BYPASS FLAG stored on the scope', out.findings, 'ALLOW_EMPTY_PUBLIC_ENV')
  // And it must land in the class that the bypass flag itself cannot switch off.
  const inAlways = out.alwaysBlocking.some(f => f.name === 'ALLOW_EMPTY_PUBLIC_ENV')
  results.push({ lock: '2', label: 'the bypass flag cannot bypass the rule that forbids it', ok: inAlways })
  console.log(`  ${inAlways ? 'FIRES ' : 'SILENT'}  [2] the bypass flag lands in the NEVER-BYPASSABLE class`)
}
{
  const env = goodProductionEnv()
  env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW = `eyJ${rep('z', 60)}`
  expectFailure('2', 'a PREVIEW override present on PRODUCTION', evaluateProcessEnv(env).findings, 'SUPABASE_SERVICE_ROLE_KEY_PREVIEW')
}

// ── LOCK 3: cross-variable and cross-store ─────────────────────────────────
console.log('\nLOCK 3  cross-variable and cross-store consistency')

{
  const env = goodProductionEnv()
  env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = `pk_live_51${rep('D', 15)}${rep('P', 30)}`
  expectFailure('3', 'pk_live_51 account id NOT EQUAL to sk_live_51 account id', evaluateProcessEnv(env).findings, 'STRIPE_ACCOUNT_PAIRING')
}
{
  const env = goodProductionEnv()
  env.STRIPE_SECRET_KEY = `sk_test_51${ACCOUNT}${rep('S', 30)}`
  expectFailure('3', 'a TEST key coexisting with a LIVE key on production', evaluateProcessEnv(env).findings, 'STRIPE_MODE_FAMILY')
}
{
  // The production ref on a PREVIEW deployment. Modelled on the preview scope,
  // because that is the deployment that must never reach the live database.
  const env = goodProductionEnv()
  env.VERCEL_ENV = 'preview'
  env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW = 'https://gndnldyfudbytbboxesk.supabase.co'
  expectFailure('3', 'the PRODUCTION Supabase ref appearing on the PREVIEW scope', evaluateProcessEnv(env).findings, 'SUPABASE_PRODUCTION_REF_ISOLATION')
}
{
  const env = goodProductionEnv()
  env.STRIPE_WEBHOOK_SECRETS = `whsec_${rep('w', 32)}`
  expectFailure('3', 'FEWER webhook signing secrets than Stripe delivery channels', evaluateProcessEnv(env).findings, 'WEBHOOK_SECRETS_ON_PRODUCTION')
}
{
  const env = goodProductionEnv()
  env.STRIPE_WEBHOOK_SECRETS = `whsec_${rep('w', 32)},sk_live_${rep('n', 32)}`
  expectFailure('3', 'a STRIPE_WEBHOOK_SECRETS entry that is not a whsec_ secret', evaluateProcessEnv(env).findings, 'STRIPE_WEBHOOK_SECRETS')
}
{
  const inv = goodInventory()
  inv.githubSecrets = inv.githubSecrets.filter(n => n !== 'CRON_SECRET')
  expectFailure('3', 'CRON_SECRET present in Vercel and ABSENT from GitHub Actions', evaluateStores(inv).findings, 'CRON_SECRET')
}
{
  const inv = goodInventory()
  inv.records = inv.records.filter(r => !(r.name === 'CRON_SECRET' && r.scope === 'production'))
  expectFailure('3', 'CRON_SECRET present in GitHub Actions and ABSENT from Vercel Production', evaluateStores(inv).findings, 'CRON_SECRET')
}
{
  const inv = goodInventory()
  for (const r of inv.records) if (r.name === 'SUPABASE_SERVICE_ROLE_KEY') r.readable = true
  expectFailure('3', 'a secret that must be SENSITIVE being readable back out of the store', evaluateStores(inv).findings, 'SUPABASE_SERVICE_ROLE_KEY')
}
{
  const inv = goodInventory()
  for (const r of inv.records) {
    if (r.name === 'STRIPE_WEBHOOK_SECRETS' && r.scope === 'preview') r.gitBranch = 'feat/some-branch'
  }
  expectFailure('3', 'a scope-wide preview variable WRONGLY PINNED to one git branch', evaluateStores(inv).findings, 'STRIPE_WEBHOOK_SECRETS')
}
{
  const inv = goodInventory()
  inv.records.push({ name: 'HOMEPAGE_SEED_FIXTURE', scope: 'production', gitBranch: null, readable: true, length: 1, fp: 'bbbbbbbb' })
  expectFailure('3', 'a FORBIDDEN variable holding a record on the production scope', evaluateStores(inv).findings, 'HOMEPAGE_SEED_FIXTURE')
}

// ── LOCK 4 shares LOCK 2's evaluator by design, so the same breakages must be
// visible at runtime. Proving it here is proving the sentinel sees it too: the
// sentinel calls evaluateProcessEnv(process.env) on its schedule.
console.log('\nLOCK 4  runtime drift detection (same evaluator, serving deployment)')
{
  const env = goodProductionEnv()
  env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ''
  const out = evaluateProcessEnv(env)
  expectFailure('4', 'a value emptied AFTER deploy is visible to the runtime evaluator', out.findings, 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
}
{
  const env = goodProductionEnv()
  env.STRIPE_SECRET_KEY = `sk_test_51${ACCOUNT}${rep('S', 30)}`
  const out = evaluateProcessEnv(env)
  expectFailure('4', 'a live key swapped for a test key is visible to the runtime evaluator', out.findings, 'STRIPE_MODE_FAMILY')
}

// ── RESTORE: the same known-good inputs, after every breakage, are clean again.
console.log('\nRESTORE (break-restore closes here)')
expectClean('2', 'the production environment is clean again', evaluateProcessEnv(goodProductionEnv()).findings)
expectClean('3', 'the store inventory is clean again', evaluateStores(goodInventory()).findings)

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(72)}`)
if (failed.length === 0) {
  console.log(`ALL ${results.length} CASES BEHAVED AS DECLARED. Every lock has been observed to fire.\n`)
  process.exit(0)
}
console.log(`${failed.length} of ${results.length} CASES DID NOT BEHAVE AS DECLARED:`)
for (const f of failed) console.log(`  - [lock ${f.lock}] ${f.label}`)
console.log('')
process.exit(1)
