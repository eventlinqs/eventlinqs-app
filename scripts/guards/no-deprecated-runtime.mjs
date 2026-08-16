/**
 * LAW 9 GUARD: the pinned runtime must be a currently supported release.
 * Build-failing.
 *
 * WHAT IT ENFORCES. Law 9, "current by default, never backwards": no runtime is
 * pinned to, left on, or moved to a version that is deprecated, end of life or
 * superseded. This checks the one version the repository can check mechanically,
 * which is the Node major, against a support table carrying its own source and
 * the date the claim was last verified.
 *
 * WHY IT EXISTS, and the number that makes the case. `.nvmrc` pinned Node 20
 * until 13 August 2026. Node 20 reached END OF LIFE on 2026-04-30, per Node's
 * own release schedule. So this repository spent three and a half months pinned
 * to a runtime that had stopped receiving security fixes, and nothing anywhere
 * said so, because a version number in a file does not change on the day its
 * support ends. That is the whole failure mode: the pin was not wrong when it
 * was written, and nothing re-asked the question afterwards. This guard is what
 * re-asks it, on every build.
 *
 * It also closes the disagreement that hid the problem. `.nvmrc` is read by CI
 * and by the local tooling; `engines.node` is read by Vercel, which never reads
 * `.nvmrc` at all. The two disagreed for months and no gate could see it,
 * because each is read by a system that cannot see the other. They are compared
 * here.
 *
 * WHAT THIS GUARD CANNOT SEE, stated plainly so its green is not read as more
 * than it is:
 *
 *   THE RUNTIME ONLY. It says nothing about whether any DEPENDENCY is on a
 *   supported version. `lighthouse@13.1.0` declared `node >=22.19` and emitted
 *   EBADENGINE on every install under the old pin, in plain view, for months.
 *   Nothing here would have caught that, and nothing here catches the next one.
 *   That remainder is enforced by Law 9 clause 1 and by reading install output
 *   rather than scrolling past it.
 *
 *   IT IS ALSO NOT A LIVE FEED. The table below is a snapshot. A support date
 *   that changes upstream does not change here until somebody refreshes it,
 *   which is why the age of the claim is PRINTED on every run rather than left
 *   for a reader to assume is current.
 *
 * Run standalone:  node scripts/guards/no-deprecated-runtime.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * THE SUPPORT HORIZON, with its source and the date it was verified.
 *
 * Source: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
 * (the Node.js project's own release schedule, which is the primary source for
 * this claim and not a summary of it).
 *
 * Fetched and verified: 2026-08-13.
 *
 * `end` is the date a major stops being supported entirely. A pin whose end date
 * has passed fails this guard. Refresh this table from the URL above rather than
 * from memory, and move the CHECKED_ON date with it, because the date is what
 * tells the next reader whether to trust the rest.
 */
const CHECKED_ON = '2026-08-13'
const SOURCE_URL = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json'
const NODE_SUPPORT = {
  18: { end: '2025-04-30' },
  20: { end: '2026-04-30' },
  22: { end: '2027-04-30' },
  24: { end: '2028-04-30' },
  25: { end: '2026-06-01' },
  26: { end: '2029-04-30' },
}

/** How old the claim may get before the guard says so out loud. */
const STALE_AFTER_DAYS = 180

const failures = []
const notes = []

function majorFrom(value) {
  const n = Number.parseInt(String(value).trim().replace(/^[^\d]*/, ''), 10)
  return Number.isInteger(n) ? n : null
}

/** Days between two ISO dates, positive when `later` is after `earlier`. */
function daysBetween(earlier, later) {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000)
}

// The guard needs today's date to judge an end date. It is read once here rather
// than scattered, so the single clock read is obvious to a reader.
const TODAY = new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// 1. The .nvmrc pin, which CI and the local tooling read.
// ---------------------------------------------------------------------------
const NVMRC = join(ROOT, '.nvmrc')
if (!existsSync(NVMRC)) {
  failures.push('.nvmrc is missing, so there is no runtime contract to check.')
}
const nvmrcMajor = existsSync(NVMRC) ? majorFrom(readFileSync(NVMRC, 'utf8')) : null
if (existsSync(NVMRC) && nvmrcMajor === null) {
  failures.push('.nvmrc does not contain a Node major version.')
}

// ---------------------------------------------------------------------------
// 2. The engines.node pin, which VERCEL reads and .nvmrc cannot influence.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const enginesRaw = pkg.engines && pkg.engines.node
if (!enginesRaw) {
  failures.push(
    'package.json has no engines.node.\n' +
      '      Vercel selects the deployed runtime from that field and never reads .nvmrc,\n' +
      '      so without it the deployed runtime lives in a dashboard nobody can diff.\n' +
      '      Law 9 clause 3: the version contract lives in version control.',
  )
}
const enginesMajor = enginesRaw ? majorFrom(enginesRaw) : null

// ---------------------------------------------------------------------------
// 3. Neither pin may name an unsupported major.
// ---------------------------------------------------------------------------
for (const [label, major] of [
  ['.nvmrc', nvmrcMajor],
  ['package.json engines.node', enginesMajor],
]) {
  if (major === null) continue
  const record = NODE_SUPPORT[major]
  if (!record) {
    failures.push(
      `${label} pins Node ${major}, which this guard's support table does not know.\n` +
        `      The table was verified on ${CHECKED_ON} and may simply be out of date.\n` +
        `      Refresh it from the primary source and record the new date:\n` +
        `        ${SOURCE_URL}\n` +
        '      An unverified pin is not the same as a supported one, so this fails\n' +
        '      rather than assuming the newer version is fine.',
    )
    continue
  }
  if (record.end <= TODAY) {
    failures.push(
      `${label} pins Node ${major}, which reached END OF LIFE on ${record.end}.\n` +
        `      Today is ${TODAY}. An end-of-life runtime receives no security fixes.\n` +
        '      Law 9: move FORWARD to a supported major. Never resolve this by\n' +
        `      downgrading anything else to match. Source: ${SOURCE_URL}`,
    )
  } else {
    const left = daysBetween(TODAY, record.end)
    notes.push(`${label}: Node ${major}, supported until ${record.end} (${left} days)`)
  }
}

// ---------------------------------------------------------------------------
// 4. The two pins must agree, because nothing else compares them.
// ---------------------------------------------------------------------------
if (nvmrcMajor !== null && enginesMajor !== null && nvmrcMajor !== enginesMajor) {
  failures.push(
    `.nvmrc pins Node ${nvmrcMajor} and package.json engines.node pins Node ${enginesMajor}.\n` +
      '      These are read by DIFFERENT systems: CI and the local tooling read the\n' +
      '      first, Vercel reads the second and never reads the first. They disagreed\n' +
      '      for months once already with nothing able to notice, which is exactly why\n' +
      '      this comparison exists. Bring the OLDER one forward, never the newer back.',
  )
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
const age = daysBetween(CHECKED_ON, TODAY)
const staleness =
  age > STALE_AFTER_DAYS
    ? `STALE: last verified ${CHECKED_ON}, ${age} days ago. Refresh it from ${SOURCE_URL}`
    : `last verified ${CHECKED_ON}, ${age} day(s) ago`

if (failures.length > 0) {
  console.error(`\n[no-deprecated-runtime] FAILED. ${failures.length} problem(s).\n`)
  for (const f of failures) console.error(`  - ${f}\n`)
  console.error(`  support table: ${staleness}\n`)
  process.exit(1)
}

console.log(`[no-deprecated-runtime] PASS - ${notes.join('; ')}.`)
console.log(`[no-deprecated-runtime] support table ${staleness}`)
if (age > STALE_AFTER_DAYS) {
  console.log('[no-deprecated-runtime] the claim above is old enough to re-verify before trusting it.')
}
