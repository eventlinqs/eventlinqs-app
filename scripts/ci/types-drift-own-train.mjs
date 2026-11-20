// No shebang on this file: a test imports it (see the note at the top of types-drift-guard.mjs).
/**
 * A TRAIN'S OWN TYPES, JUDGED BEFORE ITS PUSH (law 4, one defect is a class; the PM's order of 20 November 2026, after
 * #323's CI went red on one line, public.Functions.events_within_distance.Returns.facts_changed_at).
 *
 * The production types-drift guard (./types-drift-guard.mjs) can only judge a train's migrations once the pipeline has
 * applied them to production, in CI, after the push. This judges them before: the train's migrations are applied to
 * TEST first (as every train does, so its database guards can read them), the types are generated from TEST, and the
 * train's OWN migrations (those this branch adds over its base) are handed to the same analysis as its "pending" set.
 * Every difference they explain, a table's column, a function, or a function that RETURNS SETOF a table they change, is
 * a line src/types/database.ts lacks, and fails, named. Differences no migration of this train explains belong to other
 * branches applied to TEST and are counted, never judged.
 *
 * Applies nothing and writes nothing. It refuses when a train migration is not yet applied to TEST, because then its
 * changes would read as pending rather than as missing lines.
 *
 * Usage: node --env-file=.env.local scripts/ci/types-drift-own-train.mjs [base]   (base defaults to origin/main)
 * Env: SUPABASE_ACCESS_TOKEN (the Management API: one read only query of TEST; and the CLI's gen types).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { analyse, parseMigrationDdl } from './types-drift-analyse.mjs'
import { gitEnv } from '../lib/git-env.mjs'

export const TEST_REF = 'vkapkibzokmfaxqogypq'
const MIGRATIONS_DIR = 'supabase/migrations'
const COMMITTED = 'src/types/database.ts'

/**
 * The decision, pure: given the committed types, the types generated from TEST, the train's own migrations and every
 * other migration (for the SETOF map), which differences are the train's own.
 * @returns {{ own: { delta: { path: string, kind: string }, by: string }[], others: number }}
 */
export function trainOwnDeltas({ committedText, testText, trainMigrations, corpus }) {
  // THE SIDES ARE SWAPPED ON PURPOSE. The analysis was built for production, where the committed types run AHEAD of a
  // database that has not had a migration yet, so a pending ADD COLUMN explains a line the committed file has and the
  // database lacks. Here TEST runs ahead: it has the train's migrations and the committed file may lack their lines.
  // So TEST is handed in as the side that runs ahead, and every difference the train's migrations explain is a line
  // the committed file is missing. (Found by this guard's own drill on 20 November 2026: unswapped, it explained
  // nothing and #323's missed line passed.)
  const r = analyse({ committedText: testText, liveText: committedText, pending: trainMigrations, corpus })
  return { own: r.explained, others: r.unexplained.length }
}

const say = (s) => console.log(`[types-drift-own] ${s}`)

async function main() {
  const base = process.argv[2] || 'origin/main'
  const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`, '--', MIGRATIONS_DIR], { encoding: 'utf8', env: gitEnv() })
    .split(/\r?\n/)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => basename(f))
  if (changed.length === 0) {
    say(`OK: this train adds no migration over ${base}; nothing of its own to judge.`)
    return 0
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    say('REFUSED: SUPABASE_ACCESS_TOKEN is not set; TEST\'s applied migrations cannot be read.')
    return 2
  }
  const train = changed.map((file) => ({ file, version: (file.match(/^(\d+)/) || [])[1] || null, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))
  // ON TEST ALREADY? A train's migrations reach TEST before its push by run-sql-test.sh, which applies them but leaves
  // TEST's ledger to CI, so the ledger cannot say. Each column, function and table the train's DDL creates is looked for
  // on TEST itself (read only); one missing refuses, because its lines would then read as other branches' differences.
  const probes = []
  for (const m of train) {
    for (const d of parseMigrationDdl(m.sql)) {
      if (d.kind === 'add-column') probes.push([`${m.file}: ${d.table}.${d.column}`, `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '${d.table}' and column_name = '${d.column}')`])
      else if (d.kind === 'create-function') probes.push([`${m.file}: ${d.name}()`, `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${d.name}')`])
      else if (d.kind === 'create-table') probes.push([`${m.file}: ${d.name ?? d.table}`, `exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = '${d.name ?? d.table}')`])
    }
  }
  if (probes.length > 0) {
    const query = `select json_build_array(${probes.map(([, q]) => q).join(', ')})::text as out`
    const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, read_only: true }),
    })
    if (!res.ok) {
      say(`REFUSED: TEST could not be read (HTTP ${res.status}).`)
      return 2
    }
    const found = JSON.parse((await res.json())[0].out)
    const missing = probes.filter((_, i) => found[i] !== true).map(([label]) => label)
    if (missing.length > 0) {
      say(`REFUSED: this train's migrations are not all on TEST, so their lines cannot be judged; missing: ${missing.join('; ')}. Apply them to TEST first.`)
      return 2
    }
  }
  const testText = execFileSync('npx', ['--yes', 'supabase', 'gen', 'types', '--lang=typescript', '--project-id', TEST_REF], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const own = new Set(changed)
  const corpus = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !own.has(f))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  const result = trainOwnDeltas({ committedText: readFileSync(COMMITTED, 'utf8'), testText, trainMigrations: train, corpus })
  say(`${changed.length} migration(s) of this train, every one applied to TEST; ${result.others} difference(s) on TEST belong to no migration of this train and are not judged here.`)
  if (result.own.length === 0) {
    say(`OK: ${COMMITTED} holds every line this train's migrations give the types.`)
    return 0
  }
  say(`FAIL: ${result.own.length} line(s) this train's migrations give the types are not in ${COMMITTED}:`)
  for (const e of result.own) say(`  ${e.delta.kind.padEnd(10)} ${e.delta.path}   (from ${e.by})`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // process.exitCode, never process.exit(): exiting at once after a fetch trips libuv's assertion on Windows
  // ('!(handle->flags & UV_HANDLE_CLOSING)', 20 November 2026), which a gate would read as a failure.
  main().then(
    (code) => {
      process.exitCode = code
    },
    (err) => {
      say(`FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
    },
  )
}
