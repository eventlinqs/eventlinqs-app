/**
 * REHEARSE runbook section 5 against TEST: re-run both taxonomy migrations.
 *
 * WHY RE-RUNNING PROVES THE RIGHT THING. TEST already has both applied, so a
 * second run exercises exactly the situation production meets: the second
 * migration executes against a database where the first has already done the
 * work. Every statement in both files is guarded (WHERE NOT EXISTS / WHERE
 * slug = ...), and the claim is that they are therefore idempotent. This runs
 * them and reports the rows affected per statement, so the claim is measured
 * rather than asserted.
 *
 * Rolled back at the end. On an idempotent pair the rollback is academic, which
 * is itself part of what this proves: if anything DID change, the counts move
 * and TEST is still left alone.
 *
 * Usage: node --env-file=.env.test scripts/verify/taxonomy-rerun-rehearsal.mjs
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const conn = process.env.SUPABASE_DB_URL
if (!conn || /gndnldyfudbytbboxesk/.test(conn)) {
  console.error('REFUSING: missing or production connection string.')
  process.exit(1)
}

function parseConn(raw) {
  const [, rest] = raw.trim().replace(/^"|"$/g, '').split('://')
  const at = rest.lastIndexOf('@')
  const creds = rest.slice(0, at)
  const sep = creds.indexOf(':')
  const [hostPort, database] = rest.slice(at + 1).split('/')
  const [host, port] = hostPort.split(':')
  return {
    user: creds.slice(0, sep),
    password: creds.slice(sep + 1),
    host,
    port: Number(port ?? 5432),
    database: (database ?? 'postgres').split('?')[0],
  }
}

const client = new pg.Client({ ...parseConn(conn), ssl: { rejectUnauthorized: false } })
await client.connect()

const FILES = [
  'supabase/migrations/20260808000004_category_taxonomy_r1.sql',
  'supabase/migrations/20260812000002_category_taxonomy_repair.sql',
]

async function categories(tag) {
  const { rows } = await client.query(
    "select slug, name from public.event_categories where slug in ('arts-culture','arts-community','comedy') order by slug",
  )
  const banned = await client.query(
    "select count(*)::int as n from public.event_categories where name ilike '%cultur%'",
  )
  console.log(`\n--- categories ${tag} ---`)
  for (const r of rows) console.log(`   ${r.slug.padEnd(18)} ${r.name}`)
  console.log(`   rows with the banned word: ${banned.rows[0].n}`)
  return rows.map((r) => `${r.slug}=${r.name}`).join('|') + `#${banned.rows[0].n}`
}

const before = await categories('BEFORE')

await client.query('begin')
try {
  for (const file of FILES) {
    const sql = readFileSync(file, 'utf8')
    // Strip the outer transaction control: this rehearsal owns the transaction,
    // and a nested begin/commit would end it early and defeat the rollback.
    const body = sql
      .split('\n')
      .filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l))
      .join('\n')

    console.log(`\n===== ${file.split('/').pop()} =====`)
    // Split on statement boundaries so rows-affected can be reported per
    // statement rather than for the file as a whole.
    const statements = body
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter((s) => s.length > 0)

    for (const [i, stmt] of statements.entries()) {
      const res = await client.query(stmt)
      const head = stmt.replace(/\s+/g, ' ').slice(0, 68)
      console.log(`   [${i + 1}] ${res.command ?? 'STMT'} rows=${res.rowCount ?? 0}  ${head}`)
    }
  }

  const after = await categories('AFTER the re-run, inside the transaction')
  console.log(`\nIDEMPOTENT: ${before === after ? 'YES, state is byte-identical' : 'NO, THE STATE CHANGED'}`)
} finally {
  await client.query('rollback')
  console.log('\n=== rolled back ===')
}

await categories('AFTER rollback')
await client.end()
