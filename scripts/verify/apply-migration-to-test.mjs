/**
 * Apply ONE migration file to the TEST database, and record it in the Supabase
 * migration ledger so the CLI does not try to apply it a second time.
 *
 * WHY THIS EXISTS RATHER THAN `supabase db push --linked`. The CLI is installed
 * but this worktree is not linked to a project, and linking it would point a
 * push-capable tool at whatever ref the link names. This script cannot do that:
 * it goes through `assertNotProductionDatabase()`, which judges the connection
 * string it is actually about to open rather than a different variable, so a
 * production target is refused before a statement runs.
 *
 * IT IS NOT A REPLACEMENT FOR THE PRODUCTION PROCEDURE. CLAUDE.md reserves
 * production migrations to the founder with `supabase db push --linked`, and
 * that is unchanged. This is the TEST-only path the founder ruling of 15 August
 * 2026 asked for ("Migration against TEST only").
 *
 * The whole file runs in ONE transaction. A migration that fails half way
 * leaves nothing behind.
 *
 * Usage:
 *   node --env-file=.env.test scripts/verify/apply-migration-to-test.mjs <version>
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const version = process.argv[2]
if (!version) {
  console.error('usage: apply-migration-to-test.mjs <migration version, e.g. 20260815000001>')
  process.exit(1)
}

const dir = path.join(process.cwd(), 'supabase', 'migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith(version) && f.endsWith('.sql'))
if (!file) {
  console.error(`no migration in supabase/migrations starting with ${version}`)
  process.exit(1)
}
const sql = fs.readFileSync(path.join(dir, file), 'utf8')

const target = assertNotProductionDatabase()
const db = new pg.Client(target.clientConfig)
await db.connect()

console.log(`\n[apply] ${file}`)
console.log(`[apply] target: ${target.ref}`)

let ok = true
try {
  await db.query('begin')
  await db.query(sql)

  // The ledger the Supabase CLI reads. Without this row `db push` would try to
  // apply the same file again against a database that already has it.
  await db.query(`create schema if not exists supabase_migrations`)
  await db.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    )`)
  await db.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)
     on conflict (version) do nothing`,
    [version, file.replace(/^\d+_/, '').replace(/\.sql$/, '')],
  )

  await db.query('commit')
  console.log('[apply] COMMITTED')
} catch (err) {
  ok = false
  await db.query('rollback')
  console.error(`[apply] FAILED, rolled back: ${err.message}`)
}

if (ok) {
  // Verify from the live catalogue rather than from the fact the statement ran.
  const cols = await db.query(`
    select table_name, column_name, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'share_links' and column_name in ('destination_url','draft_code','event_id'))
         or (table_name = 'events' and column_name = 'external_ticket_url'))
     order by table_name, column_name`)
  console.log('\n[verify] columns now present:')
  for (const r of cols.rows) {
    console.log(`   ${r.table_name}.${r.column_name}  nullable=${r.is_nullable}`)
  }
  const cons = await db.query(`
    select conname from pg_constraint
     where conname in (
       'share_links_target_exactly_one',
       'share_links_destination_https_only',
       'share_links_draft_code_requires_destination',
       'events_external_ticket_url_https_only')
     order by conname`)
  console.log('[verify] constraints now present:')
  for (const r of cons.rows) console.log(`   ${r.conname}`)
}

await db.end()
process.exit(ok ? 0 : 1)
