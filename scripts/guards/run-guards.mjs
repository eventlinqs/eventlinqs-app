/**
 * The guard runner. Invoked by `npm run guards` and, through it, by `prebuild`,
 * so every one of these is unskippable on the path to a deployable build.
 *
 * Each guard turns a law that was previously enforced by hope into one enforced
 * by a non-zero exit code:
 *
 *   node-version-contract      no script may use an API newer than CI's Node
 *   auth-provider-guard        no provider button without a server-resolved gate
 *   no-supabase-smtp           no auth flow on Supabase's 2-per-hour built-in mailer
 *   sender-single-source       one definition of the sending identity
 *   no-unguarded-credential-form  no password field submittable before hydration
 *   no-control-characters      no heredoc-corrupted byte in any source file
 *   auth-autocomplete          credential-manager attributes on every auth form
 *   auth-provider-cost         no provider gate on a route with no provider button
 *   canonical-host             one definition of the canonical host, resolved everywhere
 *   short-link-namespace       /e/ and /s/ own their segments; no code can shadow a route
 *   check-client-barrel-imports  no third-party namespace import in the browser bundle
 *
 * Runs them all rather than short-circuiting, so one pass reports every
 * violation instead of making the founder play whack-a-mole.
 *
 * THE BOUNDARY BETWEEN THE TWO GUARD SYSTEMS, stated because the rebase that
 * brought them together made it a live question rather than a tidy one.
 *
 * Two independent lines of work each added a build-failing guard and each wired
 * it into the same `prebuild` line. PR #111 added
 * `scripts/check-client-barrel-imports.mjs`, which protects the SIZE of the
 * browser bundle. This branch added the runner you are reading, which protects
 * the CORRECTNESS of the auth surface and the runtime every script assumes.
 * Git presented that as one conflicted line, and the shape of the conflict made
 * "keep my side" delete the other side's guard with nothing going red: the build
 * would have stayed green while an entire class of regression stopped being
 * checked. That is the failure mode this comment exists to prevent recurring.
 *
 * preview-deployment-state: fails when the newest deployment for the current
 * branch is in ERROR. Added 9 August 2026 after feat/public-composer was found
 * with SIX consecutive preview builds in ERROR while tsc, eslint, 1839 tests
 * and nine guards all reported green, because none of them can see a bundler
 * failure. Skips loudly without a VERCEL_TOKEN rather than failing on every
 * machine without credentials, because a guard everyone disables protects
 * nothing. A skip is the honest state, not a pass.
 *
 * The resolution is deliberately structural rather than a longer `&&` chain.
 * `prebuild` now names ONE runner, and the list below is the single place a
 * build-failing guard is registered, so a third line of work cannot recreate
 * the same collision. The two systems keep separate FILES because they answer
 * separate questions and fail for separate reasons; they share a RUNNER because
 * "what must be true before this repository may be built" is one list, not two.
 *
 * The barrel guard gains something real from being here rather than in the
 * chain: the runtime banner below now covers it too. It was previously run on
 * whatever Node happened to be on the machine, with nothing saying so.
 *
 * THE RUNTIME BANNER. On 2026-08-05 this suite reported all-pass on a laptop
 * running Node 24 while three of its four guards were crashing in CI on Node 20.
 * The suite was not wrong about the code; it was measured on a runtime CI never
 * uses, and nothing said so. It says so now: any run whose Node major is not the
 * `.nvmrc` contract is labelled NOT CI-EQUIVALENT in its own output, so a green
 * local run cannot be quoted as proof of a green CI run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * Every build-failing guard, as a path relative to the repository root.
 *
 * Repo-relative rather than a bare filename, because the list is no longer all
 * one directory and pretending otherwise would have meant either moving another
 * line of work's file to fit this runner's assumption, or quietly leaving it
 * out. Registering a guard is now one line here, wherever the guard lives.
 */
const GUARDS = [
  'scripts/guards/node-version-contract.mjs',
  'scripts/guards/auth-provider-guard.mjs',
  'scripts/guards/auth-provider-cost-guard.mjs',
  'scripts/guards/no-supabase-smtp.mjs',
  'scripts/guards/sender-single-source.mjs',
  'scripts/guards/no-unguarded-credential-form.mjs',
  'scripts/guards/no-control-characters.mjs',
  'scripts/guards/auth-autocomplete-guard.mjs',
  // One definition of the canonical host. The same wrong-domain defect had
  // landed in six places, including four share-card generators that printed it
  // onto an artefact a stranger sees, and every one was found by accident.
  'scripts/guards/canonical-host.mjs',
  // A share code is a readable slug, so it must never be mintable as something
  // that shadows a real route, and nothing else may take the /e/ segment.
  'scripts/guards/short-link-namespace.mjs',
  // A branch whose preview has not built is a branch whose verification is
  // fiction (founder ruling, 9 August 2026). Skips loudly without a token.
  'scripts/guards/preview-deployment-state.mjs',
  // From PR #111. See THE BOUNDARY above: separate file, separate question,
  // shared runner. Absent from this list, `prebuild` stops checking the browser
  // bundle for untree-shakeable namespace imports and nothing goes red.
  'scripts/check-client-barrel-imports.mjs',
]

/**
 * A registered guard that does not exist is a silent hole: `spawnSync` on a
 * missing file yields a non-zero status that reads like an ordinary guard
 * failure, and a typo'd path would report as "the guard failed" rather than
 * "the guard is not there". Checked up front so the two cannot be confused.
 */
const missing = GUARDS.filter((g) => !existsSync(join(ROOT, g)))
if (missing.length > 0) {
  console.error('\n[guards] FAILED before running anything.\n')
  for (const g of missing) console.error(`    registered but not on disk: ${g}`)
  console.error('\n    Fix the path in scripts/guards/run-guards.mjs, or restore the guard.\n')
  process.exit(1)
}

/** The Node major CI installs, from the one file that defines it. */
function contractMajor() {
  const file = join(ROOT, '.nvmrc')
  if (!existsSync(file)) return null
  const major = Number.parseInt(readFileSync(file, 'utf8').trim().replace(/^v/, ''), 10)
  return Number.isInteger(major) ? major : null
}

const CONTRACT = contractMajor()
const RUNNING = Number.parseInt(process.versions.node.split('.')[0], 10)
const CI_EQUIVALENT = CONTRACT !== null && RUNNING === CONTRACT

let failed = 0

for (const guard of GUARDS) {
  const result = spawnSync(process.execPath, [join(ROOT, guard)], { stdio: 'inherit' })
  if (result.status !== 0) failed += 1
}

const runtime = CI_EQUIVALENT
  ? `Node ${process.versions.node} (CI-EQUIVALENT: matches the .nvmrc contract of ${CONTRACT})`
  : `Node ${process.versions.node} (NOT CI-EQUIVALENT: .nvmrc pins ${CONTRACT}, CI runs that, this is ${RUNNING})`

if (failed > 0) {
  console.error(`\n[guards] ${failed} of ${GUARDS.length} guard(s) FAILED. Build blocked.`)
  console.error(`[guards] runtime: ${runtime}\n`)
  process.exit(1)
}

console.log(`\n[guards] all ${GUARDS.length} guards PASS.`)
console.log(`[guards] runtime: ${runtime}`)
if (!CI_EQUIVALENT) {
  console.log(
    `[guards] this PASS is NOT proof CI is green. Reproduce CI's runtime with:\n` +
      `[guards]   npm run guards:contract-node\n`,
  )
} else {
  console.log('')
}
