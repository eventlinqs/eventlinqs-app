// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number.
// Callers run this as `node scripts/ci/types-drift-guard.mjs` (scripts/check-types-drift.sh delegates here).
/**
 * TYPES-DRIFT GUARD - the runner.
 *
 * Regenerates src/types/database.ts from the target database, then hands the two
 * files to scripts/ci/types-drift-analyse.mjs, which decides between the two
 * conditions the old guard could not tell apart. The reasoning for that split,
 * and why it is a strengthening rather than a relaxation, is documented at the
 * top of that module and is not repeated here.
 *
 * THREE OUTCOMES, not two:
 *
 *   IN SYNC             exit 0. The committed types match the live schema.
 *   MIGRATIONS PENDING  exit 0. Every difference is accounted for by a migration
 *                       file in this repository that has not been applied to the
 *                       target yet. The pending migrations are named.
 *   DRIFT               exit 1. At least one difference is NOT accounted for.
 *
 * READS ONLY. `supabase gen types` introspects; the Management API call is a GET
 * of "List applied migration versions". Nothing here writes to any database, and
 * in particular nothing here applies a migration - applying is the founder's
 * step, by `supabase db push --linked`, per the constitution.
 *
 * Env:
 *   SUPABASE_PROJECT_ID     target project ref (default: the production ref)
 *   SUPABASE_ACCESS_TOKEN   required in CI; locally `npx supabase login` also works
 *                           for gen-types, but the migrations endpoint needs the token
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { analyse, renderVerdict } from './types-drift-analyse.mjs'

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'gndnldyfudbytbboxesk'
const COMMITTED = 'src/types/database.ts'
const MIGRATIONS_DIR = 'supabase/migrations'
const MARKER = '// BEGIN LEGACY ALIASES'

const say = (msg) => console.log(`[types-drift] ${msg}`)
const fail = (msg) => console.error(`[types-drift] ${msg}`)

/* ---------------------------------------------------------------- committed */

if (!existsSync(COMMITTED)) {
  fail(`FAIL: ${COMMITTED} not found (run from repo root)`)
  process.exit(1)
}

const committedRaw = readFileSync(COMMITTED, 'utf8')
if (!committedRaw.includes(MARKER)) {
  fail(`FAIL: '${MARKER}' marker missing from ${COMMITTED}.`)
  fail('The appendix-strip step has nothing to anchor on; either restore the marker or remove this guard.')
  process.exit(1)
}
const committedText = committedRaw.slice(0, committedRaw.indexOf(MARKER))

/* -------------------------------------------------------------------- live */

let liveText
try {
  liveText = execFileSync(
    'npx',
    ['--yes', 'supabase', 'gen', 'types', '--lang=typescript', '--project-id', PROJECT_ID],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
  )
} catch (err) {
  fail("FAIL: 'supabase gen types' could not reach the live DB.")
  fail('In CI: ensure repository secret SUPABASE_ACCESS_TOKEN is set.')
  fail("Locally: run 'npx supabase login' once.")
  fail('--- gen-types stderr ---')
  fail(String(err.stderr || err.message).split('\n').slice(0, 20).join('\n'))
  process.exit(1)
}

/* ---------------------------------------------------- first pass: any delta? */

const dry = analyse({ committedText, liveText, pending: [] })

if (dry.status === 'in-sync') {
  say(`OK: ${COMMITTED} generated section matches the live schema of ${PROJECT_ID}.`)
  process.exit(0)
}

/*
 * There ARE differences. Only now is the applied-migration list needed, so the
 * healthy path never depends on a second network call. If that call cannot be
 * made, this FAILS rather than falling back to treating every repository
 * migration as pending: that fallback would let a long-applied migration launder
 * a genuine staleness, which is precisely what this guard must not do.
 */
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  fail(`FAIL: ${COMMITTED} differs from the live schema, and SUPABASE_ACCESS_TOKEN is not set.`)
  fail('The token is needed to list which migrations the target has already applied,')
  fail('which is the only way to tell PENDING MIGRATIONS apart from STALE TYPES.')
  fail('Without it this guard will not guess, so it reports the difference as unclassified.')
  process.exit(1)
}

let appliedVersions
try {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/migrations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    fail(`FAIL: could not list applied migrations (HTTP ${res.status}).`)
    fail(`GET https://api.supabase.com/v1/projects/${PROJECT_ID}/database/migrations`)
    if (res.status === 401 || res.status === 403) {
      fail('The token is PRESENT but REJECTED: it has expired or lacks access to this project.')
    }
    process.exit(1)
  }
  const body = await res.json()
  appliedVersions = new Set((Array.isArray(body) ? body : []).map((m) => String(m.version)))
} catch (err) {
  fail(`FAIL: could not reach the Supabase Management API: ${err.message}`)
  process.exit(1)
}

/* ------------------------------------------------------- pending migrations */

const repoMigrations = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  : []

const pending = repoMigrations
  .map((file) => ({ file, version: (file.match(/^(\d+)/) || [])[1] || null }))
  .filter((m) => m.version && !appliedVersions.has(m.version))
  .map((m) => ({ ...m, sql: readFileSync(join(MIGRATIONS_DIR, m.file), 'utf8') }))

say(`${repoMigrations.length} migration(s) in the repository, ${appliedVersions.size} applied to ${PROJECT_ID}, ${pending.length} pending.`)

/* ------------------------------------------------------------------ verdict */

const result = analyse({ committedText, liveText, pending })

const { lines, exitCode } = renderVerdict(result, {
  committedPath: COMMITTED,
  projectId: PROJECT_ID,
  migrationsDir: MIGRATIONS_DIR,
  marker: MARKER,
})

for (const line of lines) {
  if (exitCode === 0) console.log(line)
  else console.error(line)
}
process.exit(exitCode)
