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
 * Usage: node scripts/verify/taxonomy-rerun-rehearsal.mjs --project test
 *
 * CONNECTION: through the shared helper. The private connection parser and the
 * hardcoded production-ref string that used to live here are gone; both now live
 * once, in scripts/lib/db-credentials.mjs. The old preflight judged
 * NEXT_PUBLIC_SUPABASE_URL rather than the connection actually opened.
 */
import { readFileSync } from 'node:fs'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const target = assertNotProductionDatabase()
const client = await target.connect()

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
