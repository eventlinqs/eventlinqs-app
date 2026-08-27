/**
 * SCHEMA PROVENANCE: does every object on PRODUCTION come from a migration?
 *
 * WHY THIS EXISTS. On 21 August 2026, public.refunds on production carried two
 * columns, stripe_refund_status and stripe_pending_reason, that no migration in
 * this repository created. Not in the tree, not in any commit on any branch, not
 * referenced by any application code. They had been applied by hand. Nothing
 * noticed, and nothing could have: the migration ledger was clean (88 rows, every
 * one matching a file by version and name), the types-drift guard could only say
 * "the types and the database disagree" without being able to say why, and no
 * check anywhere asked the question this one asks.
 *
 * That matters more than the two columns did. Once the migrations stop describing
 * the database, a future migration can collide with something nobody knows is
 * there, and the collision surfaces during a production push.
 *
 * HOW IT ANSWERS THE QUESTION, without reimplementing Postgres.
 *
 * Deriving the expected schema by parsing 97 migration files would be a schema
 * engine with all of a schema engine's bugs, and every bug would be a false
 * accusation. So it does not parse them. It compares production against the TEST
 * project, which is built from the migrations and from nothing else. Anything
 * present on production and absent from TEST was not produced by a migration.
 *
 * THE PRECONDITION THAT MAKES THAT VALID, and it is checked rather than assumed:
 * TEST must have EVERY migration in the tree applied. A TEST that is behind would
 * report every unapplied migration's columns as out-of-band, which is a false
 * accusation of exactly the kind this file must never make. If TEST has any
 * pending migration, this script REFUSES to draw a conclusion and says so.
 *
 * WHAT IT WRITES: nothing. Both sessions are opened with
 * default_transaction_read_only=on, so Postgres itself raises 25006 on any write,
 * and every statement runs inside BEGIN READ ONLY and is ROLLBACKed.
 *
 * USAGE:
 *   node scripts/verify/schema-provenance.mjs
 *   node scripts/verify/schema-provenance.mjs --json
 */
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { openProject } from '../lib/production-write-preflight.mjs'

const JSON_OUT = process.argv.includes('--json')
const MIGRATIONS_DIR = 'supabase/migrations'

/* ------------------------------------------------------------------ pure core */

/**
 * Compare two schema inventories.
 *
 * Exported and pure so it can be drilled without a database: a comparison that
 * has never been seen to report a difference is not a comparison.
 *
 * @param {string[]} live   fully-qualified object keys on the target (production)
 * @param {string[]} built  the same, on the migrations-only reference (TEST)
 * @returns {{outOfBand: string[], pendingOnly: string[]}}
 */
export function compareInventories(live, built) {
  const b = new Set(built)
  const l = new Set(live)
  return {
    // On production, produced by no migration.
    outOfBand: live.filter((k) => !b.has(k)).sort(),
    // In the migrations but not yet on production. Expected; reported for context.
    pendingOnly: built.filter((k) => !l.has(k)).sort(),
  }
}

/* ------------------------------------------------------------------ plumbing */

/*
 * CONNECTIONS come from the shared helper, one per project, never assembled
 * here. This file used to carry its own env-file reader AND its own connection
 * parser AND a hardcoded pooler host, which is three copies of logic that lives
 * once in scripts/lib/db-credentials.mjs. openProject() runs the same
 * production preflight for each target and connects read-only.
 */

/** Every schema object that a migration could have created, as comparable keys. */
async function inventory(client) {
  const q = async (sql) => (await client.query(sql)).rows
  const cols = await q(`
    select c.table_name, c.column_name
    from information_schema.columns c
    join pg_class cl on cl.oid = (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass
    where c.table_schema = 'public' and cl.relkind in ('r','v','m')`)
  const enums = await q(`
    select t.typname, e.enumlabel
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'`)
  const fns = await q(`
    select p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'`)
  const applied = await q('select version from supabase_migrations.schema_migrations')
  return {
    keys: [
      ...cols.map((r) => `column ${r.table_name}.${r.column_name}`),
      ...enums.map((r) => `enum ${r.typname}.${r.enumlabel}`),
      ...fns.map((r) => `function ${r.proname}(${r.args})`),
    ],
    counts: { columns: cols.length, enumValues: enums.length, functions: fns.length },
    applied: new Set(applied.map((r) => r.version)),
  }
}

/* ---------------------------------------------------------------------- main */

/*
 * ONLY RUN WHEN EXECUTED DIRECTLY.
 *
 * compareInventories is exported so it can be drilled without a database, and a
 * test that imports it must not open two database connections and call
 * process.exit. The first version of this file had no guard, and importing it
 * killed the whole test file at collection: "process.exit unexpectedly called
 * with 0", with 0 tests run. That is the vacuous-pass shape this repository
 * keeps being bitten by, and it is the same class as the missing-shebang note at
 * the top of scripts/ci/types-drift-analyse.mjs.
 */
const RUN_DIRECTLY = import.meta.url === pathToFileURL(process.argv[1] || '.').href

if (RUN_DIRECTLY) await main()

async function main() {
if (!JSON_OUT) console.log('[schema-provenance] comparing PRODUCTION against the migrations-only reference (TEST)\n')

const { client: prod, ref: prodRef } = await openProject('prod', { readOnly: true })
const { client: test, ref: testRef } = await openProject('test', { readOnly: true })

let exitCode = 0
try {
  await prod.query('BEGIN READ ONLY')
  await test.query('BEGIN READ ONLY')

  for (const [label, c] of [['production', prod], ['test', test]]) {
    const ro = (await c.query(`select current_setting('transaction_read_only') r`)).rows[0].r
    if (ro !== 'on') {
      console.error(`[schema-provenance] REFUSING: the ${label} session is not read-only.`)
      process.exit(1)
    }
  }

  const [pInv, tInv] = [await inventory(prod), await inventory(test)]

  // THE PRECONDITION. A TEST that is behind cannot be a reference.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const versions = files.map((f) => (f.match(/^(\d+)/) || [])[1]).filter(Boolean)
  const testPending = versions.filter((v) => !tInv.applied.has(v))

  if (!JSON_OUT) {
    console.log(`  production ${prodRef}: ${pInv.counts.columns} column(s), ${pInv.counts.enumValues} enum value(s), ${pInv.counts.functions} function(s)`)
    console.log(`  reference  ${testRef}: ${tInv.counts.columns} column(s), ${tInv.counts.enumValues} enum value(s), ${tInv.counts.functions} function(s)`)
    console.log(`  migrations in tree: ${files.length}; applied to the reference: ${tInv.applied.size}; pending on the reference: ${testPending.length}`)
  }

  if (testPending.length > 0) {
    console.error('\n[schema-provenance] CANNOT CONCLUDE. The reference project is behind the tree:')
    testPending.forEach((v) => console.error(`    not applied to ${testRef}: ${v}`))
    console.error('  Every column those migrations create would be reported as out-of-band, which is')
    console.error('  a false accusation. Apply them to the reference first:')
    console.error('      node scripts/verify/apply-migration-to-test.mjs --file supabase/migrations/<file>.sql')
    exitCode = 1
  } else {
    const { outOfBand, pendingOnly } = compareInventories(pInv.keys, tInv.keys)
    if (JSON_OUT) {
      console.log(JSON.stringify({ prodRef, testRef, outOfBand, pendingOnly }, null, 2))
    } else {
      console.log(`\n  objects on PRODUCTION that no migration produced: ${outOfBand.length}`)
      outOfBand.forEach((k) => console.log(`      ${k}`))
      console.log(`  objects the migrations define that production lacks (pending, expected): ${pendingOnly.length}`)
      pendingOnly.slice(0, 12).forEach((k) => console.log(`      ${k}`))
      if (pendingOnly.length > 12) console.log(`      ... and ${pendingOnly.length - 12} more`)
    }
    if (outOfBand.length > 0) {
      console.error('\n[schema-provenance] FAIL - schema reached production without a migration.')
      console.error('  Write an idempotent migration recording each object so the repository describes')
      console.error('  the database, or have the founder rule on removing it. Do not leave it invisible.')
      exitCode = 1
    } else if (!JSON_OUT) {
      console.log('\n[schema-provenance] PASS - every object on production is produced by a migration.')
    }
  }

  await prod.query('ROLLBACK')
  await test.query('ROLLBACK')
} finally {
  await prod.end().catch(() => {})
  await test.end().catch(() => {})
}
process.exit(exitCode)
}
