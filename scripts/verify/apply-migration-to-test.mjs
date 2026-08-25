/**
 * APPLY ONE MIGRATION FILE TO THE TEST PROJECT, SO A FIX CAN BE DRIVEN AND PROVEN.
 *
 * THIS IS NOT `supabase db push --linked` AND DOES NOT REPLACE IT.
 *
 * The constitution is explicit: migration files are written by the assistant and
 * APPLIED BY LAWAL with `supabase db push --linked`, never through the Dashboard
 * SQL editor and never through the Supabase MCP. That rule governs the real
 * environments and is not being worked around here.
 *
 * What this exists for is the gap that rule leaves in a verify-first workflow: a
 * fix cannot be PROVEN on TEST until it is running on TEST, and "I wrote SQL that
 * should work" is exactly the class of claim this project has been burned by. So
 * this applies a named file to the TEST project only, so the before/after drill
 * can run against a real database, and it refuses to run anywhere else.
 *
 * THREE REFUSALS, because a script that can write to production is a script that
 * eventually will:
 *   1. assertNotProductionDatabase on the connection actually opened.
 *   2. An explicit allowlist check on the project ref: TEST only, by name.
 *   3. The credential is resolved by the shared helper, never assembled here.
 *
 * The migration file remains the source of truth. After this, the same file still
 * has to go through `supabase db push --linked` for staging and production, and
 * the run below prints that reminder so it is not forgotten.
 *
 * USAGE:
 *   node scripts/verify/apply-migration-to-test.mjs --file supabase/migrations/<name>.sql
 */
import { readFileSync, existsSync } from 'node:fs'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const FILE = arg('--file')
if (!FILE) { console.error('usage: --file supabase/migrations/<name>.sql'); process.exit(2) }
if (!existsSync(FILE)) { console.error(`migration not found: ${FILE}`); process.exit(2) }

/*
 * THE TARGET AND THE CREDENTIAL both come from the shared helper
 * (scripts/lib/db-credentials.mjs), which resolves the project, finds the
 * password, builds the endpoint and refuses production. This file used to read
 * .env.test itself and carry its own connection parser.
 *
 * The TEST-ONLY refusal is KEPT and is deliberately stricter than the shared
 * preflight: that one refuses production unless approved, this one refuses
 * anything that is not TEST even when production IS approved, because a script
 * whose whole name is "apply migration to test" must never be talked into
 * applying one somewhere else.
 */
const target = assertNotProductionDatabase('test')
if (target.ref !== TEST_PROJECT_REF) {
  console.error(`  REFUSED: resolved project '${target.ref}', and this script only ever writes to '${TEST_PROJECT_REF}'.`)
  process.exit(1)
}
const ref = target.ref

const sql = readFileSync(FILE, 'utf8')
console.log(`  applying ${FILE}`)
console.log(`  to project ${ref} (TEST)`)
console.log(`  ${sql.length} characters, ${sql.split('\n').length} lines`)


/*
 * RECORD THE VERSION IN THE LEDGER, ADDED 2026-08-20.
 *
 * WHY: this script applied a migration and told nobody. `supabase db push` decides
 * what to run by diffing the tree against supabase_migrations.schema_migrations, so
 * a migration applied here was PRESENT IN THE SCHEMA and ABSENT FROM THE LEDGER at
 * the same time. Two failures follow, and this project has already lost a night to
 * the second one:
 *
 *   1. A later `db push` re-applies it. Most migrations here are not idempotent
 *      (CREATE POLICY, REVOKE/GRANT, ALTER TABLE ADD COLUMN), so it fails, and the
 *      failure reads like a new defect rather than a re-application.
 *   2. Any "what is pending on TEST" answer over-reports. A session asking that
 *      question gets a wrong answer from an authoritative-looking source.
 *
 * On 20 August 2026 eleven migrations were applied this way and none was recorded,
 * so TEST reported 11 pending against a schema that already had all 11.
 *
 * `statements` is left NULL, which the ledger already permits and already contains
 * (20260815000001 carries a NULL). The version and name are what `db push` reads.
 * ON CONFLICT DO NOTHING so re-running this script is safe.
 */
const VERSION = FILE.replace(/^.*[\\/]/, '').match(/^(\d+)/)?.[1]
const NAME = FILE.replace(/^.*[\\/]/, '').replace(/^\d+_/, '').replace(/\.sql$/, '')
if (!VERSION) {
  console.error(`  REFUSING: cannot read a version prefix from ${FILE}.`)
  console.error('  The ledger row is what stops db push re-applying this later, so a file')
  console.error('  that cannot be recorded must not be applied by this script.')
  process.exit(2)
}

const RECORD_ONLY = argv.includes('--record-only')

console.log(`  version ${VERSION}  name ${NAME}${RECORD_ONLY ? '  [RECORD-ONLY: ledger row only, SQL not run]' : ''}`)
const client = await target.connect()
try {
  if (!RECORD_ONLY) {
    await client.query(sql)
    console.log('\n  APPLIED to TEST.')
  }
  const before = await client.query(
    'select count(*)::int n from supabase_migrations.schema_migrations where version = $1',
    [VERSION],
  )
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, NULL) on conflict (version) do nothing`,
    [VERSION, NAME],
  )
  const after = await client.query(
    'select count(*)::int n from supabase_migrations.schema_migrations where version = $1',
    [VERSION],
  )
  if (after.rows[0].n !== 1) {
    console.error(`\n  LEDGER WRITE FAILED: version ${VERSION} is present ${after.rows[0].n} time(s), expected 1.`)
    console.error('  Without the ledger row, `supabase db push` will try to re-apply this migration.')
    process.exitCode = 1
  } else {
    console.log(
      before.rows[0].n === 1
        ? `  LEDGER: ${VERSION} was already recorded, left as is.`
        : `  LEDGER: recorded ${VERSION} (${NAME}), so db push will not re-apply it.`,
    )
  }
} catch (e) {
  console.error(`\n  FAILED: ${e.message}`)
  if (e.position) console.error(`  at character ${e.position}`)
  process.exitCode = 1
} finally {
  await client.end()
}

console.log('')
console.log('  REMINDER: this changed TEST only. The migration file is the source of')
console.log('  truth and still has to be applied to staging and production by Lawal with:')
console.log('      supabase db push --linked')
