/**
 * GUARD: THE COMMITTED TYPES CARRY EVERY OBJECT THE MIGRATIONS CREATE.
 *
 * WHY THIS EXISTS, 11 September 2026. Five migrations were committed over two
 * days without regenerating src/types/database.ts, and every gate stayed green:
 * the types-drift guard compares the committed file with production, production
 * had not been given those migrations yet, so the two were stale in the same
 * way and it reported IN SYNC twenty-six times in a row. Typecheck was clean
 * because supabase-js types an unknown table name as `any`. The first push after
 * the founder applied the migrations was refused with 285 unexplained
 * differences, all of them objects this repository's own migration files had
 * created. The full account is at the top of scripts/guards/lib/types-coverage.mjs.
 *
 * WHAT IT DOES. Replays the migrations in order to learn which public tables,
 * views, enums, callable functions and added columns exist NOW, and demands
 * each one from the generated section of src/types/database.ts. It reads the
 * repository and nothing else, so it runs on the Vercel build host, in CI and in
 * the pre-push gate alike, and it fails the commit that forgets to regenerate
 * rather than the push two days later.
 *
 * WHAT IT DOES NOT DO. It does not read a database and it does not judge a
 * column's type: presence, not shape. Shape is the types-drift guard's job
 * against a live schema, and the two together close both halves. Objects it
 * cannot judge (another schema, a runtime-built name) are printed as SKIPPED
 * by name rather than passed silently.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs: a table, an enum and a
 * column added to the newest migration and never regenerated, each named.
 * Proven red on 11 September 2026 against the committed types of 4d0fda21
 * (C:\dev\EVIDENCE\TYPES-DRIFT-2026-09-11\guard-red.txt) and green against
 * the regenerated file (guard-green.txt).
 *
 * Run: node scripts/guards/types-cover-migrations.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { parseGeneratedTypes } from '../ci/types-drift-analyse.mjs'
import { describeFault, judgeTypesCoverage, migrationSchemaObjects, REGENERATE_INSTRUCTION } from './lib/types-coverage.mjs'

const ROOT = process.cwd()
const TAG = '[types-cover-migrations]'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TYPES = join(ROOT, 'src', 'types', 'database.ts')
const MARKER = '// BEGIN LEGACY ALIASES'

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))

const committed = readFileSync(TYPES, 'utf8')
if (!committed.includes(MARKER)) {
  console.error(`${TAG} FAIL: ${MARKER} marker missing from src/types/database.ts; the generated section cannot be told from the appendix`)
  process.exit(1)
}
const leaves = parseGeneratedTypes(committed.slice(0, committed.indexOf(MARKER)))

const objects = migrationSchemaObjects(files)
const { faults, judged, skipped } = judgeTypesCoverage(objects, leaves)
const judgedTotal = Object.values(judged).reduce((a, b) => a + b, 0)

declareWork('types-cover-migrations', {
  did: {
    'migration read': files.length,
    'schema object judged': judgedTotal,
    'type path parsed': leaves.size,
  },
  found: { 'migration object missing from the committed types': faults.length },
})

console.log(
  `${TAG} judged ${judged.table} table(s), ${judged.view} view(s), ${judged.enum} enum(s), ` +
    `${judged.function} function(s), ${judged.column} added column(s) against ${leaves.size} type leaves`,
)
for (const s of skipped) console.log(`${TAG} SKIPPED ${s}`)

if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${describeFault(f)}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  for (const line of REGENERATE_INSTRUCTION.split(String.fromCharCode(10))) console.error(`${TAG} ${line}`)
  process.exitCode = 1
} else {
  console.log(`${TAG} PASS - the committed types carry every object the ${files.length} migrations create.`)
}
