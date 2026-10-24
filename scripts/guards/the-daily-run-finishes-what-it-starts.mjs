/**
 * GUARD: THE LISTINGS RUN FINISHES WHAT IT STARTS (WI2, docs/walk-in/WI2-PLAN.md
 * section 7, found by the Part 2 drive on 24 October 2026).
 * ---------------------------------------------------------------------------
 * WHAT WAS FOUND, measured. The run that makes every EventLinqs night its dated
 * events (/api/cron/listing-occurrences) took a median 7.3 s per date on the
 * Part 2 drive against TEST, and a fresh import owes about 300 dates. Vercel
 * ends a function at its maximum duration ("If a function runs for longer than
 * its set maximum duration, Vercel will terminate it", 300 s by default:
 * https://vercel.com/docs/functions/configuring-functions/duration, read
 * 24 October 2026). The route declared none and ran once a day, so the first
 * run after an import would have been ended part way, and the date it was
 * making would have stayed a DRAFT for good: the plan saw that date held, made
 * nothing, and counted it unchanged without reading its status.
 *
 * THE RULES IT HOLDS
 *
 *   B1  the route declares its maximum duration and hands the run a deadline a
 *       margin inside it, so the platform never has to end it part way
 *   B2  the run checks that deadline before EVERY write (each date it takes off,
 *       brings in line, or makes), never in the middle of one
 *   D1  the plan reads a future occurrence's status and age: a draft older than
 *       ABANDONED_DRAFT_AFTER_MS is taken away and its date made again, a
 *       younger one is left to the run that may be making it
 *   D2  the store gives the plan each occurrence's created_at
 *   S1  the run is scheduled every hour, so a first fill that needs several
 *       runs finishes within hours, not days
 *
 * WHAT IT CANNOT SEE. It reads source. The behaviour is pinned by
 * tests/unit/listings/occurrence-plan.test.ts and occurrence-run.test.ts, and
 * the time per date by scripts/verify/wi2-free-week-drive.mjs.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[the-daily-run-finishes-what-it-starts]'
const ROOT = process.cwd()
const failures = []
let filesRead = 0
let rulesJudged = 0

function read(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist, and this guard judges it: a file renamed away is scanned for nothing and reported as a pass`)
    return ''
  }
  filesRead += 1
  return readFileSync(abs, 'utf8')
}

function rule(id, ok, message) {
  rulesJudged += 1
  if (!ok) failures.push(`${id} ${message}`)
}

const ROUTE = 'src/app/api/cron/listing-occurrences/route.ts'
const RUN = 'src/lib/listings/occurrence-run.ts'
const PLAN = 'src/lib/listings/occurrence-plan.ts'
const STORE = 'src/lib/listings/occurrence-store.ts'
const VERCEL = 'vercel.json'
const MIN_MARGIN_S = 30

const route = read(ROUTE)
const declared = route.match(/^export const maxDuration = (\d+)\r?$/m)
const margin = route.match(/const RUN_BUDGET_MS = \(maxDuration - (\d+)\) \* 1000/)
rule('B1', Boolean(declared),
  `${ROUTE}: the route declares no maxDuration, so it runs to the platform default and is ended wherever it happens to be`)
rule('B1', Boolean(margin) && Number(margin[1]) >= MIN_MARGIN_S,
  `${ROUTE}: the run's budget is not maxDuration less a margin of at least ${MIN_MARGIN_S} s, so its last write can still be cut off`)
rule('B1', /runOccurrences\(occurrenceStore\(\), new Date\(started\), \{ deadline: started \+ RUN_BUDGET_MS \}\)/.test(route),
  `${ROUTE}: the route does not hand the run its deadline, so the budget is declared and never kept`)

const run = read(RUN)
rule('B2', /const outOfTime = \(\) => options\.deadline !== undefined && clock\(\) >= options\.deadline/.test(run),
  `${RUN}: outOfTime no longer reads the deadline the route hands it`)
for (const list of ['retire', 'update', 'create']) {
  rule('B2', new RegExp(`for \\(const \\w+ of plan\\.${list}\\) \\{\\s*if \\(outOfTime\\(\\)\\) return stop\\(\\)`).test(run),
    `${RUN}: the plan.${list} loop starts a write without checking the deadline first`)
}
rule('B2', /if \(outOfTime\(\)\) return stop\(\)\s*summary\.nights \+= 1/.test(run),
  `${RUN}: a night is started without checking the deadline first`)

const plan = read(PLAN)
rule('D1', /o\.status === 'draft' && now\.getTime\(\) - Date\.parse\(o\.createdAt\) > ABANDONED_DRAFT_AFTER_MS/.test(plan),
  `${PLAN}: the plan no longer finds a draft a stopped run left behind, so its date stays unpublished for good`)
rule('D1', /existing\.find\(\(o\) => o\.occurrenceDate === date && !abandoned\.includes\(o\)\)/.test(plan),
  `${PLAN}: a draft being taken away still holds its date, so the date is held instead of made again`)
rule('D1', /if \(o\.status === 'draft'\) \{\s*(?:\/\/[^\n]*\s*)*plan\.held\.push\(/.test(plan),
  `${PLAN}: a draft another run may still be making is updated or counted unchanged instead of left to it`)

const store = read(STORE)
rule('D2', /\.select\('id, occurrence_date, status, created_at,/.test(store) && /createdAt: e\.created_at/.test(store),
  `${STORE}: the store no longer gives the plan each occurrence's created_at, so a draft's age cannot be judged`)

const vercel = read(VERCEL)
let schedule = null
try {
  schedule = (JSON.parse(vercel).crons ?? []).find((c) => c.path === '/api/cron/listing-occurrences')?.schedule ?? null
} catch {
  failures.push(`${VERCEL} is not JSON this guard can read`)
}
rule('S1', schedule !== null && schedule.trim().split(/\s+/)[1] === '*',
  `${VERCEL}: /api/cron/listing-occurrences runs on "${schedule}", not every hour, so a first fill that needs several runs takes days`)

declareWork('the-daily-run-finishes-what-it-starts', {
  did: { 'source file read': filesRead, 'rule judged': rulesJudged },
  found: { 'broken rule': failures.length },
})

if (failures.length > 0) {
  console.error(`${TAG} FAIL: the listings run could be ended part way, or leave a date it began as a draft for good:`)
  for (const f of failures) console.error(`${TAG}   ${f}`)
  process.exit(1)
}

console.log(`${TAG} PASS - ${rulesJudged} rule(s) across ${filesRead} file(s): the run stops inside its maximum duration between writes, and the next run finishes any draft one left.`)
