/**
 * GUARD: THE GROWTH PLAN IS VALID AND KEEPS EVERY DATED VERSION.
 *
 * WHY: Law 8 (Lawal, 1 November 2026 03:27, C:\dev\CLAUDE.md): growth/plan.json is the single source of the mission,
 * targets, scorecard, daily quotas, city benchmarks and rollout gates, and "it changes only by a new dated version,
 * never by overwriting history". The CONTROLLER's 03:32 (G2) asked for "a guard that fails the build if it is invalid
 * or loses a dated version". The growth desk on /admin/growth and the founder's daily email read this file.
 *
 * CLAUSES
 *   1  growth/plan.json holds what the desk reads: version, set_on, mission, the plan's targets, the founder's stretch,
 *      the ticket estimate, the scorecard, the outreach quota, the open cities and a 14-day benchmark for each.
 *   2  Every version in growth/versions/LEDGER.json is still there, unchanged (hash over LF), rising one after another.
 *   3  growth/plan.json equals the newest recorded version: a change is a new dated version, never an edit in place.
 *
 * The checks live in scripts/lib/growth-plan.mjs, shared with tests/unit/growth/growth-plan-is-versioned.test.ts.
 * Drills: scripts/verify/guard-failure-drills.mjs, 'a kept growth plan version is changed' and 'the growth plan is
 * edited in place'.
 */
import { existsSync, readFileSync } from 'node:fs'
import { checkLedger, planProblems, PLAN } from '../lib/growth-plan.mjs'

const TAG = '[growth-plan-is-versioned]'
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)

const failures = []
const planText = read(PLAN)
if (planText == null) failures.push(`1: ${PLAN} is missing`)
else {
  try { for (const p of planProblems(JSON.parse(planText))) failures.push(`1: ${PLAN}: ${p}`) }
  catch { failures.push(`1: ${PLAN} is not JSON`) }
}
for (const p of checkLedger(read)) failures.push(`2-3: ${p}`)

if (failures.length) {
  console.error(`${TAG} FAILED`)
  for (const f of failures) console.error(`  clause ${f}`)
  process.exit(1)
}
const ledger = JSON.parse(read('growth/versions/LEDGER.json'))
console.log(`${TAG} PASS - growth/plan.json is valid and equals version ${ledger.versions.at(-1).version} of ${ledger.versions.length} kept`)
