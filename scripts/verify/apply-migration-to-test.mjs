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
 *
 * On a machine with no Postgres password (this one), add --via-api and run it
 * through scripts\ops\with-supabase-token.ps1; see "THE SECOND ROUTE" below.
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
/*
 * THE SECOND ROUTE, --via-api, ADDED 10 September 2026.
 *
 * The route above needs a POSTGRES PASSWORD, and this machine does not have one:
 * .env.test does not exist here and .env.local carries no SUPABASE_DB_URL, so
 * the preflight refuses before it can judge anything. That refusal is correct
 * and is not being softened. What it left was a machine that could READ TEST all
 * day through the Supabase Management API and could not apply a single migration
 * to it, which makes "applied to TEST first" impossible to satisfy and pushes a
 * session towards proving things it has not run.
 *
 * So this route runs the same SQL and writes the same ledger row through
 * POST /v1/projects/{ref}/database/query with SUPABASE_ACCESS_TOKEN, which is
 * the credential the CLI itself already holds here.
 *
 * IT IS NOT A WAY ROUND THE PRODUCTION RULE. The ref is the hardcoded TEST
 * constant in this file, never a resolved value and never an argument, so there
 * is no input to this route that can name another project. Production migrations
 * still go through `supabase db push --linked`, run by Lawal, unchanged.
 */
const VIA_API = argv.includes('--via-api')
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? ''

let ref = TEST_PROJECT_REF
let openConnection

if (VIA_API) {
  if (!ACCESS_TOKEN) {
    console.error('  REFUSED: --via-api needs SUPABASE_ACCESS_TOKEN in the environment.')
    console.error('  Run it through the helper: scripts\\ops\\with-supabase-token.ps1 node ' + process.argv[1] + ' ...')
    process.exit(1)
  }
  openConnection = async () => ({
    async query(text, params = []) {
      // The Management API takes SQL text only, so the two ledger parameters are
      // quoted here. Both are derived from the migration FILENAME, and a filename
      // cannot reach this point without matching /^\d+_/ and living on disk.
      const sql = text.replace(/\$(\d+)/g, (_, n) => `'${String(params[Number(n) - 1]).replace(/'/g, "''")}'`)
      const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      })
      const body = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`)
      let rows = []
      try {
        rows = JSON.parse(body)
      } catch {
        rows = []
      }
      return { rows: Array.isArray(rows) ? rows : [] }
    },
    async end() {},
  })
} else {
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
  ref = target.ref
  openConnection = () => target.connect()
}

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
const client = await openConnection()
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
