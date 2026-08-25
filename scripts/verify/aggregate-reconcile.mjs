/**
 * EVERY STORED FIGURE, RECOUNTED FROM THE ROWS IT CLAIMS TO SUMMARISE.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * FOUNDER RULING, 25 August 2026:
 *
 *   "A recurring reconciliation that compares every stored figure against a live
 *    recount and reports disagreement. Nine of nine organisations disagree with
 *    their own rows today; I want that number visible, not discovered."
 *
 * A guard stops a NEW unmaintained figure being added. A drive proves a figure
 * follows or does not. Neither tells you how far the LIVE data has already
 * moved, and that is the number that matters when somebody is about to lodge a
 * BAS or read a payout.
 *
 * ============================================================================
 * WHAT IT READS, AND WHAT IT WILL NOT DO
 * ============================================================================
 *
 * The registry is scripts/lib/stored-aggregates.mjs: one entry per column,
 * carrying what maintains it and what was ruled about it. The RECOUNT itself is
 * the view public.stored_aggregate_drift, which this script and the daily cron
 * both read, so a figure cannot be reconciled here against a definition that has
 * drifted from the one the cron uses. This script carries no copy of any query.
 *
 * It checks the COVERAGE both ways, from the view's own definition rather than
 * from its rows: a registry entry marked reconciled with no branch in the view,
 * and a branch in the view with no registry entry, are both reported as errors.
 * A column nobody recounts reports no drift, which is the failure that reads as
 * success.
 *
 * IT IS READ ONLY, and enforced as read only by the server rather than by this
 * file's good intentions: `openProject(alias, { readOnly: true })` opens the
 * session with `default_transaction_read_only=on`, so Postgres itself raises
 * 25006 on any write. It reports; it never repairs. A reconciliation that
 * silently corrected the number would destroy the evidence of how it got wrong.
 *
 * INCLUDING THE FIGURES THE FOUNDER ACCEPTED AS THEY ARE. ticket_tiers.sold_count
 * and discount_codes.current_uses are deliberately left unfixed, and are
 * deliberately reconciled here, because "unfixed" and "invisible" are different
 * things and only the second one is dangerous.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   node --env-file=.env.test scripts/verify/aggregate-reconcile.mjs
 *   node scripts/verify/aggregate-reconcile.mjs --project prod   (read only)
 *   node scripts/verify/aggregate-reconcile.mjs --json out.json
 *   node scripts/verify/aggregate-reconcile.mjs --fail-on-drift  (for a cron)
 *
 * EXIT CODES
 *   0  reconciled, or drift found and --fail-on-drift not given (the default:
 *      this is a REPORT, and a report that fails a build nobody asked it to
 *      gate is a report people turn off)
 *   1  drift found AND --fail-on-drift
 *   2  it could not run, which is NOT the same as clean and never reads as it
 */
import { openProject } from '../lib/production-write-preflight.mjs'
import { STORED_AGGREGATES, RECONCILABLE } from '../lib/stored-aggregates.mjs'

/**
 * THE RECOUNT LIVES IN THE DATABASE, ONCE.
 *
 * `public.stored_aggregate_drift` (migration 20260825000004) emits one row per
 * (column, entity) with the stored value beside a live recount. This script and
 * the daily `/api/cron/aggregate-reconcile` both read it, so a figure cannot be
 * reconciled here against a definition that has drifted from the one the cron
 * uses. Two callers on two transports, one definition.
 *
 * The prose beside each column, what maintains it and what was ruled about it,
 * comes from the registry, which is where a human reads it.
 */
const DRIFT_VIEW = 'public.stored_aggregate_drift'

const args = process.argv.slice(2)
const flag = n => args.includes(`--${n}`)
const val = n => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? null : args[i + 1]
}

const ALIAS = val('project') ?? 'test'
const FAIL_ON_DRIFT = flag('fail-on-drift')
const JSON_OUT = val('json')
/** Rows printed per column before the rest are summarised. */
const SHOW = Number(val('show') ?? 8)

async function main() {
  console.log('[reconcile] the stored-figure contract, checked against live rows.')
  console.log(`[reconcile] registry: scripts/lib/stored-aggregates.mjs, ${STORED_AGGREGATES.length} column(s)`)
  console.log('')
  console.log('[reconcile] VERDICT PER COLUMN, from the registry:')
  for (const a of STORED_AGGREGATES) {
    console.log(`[reconcile]   ${a.maintenance.toUpperCase().padEnd(13)} ${a.column.padEnd(38)} ${a.summarises ?? '(summarises no rows)'}`)
  }
  const notReconcilable = STORED_AGGREGATES.filter(a => !a.reconciled)
  console.log('')
  console.log(`[reconcile] ${RECONCILABLE.length} of ${STORED_AGGREGATES.length} can be recounted. The other ${notReconcilable.length} cannot, and why:`)
  for (const a of notReconcilable) {
    console.log(`[reconcile]   ${a.column}`)
    console.log(`[reconcile]       ${a.caveat ?? a.decision ?? 'no source rows to count.'}`)
  }

  const { client, ref } = await openProject(ALIAS, { readOnly: true })
  console.log('')
  console.log(`[reconcile] reading ${ref}, session is default_transaction_read_only=on`)

  let rows
  try {
    rows = (await client.query(`select column_name, key, stored, truth from ${DRIFT_VIEW}`)).rows
  } catch (err) {
    // A recount that cannot RUN is not a set of columns that agree. Exiting 2
    // rather than 0 is the whole difference between this and a report that reads
    // clean because it measured nothing.
    console.error(`[reconcile] could not read ${DRIFT_VIEW}: ${err.message}`)
    console.error('[reconcile] migration 20260825000004 may not be applied to this project.')
    await client.end()
    process.exit(2)
  }

  /*
   * COVERAGE IS READ FROM THE VIEW'S DEFINITION, NOT FROM ITS ROWS.
   *
   * The first version asked "did any row come back for this column?" and
   * reported ERROR for `event_addons.sold_count` and
   * `discount_codes.current_uses`, both of which are simply EMPTY TABLES on
   * TEST. An empty table is not a missing branch, and a check that cannot tell
   * them apart cries wolf on a clean database, which is how a report gets
   * ignored.
   *
   * The definition is the honest source: a branch either exists in the SQL or it
   * does not, whatever the data happens to hold today.
   */
  let viewDef = ''
  try {
    viewDef = (await client.query(`select pg_get_viewdef('${DRIFT_VIEW}'::regclass, true) as def`)).rows[0].def
  } catch (err) {
    console.error(`[reconcile] could not read the definition of ${DRIFT_VIEW}: ${err.message}`)
    await client.end()
    process.exit(2)
  }
  const coveredByView = new Set(
    [...viewDef.matchAll(/'([a-z_]+\.[a-z_]+)'::text AS column_name/g)].map(m => m[1]),
  )

  const byColumn = new Map()
  for (const r of rows) {
    if (!byColumn.has(r.column_name)) byColumn.set(r.column_name, [])
    byColumn.get(r.column_name).push(r)
  }

  const results = []
  for (const agg of RECONCILABLE) {
    if (!coveredByView.has(agg.column)) {
      /*
       * The registry says this column is reconciled and the view carries no
       * branch for it. Two sources disagreeing about what is COVERED is the same
       * class of defect as two sources disagreeing about a value, and it is the
       * one that reads as success: a column nobody recounts reports no drift.
       */
      results.push({
        column: agg.column,
        error: `${DRIFT_VIEW} carries no branch for it, while the registry says reconciled: true`,
        checked: 0,
        disagreeing: 0,
      })
      continue
    }
    const forColumn = byColumn.get(agg.column) ?? []
    const disagreeing = forColumn.filter(r => String(r.stored) !== String(r.truth))
    results.push({
      column: agg.column,
      checked: forColumn.length,
      disagreeing: disagreeing.length,
      caveat: agg.caveat ?? null,
      decision: agg.decision ?? null,
      sample: disagreeing.slice(0, SHOW).map(r => ({ key: r.key, stored: r.stored, truth: r.truth })),
    })
  }

  // The same disagreement the other way round: a branch in the view that the
  // registry has no reconciled entry for. Just as much a defect, because the
  // registry is what a human reads.
  for (const name of coveredByView) {
    if (!RECONCILABLE.some(a => a.column === name)) {
      results.push({
        column: name,
        error: `${DRIFT_VIEW} recounts it and scripts/lib/stored-aggregates.mjs has no reconciled entry for it`,
        checked: 0,
        disagreeing: 0,
      })
    }
  }

  await client.end()

  console.log('')
  console.log('[reconcile] RECOUNT')
  console.log(
    '  ' + 'column'.padEnd(38) + 'rows'.padStart(8) + 'disagree'.padStart(10) + '  ',
  )
  for (const r of results) {
    const marker = r.error ? 'ERROR' : r.disagreeing > 0 ? 'DRIFT' : 'agrees'
    console.log(
      '  ' + r.column.padEnd(38) + String(r.checked).padStart(8) + String(r.disagreeing).padStart(10) + '  ' + marker,
    )
  }

  for (const r of results) {
    if (!r.disagreeing) continue
    console.log('')
    console.log(`[reconcile] ${r.column}: ${r.disagreeing} of ${r.checked} disagree`)
    if (r.caveat) console.log(`[reconcile]   CAVEAT: ${r.caveat}`)
    if (r.decision) console.log(`[reconcile]   DECISION: ${r.decision}`)
    for (const s of r.sample) {
      console.log(`[reconcile]     ${s.key}  stored ${s.stored}  truth ${s.truth}`)
    }
    if (r.disagreeing > r.sample.length) {
      console.log(`[reconcile]     ... and ${r.disagreeing - r.sample.length} more`)
    }
  }

  const errored = results.filter(r => r.error)
  const drifting = results.filter(r => r.disagreeing > 0)
  const totalRows = results.reduce((s, r) => s + r.checked, 0)
  const totalDrift = results.reduce((s, r) => s + r.disagreeing, 0)

  console.log('')
  console.log(`[reconcile] ${results.length} column(s) recounted, ${totalRows} row(s) compared.`)
  console.log(`[reconcile] ${totalDrift} row(s) disagree, across ${drifting.length} column(s).`)
  if (errored.length) console.log(`[reconcile] ${errored.length} column(s) could NOT be recounted; that is not agreement.`)

  if (JSON_OUT) {
    const fs = await import('node:fs')
    fs.writeFileSync(JSON_OUT, JSON.stringify({ ref, results, totalRows, totalDrift }, null, 2))
    console.log(`[reconcile] wrote ${JSON_OUT}`)
  }

  if (errored.length) process.exit(2)
  if (totalDrift > 0 && FAIL_ON_DRIFT) {
    console.log('[reconcile] --fail-on-drift was given, so this exits non-zero.')
    process.exit(1)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('[reconcile] fatal:', err?.message ?? err)
  process.exit(2)
})
