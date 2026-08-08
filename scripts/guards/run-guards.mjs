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
 *   auth-autocomplete          credential-manager attributes on every auth form
 *   auth-provider-cost         no provider gate on a route with no provider button
 *   check-client-barrel-imports  no third-party namespace import in the browser bundle
 *   rls-exposure-scan          no world-readable policy exposes a sensitive column
 *   no-native-submit           no form puts a credential in the URL pre-hydration
 *   revoked-column-reads       no untrusted-role query selects a revoked column
 *   no-plaintext-credential    no tracked file contains a plaintext credential
 *   entrypoint-authz-audit     every request entry point declares an auth posture
 *   sourced-specifications     Law 7: a third-party spec carries a source or UNSOURCED
 *
 * On sourced-specifications: Law 7 forbids stating any specification, dimension,
 * limit, price, format or platform behaviour from memory. No static check can judge
 * whether prose was researched, and a guard demanding a citation beside every
 * numeral would fire thousands of times and be switched off within a day. So this
 * narrows to the shape that actually caused harm: a claim about SOMEBODY ELSE'S
 * platform. A line naming a third party and asserting a pixel pair or an aspect
 * ratio must carry a URL or the word UNSOURCED. An honest gap outranks a confident
 * guess, and both satisfy the gate.
 *
 * On entrypoint-authz-audit: there are 167 request entry points, 50 route handlers
 * and 117 exported server actions. The security pass had read about twenty of them
 * and reported the rest as unread, which is honest and useless, because an attacker
 * does not care which files were sampled. This walks all of them and fails the build
 * when one establishes no caller identity and is not declared public with a stated
 * reason, so a route added next month cannot skip the question silently. The
 * decisive distinction it encodes: a session-client path is governed by RLS, so the
 * database scopes the rows, while a service-role path has no backstop and a missing
 * ownership check IS the vulnerability.
 *
 * On no-plaintext-credential: GitGuardian reported a Company Email Password
 * exposed in this repository on 2026-08-08. It was hardcoded in twenty committed
 * automation scripts and reproduced into three security documents, one of them
 * written by the hardening pass itself, which quoted the leaking URL from the
 * brief and the URL contained the password. The person most alert to the defect
 * still committed it, because quoting evidence feels like documentation rather
 * than disclosure. A guard does not feel that difference. Note it protects the
 * WORKING TREE only: a secret already in history is un-exposed by ROTATION, never
 * by an edit.
 *
 * On revoked-column-reads: migration 20260808000010 narrows column privileges, and
 * a privilege failure is LOUD by design, which is right for security and is still
 * an outage in production. PostgREST returns "permission denied for column email"
 * and fails the WHOLE query, not just the field. The first draft of that migration
 * would have broken Stripe Connect onboarding, because onboard/route.ts reads
 * organisations.email with the session client. Nothing in the type system or the
 * test suite could catch it: the failure only exists once the grant changes. This
 * guard resolves the client per query, so it knows which Postgres role each read
 * runs as, and fails the build if any of them asks for a column it no longer has.
 *
 * On no-native-submit: a form written as onSubmit with preventDefault and no
 * action is correct once React is live and a credential leak before it, because
 * a native submit with no action and no method is a GET to the current URL with
 * every named field in the query string. That is how a real password reached
 * production in a URL. The first fix covered src/components/auth, which is four
 * files; the class is not four files, and the same shape carried the ADMIN
 * password, the admin TOTP code and the recovery code on /admin/login. This
 * guard is repo-wide and risk-aware: it fails on forms carrying a credential or
 * personal data, and merely lists the search boxes and filter panels, where a
 * field in the query string is the entire point.
 *
 * On rls-exposure-scan, because it is the newest and the least obvious: Row
 * Level Security filters ROWS, never COLUMNS. A permissive SELECT policy with
 * no TO clause reaches PUBLIC, which includes anon, and the anon key is
 * NEXT_PUBLIC and readable in any page source. So one such policy publishes
 * every column of every matching row to the whole internet. That shipped twice:
 * 20260625000002 closed it on profiles (email, full_name, phone) and
 * 20260808000010 closed it on organisations, on event_artists.invite_token (a
 * credential that transfers profile ownership) and on venues. The first fix
 * dropped a policy, which fixed the instance and left the class alive. This
 * guard models both the policies and the column grants, so it fails the build
 * when the shape reappears on any table, including one not yet written.
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
  'scripts/guards/auth-autocomplete-guard.mjs',
  // From PR #111. See THE BOUNDARY above: separate file, separate question,
  // shared runner. Absent from this list, `prebuild` stops checking the browser
  // bundle for untree-shakeable namespace imports and nothing goes red.
  'scripts/check-client-barrel-imports.mjs',
  // RLS column exposure. Deliberately written WITHOUT apostrophes: the registry
  // test extracts single-quoted strings from this array, so an apostrophe in a
  // comment here is parsed as the start of a registered path and turns
  // tests/unit/guards/guard-registry.test.ts red for a reason that has nothing
  // to do with guards. Full rationale lives in the header above and in
  // docs/security/AUDIT-2026-08-08.md.
  'scripts/security/rls-exposure-scan.mjs',
  'scripts/guards/no-native-submit-guard.mjs',
  'scripts/security/revoked-column-reads.mjs',
  'scripts/guards/no-plaintext-credential.mjs',
  'scripts/security/entrypoint-authz-audit.mjs',
  'scripts/guards/sourced-specifications.mjs',
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
