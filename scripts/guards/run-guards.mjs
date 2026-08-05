/**
 * The guard runner. Invoked by `npm run guards` and, through it, by `prebuild`,
 * so every one of these is unskippable on the path to a deployable build.
 *
 * Each guard turns a law that was previously enforced by hope into one enforced
 * by a non-zero exit code:
 *
 *   node-version-contract no script may use an API newer than CI's Node
 *   auth-provider-guard   no provider button without a server-resolved gate
 *   no-supabase-smtp      no auth flow on Supabase's 2-per-hour built-in mailer
 *   sender-single-source  one definition of the sending identity
 *   auth-autocomplete     credential-manager attributes on every auth form
 *
 * Runs them all rather than short-circuiting, so one pass reports every
 * violation instead of making the founder play whack-a-mole.
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

const GUARDS = [
  'node-version-contract.mjs',
  'auth-provider-guard.mjs',
  'no-supabase-smtp.mjs',
  'sender-single-source.mjs',
  'auth-autocomplete-guard.mjs',
]

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
  const result = spawnSync(process.execPath, [join(HERE, guard)], { stdio: 'inherit' })
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
