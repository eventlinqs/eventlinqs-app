/**
 * APPLY THE PENDING MIGRATIONS TO PRODUCTION: the founder's reserved step, as
 * one command (Law 10, close-out C16, 7 September 2026).
 *
 * WHAT IS RESERVED AND WHAT IS NOT. Applying a migration to production is the
 * founder's, by his ruling of 26 August 2026 (CLAUDE.md, Verification and
 * gates, Migrations), and this script does not touch that: he runs it, he types
 * the production ref to confirm, and he answers the CLI's own prompts (its
 * database password if it asks, its y/N before it applies). What is NOT his is
 * the wrapping, which until now was a five-line runbook: link the CLI to
 * production, read the ref back, list exactly what will be applied, prove the
 * result by observing it, and rest the CLI on TEST again. Law 10 rule 2 says
 * split the step before assigning it, and this is the split.
 *
 * WHY IT MATTERS TODAY. Two merges to main went red on 6 September 2026 because
 * production was behind the tree by the C13 migrations, and the parity check
 * that now guards a push and a merge (scripts/ops/production-parity.mjs) refuses
 * every branch until production carries what the tree needs. The step that
 * unblocks main, production and every waiting pull request is this one.
 *
 * IT REFUSES BEFORE IT ACTS.
 *   - No SUPABASE_ACCESS_TOKEN: it cannot list what production has applied, so
 *     it does not guess. `npm run migrate:production` hands it the CLI's stored
 *     token through scripts/ops/with-supabase-token.ps1, never printing it.
 *   - Nothing pending: it says so and exits 0 without linking or pushing, so
 *     running it twice is safe (idempotent).
 *   - The typed confirmation is not the production ref: nothing is linked,
 *     nothing is pushed.
 *   - The ref read back from supabase/.temp/project-ref after linking is not
 *     production: it stops before pushing.
 *
 * IT PROVES BY OBSERVING, not by trusting the push's own output:
 *   - scripts/ops/verify-production-schema.mjs asks production whether every
 *     column the shipped code names now answers.
 *   - The Management API is asked again and must list zero pending.
 *
 * ALWAYS, in a finally and on Ctrl-C, it links the CLI back to TEST
 * (vkapkibzokmfaxqogypq) and reads the ref back, so the CLI never rests linked
 * to production. A password is never read, never passed, never printed.
 *
 * Usage (PowerShell, from the repo):
 *   npm run migrate:production               # list, confirm, apply, prove, rest on TEST
 *   npm run migrate:production -- --dry-run  # list what is pending and stop
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { computePendingMigrations, fetchAppliedMigrations, MIGRATIONS_DIR, PRODUCTION_PROJECT_REF } from './production-parity.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[apply-production-migrations]'
const NPX_CLI = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')

/** Where the CLI rests when this script is not running: the TEST project. */
export const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'
/** The file the Supabase CLI writes on `link`; reading it back is the only proof of what is linked. */
export const LINKED_REF_FILE = join('supabase', '.temp', 'project-ref')

function say(line) {
  console.log(`${TAG} ${line}`)
}
function fail(line) {
  console.error(`${TAG} ${line}`)
}

/** The project the CLI is linked to right now, read back from disk; null when nothing is linked. */
export function readLinkedRef(root = ROOT) {
  const file = join(root, LINKED_REF_FILE)
  if (!existsSync(file)) return null
  const ref = readFileSync(file, 'utf8').trim()
  return ref.length > 0 ? ref : null
}

/**
 * What the run does, decided before anything is linked or pushed. Pure, so the
 * refusals are tested without a token or a database.
 * @param {{ pending: Array<{ file: string, version: string | null }>, dryRun?: boolean, typed?: string | null, ref?: string }} input
 */
export function decide({ pending, dryRun = false, typed = null, ref = PRODUCTION_PROJECT_REF }) {
  if (!Array.isArray(pending) || pending.length === 0) return { action: 'nothing-pending', pending: [] }
  if (dryRun) return { action: 'dry-run', pending }
  if (typeof typed !== 'string' || typed.trim() !== ref) return { action: 'refused', pending }
  return { action: 'apply', pending }
}

/**
 * The Supabase CLI commands of the apply path, in order. The push is `--linked`
 * and nothing else: no project ref, no password, no connection string on the
 * command line, so the CLI's own prompts and stored credentials are the only
 * way a password ever enters the process. The last command always rests the
 * CLI on TEST.
 */
export function supabaseCommands(ref = PRODUCTION_PROJECT_REF) {
  return [
    { step: 'link', args: ['supabase', 'link', '--project-ref', ref] },
    { step: 'push', args: ['supabase', 'db', 'push', '--linked'] },
    { step: 'rest', args: ['supabase', 'link', '--project-ref', TEST_PROJECT_REF] },
  ]
}

/**
 * The founder types `supabase` at his prompt, so this runs the same binary, the
 * one on PATH, and falls back to npx (the npm package) only when there is none.
 * Decided once per run and printed, so the CLI that applied the migration is
 * named in the output rather than assumed.
 */
let launcher = null
function supabaseLauncher() {
  if (launcher) return launcher
  const probe = spawnSync('supabase', ['--version'], { cwd: ROOT, encoding: 'utf8' })
  if (!probe.error && probe.status === 0) {
    launcher = { file: 'supabase', prefix: [], label: `supabase ${probe.stdout.trim()} on PATH` }
  } else {
    launcher = { file: process.execPath, prefix: [NPX_CLI, 'supabase'], label: 'supabase through npx (none on PATH)' }
  }
  say(`using ${launcher.label}`)
  return launcher
}

/** Run one Supabase CLI command on this terminal (prompts and passwords are the CLI's, not ours). */
function runSupabase(args) {
  const cli = supabaseLauncher()
  const r = spawnSync(cli.file, [...cli.prefix, ...args.slice(1)], { cwd: ROOT, stdio: 'inherit' })
  if (r.error) {
    fail(`could not start ${args.slice(0, 2).join(' ')}: ${r.error.message}`)
    return 1
  }
  return r.status ?? 1
}

/** Link the CLI back to TEST and prove it by reading the ref back. */
function restOnTest() {
  const [, , rest] = supabaseCommands()
  const code = runSupabase(rest.args)
  const ref = readLinkedRef()
  if (code === 0 && ref === TEST_PROJECT_REF) {
    say(`the CLI rests linked to TEST ${ref} (read back from ${LINKED_REF_FILE})`)
    return true
  }
  fail(`the CLI is linked to ${ref ?? '(nothing)'} and NOT to TEST. Run: supabase link --project-ref ${TEST_PROJECT_REF}`)
  return false
}

const isSql = (f) => f.endsWith('.sql')

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    fail('SUPABASE_ACCESS_TOKEN is not set, so what production has applied cannot be listed, and this script does not guess.')
    fail('  Run it as `npm run migrate:production`, which hands it the Supabase CLI\'s stored token through')
    fail('  scripts/ops/with-supabase-token.ps1 without printing it.')
    return 1
  }

  say(`target ${PRODUCTION_PROJECT_REF} (PRODUCTION). The CLI is linked to ${readLinkedRef() ?? '(nothing)'} now.`)
  const listed = await fetchAppliedMigrations(token, PRODUCTION_PROJECT_REF)
  if (!listed.ok) {
    fail(`could not list what production has applied (${listed.reason}). Nothing linked, nothing pushed.`)
    return 1
  }
  const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter(isSql) : []
  const pending = computePendingMigrations(files, listed.applied)
  say(`${files.length} migration(s) in the tree, ${listed.applied.size} applied on production, ${pending.length} pending`)
  for (const p of pending) say(`    ${p.file}`)

  let typed = null
  if (pending.length > 0 && !dryRun) {
    const rl = createInterface({ input: stdin, output: stdout })
    try {
      typed = await rl.question(
        `${TAG} This applies ${pending.length} migration(s) to PRODUCTION, permanently. Type the project ref ${PRODUCTION_PROJECT_REF} to continue, anything else to stop: `,
      )
    } finally {
      rl.close()
    }
  }

  const decision = decide({ pending, dryRun, typed })
  if (decision.action === 'nothing-pending') {
    declareWork('apply-production-migrations', {
      did: { 'migration compared against production': files.length },
      found: { 'migration pending on production': 0 },
      exitOnZero: false,
    })
    say('PASS - production carries every migration in the tree. Nothing to apply, nothing linked, nothing pushed.')
    return 0
  }
  if (decision.action === 'dry-run') {
    say('DRY RUN - listed only. Nothing linked, nothing pushed.')
    return 0
  }
  if (decision.action === 'refused') {
    fail(`REFUSED - the confirmation did not match ${PRODUCTION_PROJECT_REF}. Nothing linked, nothing pushed.`)
    return 1
  }

  const [link, push] = supabaseCommands()
  if (runSupabase(link.args) !== 0) {
    fail('supabase link to production failed. Nothing pushed.')
    return 1
  }
  const linked = readLinkedRef()
  if (linked !== PRODUCTION_PROJECT_REF) {
    fail(`the ref read back from ${LINKED_REF_FILE} is ${linked ?? '(nothing)'}, not ${PRODUCTION_PROJECT_REF}. Nothing pushed.`)
    return 1
  }
  say(`linked to ${linked}, read back from ${LINKED_REF_FILE}. Handing over to the CLI; its prompts are yours.`)

  const pushed = runSupabase(push.args)
  if (pushed !== 0) {
    fail(`supabase db push exited ${pushed}; the CLI's own output above says why. Treat production as UNVERIFIED until the proof below passes.`)
  }

  say('proof 1 of 2: every column the shipped code names, asked of production (scripts/ops/verify-production-schema.mjs)')
  const verify = spawnSync(process.execPath, ['scripts/ops/verify-production-schema.mjs'], { cwd: ROOT, stdio: 'inherit' })
  const verified = verify.status === 0

  say('proof 2 of 2: the Management API listing, which must show zero pending')
  const after = await fetchAppliedMigrations(token, PRODUCTION_PROJECT_REF)
  const stillPending = after.ok ? computePendingMigrations(files, after.applied) : null
  if (stillPending === null) fail(`could not re-list production (${after.reason})`)
  else if (stillPending.length > 0) for (const p of stillPending) fail(`    still pending: ${p.file}`)

  const appliedNow = after.ok ? pending.filter((p) => after.applied.has(p.version)).length : 0
  declareWork('apply-production-migrations', {
    did: { 'migration applied on production': appliedNow },
    found: { 'migration still pending after the push': stillPending ? stillPending.length : pending.length, 'schema object the code names still absent': verified ? 0 : 1 },
    exitOnZero: false,
  })

  if (pushed === 0 && verified && stillPending && stillPending.length === 0) {
    say(`PASS - ${appliedNow} migration(s) applied on ${PRODUCTION_PROJECT_REF} and observed there. Next: the parity step passes, the waiting branch pushes, and a merge redeploys production.`)
    return 0
  }
  fail('FAIL - production is not proven at parity with the tree. Read the two proofs above before doing anything else.')
  return 1
}

const invokedDirectly = process.argv[1] && /apply-production-migrations\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  process.on('SIGINT', () => {
    fail('interrupted; resting the CLI on TEST before exiting')
    restOnTest()
    process.exit(130)
  })
  let code = 1
  try {
    code = await main()
  } finally {
    if (readLinkedRef() !== TEST_PROJECT_REF) restOnTest()
  }
  // exitCode rather than process.exit: on Windows, exiting while a fetch socket
  // is still closing trips a libuv assertion and the code reads 127.
  process.exitCode = code
}
