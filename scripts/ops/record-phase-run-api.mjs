/**
 * A PHASE RUN RECORDED FROM A GITHUB WORKFLOW (the PM's 05:38 of 20 November 2026, item 1): the engine verifier runs on
 * GitHub, not on Vercel, and holds only the Supabase Management API token (SUPABASE_ACCESS_TOKEN), so its run of the
 * timetable's verify phase is written into ops_phase_runs through that API, the same row src/lib/ops/phase-runs.ts writes
 * from a route: its start, end, units, unit, result and whether it failed. So a late GitHub start shows as late on
 * /admin/today rather than hiding. A record that cannot be written is said and never fails the workflow (its work is done);
 * it declares what it did through scripts/lib/work-report.mjs, its zero allowed (a network path: exitOnZero false).
 *
 * Env: SUPABASE_ACCESS_TOKEN; PHASE_KEY, PHASE_RIDE, PHASE_UNIT, PHASE_STARTED (ISO), PHASE_UNITS, PHASE_RESULT,
 * PHASE_FAILED ('true' or 'false'). The production project's reference is the one scripts/verify/engine-verifier.mts reads.
 *
 * Run: node scripts/ops/record-phase-run-api.mjs
 */
import { declareWork } from '../lib/work-report.mjs'

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const env = process.env
const token = env.SUPABASE_ACCESS_TOKEN
const phase = env.PHASE_KEY ?? ''
const ride = env.PHASE_RIDE ?? ''
const unit = env.PHASE_UNIT ?? ''
const started = env.PHASE_STARTED ?? ''
const units = Math.max(0, Math.round(Number(env.PHASE_UNITS ?? '0')) || 0)
const result = (env.PHASE_RESULT ?? '').trim() || 'no result named'
const failed = env.PHASE_FAILED === 'true'

/** A text as a SQL literal: single quotes doubled, nothing else changed. */
export const literal = (text) => `'${String(text).replace(/'/g, "''")}'`

let recorded = 0
let why = ''
if (!token) {
  why = 'SUPABASE_ACCESS_TOKEN is not set'
} else if (!/^[a-z]+$/.test(phase) || !/^[A-Za-z]{3,60}$/.test(ride) || !/^[a-z]{2,30}$/.test(unit) || Number.isNaN(Date.parse(started))) {
  why = `phase '${phase}', ride '${ride}', unit '${unit}', started '${started}' are not a phase run`
} else {
  const query =
    'insert into public.ops_phase_runs (phase, ride, started_at, ended_at, units, unit, result, failed) values (' +
    [literal(phase), literal(ride), `${literal(new Date(started).toISOString())}::timestamptz`, 'now()', String(units), literal(unit), literal(result.slice(0, 1990)), failed ? 'true' : 'false'].join(', ') +
    ')'
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, read_only: false }),
    })
    if (res.ok) recorded = 1
    else why = `HTTP ${res.status}`
  } catch (err) {
    why = err instanceof Error ? err.message : String(err)
  }
}
console.log(`[record-phase-run] ${phase || 'a phase'} by ${ride || 'a ride'}: ${recorded ? 'recorded' : `not recorded (${why})`}`)
declareWork('record-phase-run', {
  did: { 'phase run recorded': recorded },
  found: { 'phase run not recorded': recorded ? 0 : 1 },
  zeroIsFine: { 'phase run recorded': 'a record that cannot be written is said above and never fails the workflow, whose own work is done' },
  exitOnZero: false,
})
