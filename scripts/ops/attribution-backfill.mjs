/**
 * GA3 STEP 10. ONE ATTRIBUTION RECORD FOR EVERY ORDER, INCLUDING THE OLD ONES.
 *
 * WHY A BACKFILL AND NOT A GOING-FORWARD RULE. GA3's invariant is one record
 * per order, never zero and never two, ACROSS THE WHOLE TABLE. An invariant
 * that is only true for orders placed after a deploy is one somebody will one
 * day quote wrongly: "we have 1,412 attributions and 4,000 orders" reads as a
 * broken system rather than as a system that started counting in September.
 * Orders that predate the spine resolve to none, with the reason recorded, and
 * the count of them is printed rather than hidden.
 *
 * IT IS IDEMPOTENT AND SAFE TO RE-RUN. By default it writes only the orders
 * that have no record. `--all` re-resolves every order, which is what to run
 * after the model version changes, and it UPDATES rather than duplicating
 * because `order_id` is the primary key.
 *
 * IT REFUSES PRODUCTION. Nothing on production Supabase is written by any lane
 * without the founder's own approval, and the preflight this repository already
 * uses is what refuses it, rather than a comment asking nicely.
 *
 * USAGE
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *     scripts/ops/attribution-backfill.mjs [--all] [--json <path>]
 *
 * BOTH `--import` FLAGS ARE REQUIRED and the first one used to be missing here,
 * which meant the command as documented had never run. `store.ts` opens with
 * `import 'server-only'`, and `server-only` is not a package in this tree: it is
 * an alias Next resolves inside its own bundler. Without the shim Node stops at
 * ERR_MODULE_NOT_FOUND before a single order is read, and the failure names a
 * missing package rather than a missing flag. A remedy nobody can run is not a
 * remedy, so the fix is the flag and not a note asking the reader to know.
 */
import { writeFileSync } from 'node:fs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

const argv = process.argv.slice(2)
const ALL = argv.includes('--all')
const jsonAt = argv.indexOf('--json')
const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null

assertNotProduction()

const { backfillAttributions } = await import('../../src/lib/attribution/store.ts')

const started = Date.now()
const result = await backfillAttributions({ onlyMissing: !ALL })
const elapsedMs = Date.now() - started

const report = { ...result, mode: ALL ? 'all' : 'only-missing', elapsedMs, ranAt: new Date().toISOString() }

console.log('ATTRIBUTION BACKFILL')
console.log(`  orders on the platform       ${result.ordersConsidered}`)
console.log(`  records written this run     ${result.written}`)
console.log(`  attributed                   ${result.attributed}`)
console.log(`  none, with a reason          ${result.none}`)
console.log(`  by rung                      ${JSON.stringify(result.byRung)}`)
console.log(`  took                         ${elapsedMs}ms`)

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  console.log(`  written to                   ${jsonPath}`)
}
