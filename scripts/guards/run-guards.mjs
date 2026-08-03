/**
 * The guard runner. Invoked by `npm run guards` and, through it, by `prebuild`,
 * so every one of these is unskippable on the path to a deployable build.
 *
 * Each guard turns a law that was previously enforced by hope into one enforced
 * by a non-zero exit code:
 *
 *   auth-provider-guard   no provider button without a server-resolved gate
 *   no-supabase-smtp      no auth flow on Supabase's 2-per-hour built-in mailer
 *   sender-single-source  one definition of the sending identity
 *   auth-autocomplete     credential-manager attributes on every auth form
 *
 * Runs them all rather than short-circuiting, so one pass reports every
 * violation instead of making the founder play whack-a-mole.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const GUARDS = [
  'auth-provider-guard.mjs',
  'no-supabase-smtp.mjs',
  'sender-single-source.mjs',
  'auth-autocomplete-guard.mjs',
]

let failed = 0

for (const guard of GUARDS) {
  const result = spawnSync(process.execPath, [join(HERE, guard)], { stdio: 'inherit' })
  if (result.status !== 0) failed += 1
}

if (failed > 0) {
  console.error(`\n[guards] ${failed} of ${GUARDS.length} guard(s) FAILED. Build blocked.\n`)
  process.exit(1)
}

console.log(`\n[guards] all ${GUARDS.length} guards PASS.\n`)
