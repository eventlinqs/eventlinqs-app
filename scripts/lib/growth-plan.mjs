/**
 * THE GROWTH PLAN'S TWO CHECKS, shared by scripts/guards/growth-plan-is-versioned.mjs and its test.
 *
 * Law 8 (Lawal, 1 November 2026 03:27, C:\dev\CLAUDE.md): growth/plan.json is the single source of the mission,
 * targets, scorecard, daily quotas, city benchmarks and rollout gates, and "it changes only by a new dated version,
 * never by overwriting history". So: (1) the plan must hold what the desk and the founder email read; (2) every dated
 * version in growth/versions/LEDGER.json must still be there unchanged, and the plan must equal the newest one.
 *
 * Pure: the file reader is passed in, so a test can hand it a broken copy. Hashes are taken over the text with CRLF
 * read as LF, because this repository checks files out with either ending.
 */
import { createHash } from 'node:crypto'

export const PLAN = 'growth/plan.json'
export const LEDGER = 'growth/versions/LEDGER.json'

export function sha256Lf(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex')
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** What is wrong with a plan object, as sentences; an empty list means it holds what the desk reads. */
export function planProblems(p) {
  const out = []
  if (!p || typeof p !== 'object') return ['the plan is not an object']
  if (!Number.isInteger(p.version) || p.version < 1) out.push('version is not a whole number from 1')
  if (!isDay(p.set_on)) out.push('set_on is not a YYYY-MM-DD date')
  if (typeof p.mission !== 'string' || !p.mission.trim()) out.push('mission is missing')
  const plan = p.targets?.plan
  if (!Array.isArray(plan) || plan.length === 0) out.push('targets.plan is missing')
  else plan.forEach((t, i) => {
    if (!/^\d{4}-\d{2}$/.test(String(t?.year_to))) out.push(`targets.plan[${i}].year_to is not YYYY-MM`)
    for (const k of ['O', 'T', 'paid_tickets', 'revenue_aud']) if (!isNum(t?.[k])) out.push(`targets.plan[${i}].${k} is not a number`)
  })
  if (!isNum(p.targets?.founder_stretch?.revenue_aud_2029_10)) out.push('targets.founder_stretch.revenue_aud_2029_10 is not a number')
  if (!isNum(p.model?.N_aud_estimate)) out.push('model.N_aud_estimate is not a number')
  if (!Array.isArray(p.scorecard_weekly) || p.scorecard_weekly.length === 0) out.push('scorecard_weekly is missing')
  if (!isNum(p.daily_quotas?.outreach_messages)) out.push('daily_quotas.outreach_messages is not a number')
  const open = p.cities?.open
  const bench = p.cities?.pilot_benchmark_checked_events_14_days ?? {}
  if (!Array.isArray(open) || open.length === 0) out.push('cities.open is missing')
  else for (const c of open) if (!isNum(bench[c])) out.push(`no 14-day benchmark for the open city ${c}`)
  if (Number.isInteger(p.version) && p.version >= 2) out.push(...ticketingGapProblems(p.close_the_ticketing_gap))
  return out
}

/** The daily conversion asks as the plan states them, '5 of the 20 daily outreach messages are conversion asks ...';
 *  src/lib/growth/desk-math.ts reads the count with the same pattern, so the guard refuses any other wording. */
export const CONVERSION_ASKS = /^(\d+) of the (\d+) daily outreach messages are conversion asks\b/

/** Plan version 2 (the CONTROLLER's 1 November 2026 04:35): the gap the desk counts and the asks it sets each day. */
function ticketingGapProblems(g) {
  if (!g || typeof g !== 'object') return ['close_the_ticketing_gap is missing']
  const out = []
  if (!Array.isArray(g.targets) || g.targets.length === 0) out.push('close_the_ticketing_gap.targets is missing')
  else g.targets.forEach((t, i) => {
    if (!isDay(t?.by)) out.push(`close_the_ticketing_gap.targets[${i}].by is not a YYYY-MM-DD date`)
    if (!isNum(t?.events)) out.push(`close_the_ticketing_gap.targets[${i}].events is not a number`)
  })
  if (!Array.isArray(g.who_first) || g.who_first.length === 0 || g.who_first.some((w) => typeof w !== 'string' || !w.trim())) {
    out.push('close_the_ticketing_gap.who_first is missing or holds an empty name')
  }
  if (typeof g.daily !== 'string' || !CONVERSION_ASKS.test(g.daily)) {
    out.push("close_the_ticketing_gap.daily does not start 'N of the M daily outreach messages are conversion asks'")
  }
  return out
}

/** What is wrong with the ledger, the dated versions and the plan against the newest one. `read(path)` gives text or null. */
export function checkLedger(read) {
  const out = []
  const ledgerText = read(LEDGER)
  if (ledgerText == null) return [`${LEDGER} is missing`]
  let ledger
  try { ledger = JSON.parse(ledgerText) } catch { return [`${LEDGER} is not JSON`] }
  const versions = Array.isArray(ledger?.versions) ? ledger.versions : []
  if (versions.length === 0) return [`${LEDGER} records no version`]
  let last = 0
  for (const v of versions) {
    if (!Number.isInteger(v.version) || v.version <= last) out.push(`${v.file}: versions must rise one after another (${v.version} after ${last})`)
    last = v.version
    const text = read(v.file)
    if (text == null) { out.push(`${v.file}: a recorded version is missing`); continue }
    if (sha256Lf(text) !== v.sha256_lf) out.push(`${v.file}: a recorded version was changed after it was kept`)
    let body
    try { body = JSON.parse(text) } catch { out.push(`${v.file}: not JSON`); continue }
    if (body.version !== v.version || body.set_on !== v.set_on) out.push(`${v.file}: its version or set_on differs from the ledger`)
    for (const problem of planProblems(body)) out.push(`${v.file}: ${problem}`)
  }
  const newest = versions[versions.length - 1]
  const planText = read(PLAN)
  if (planText == null) out.push(`${PLAN} is missing`)
  else if (sha256Lf(planText) !== newest.sha256_lf) {
    out.push(`${PLAN} differs from its newest version ${newest.file}: change it only by adding a new dated version`)
  }
  return out
}
