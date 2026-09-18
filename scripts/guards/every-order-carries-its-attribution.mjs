/**
 * EVERY ORDER CARRIES ITS ATTRIBUTION RECORD, AT WRITE TIME AND ON A SCHEDULE.
 * A build-failing guard.
 *
 * WHY THIS EXISTS, and it is a defect in GA3's own work rather than a new idea.
 * GA3 built the invariant (one stored decision per order, including the sales no
 * campaign produced) and a guard that reads the database and fails a build when
 * it is breached. On 15 September 2026, reading that guard's own header made the
 * hole in it obvious:
 *
 *     A GUARD IS NOT A GUARANTEE. It judges whatever database the build
 *     environment points at. In CI that is a PLACEHOLDER project with nothing
 *     behind it, so it skips by design. On production nothing runs it at all.
 *
 * So on the one database where the invariant is money, the only thing defending
 * it was four call sites remembering to call one function, and a repair somebody
 * runs by hand when a build goes red on a different machine. Both halves are
 * source facts, both are decidable, and neither was checked by anything.
 *
 * WHAT IT CHECKS, in two clauses, because each defends a different half.
 *
 *   1. WRITE TIME. Every file in `src/` that INSERTS into `orders` also calls
 *      `recordClickSignalForOrder`, once per insert. That function is the one
 *      place the click carriers are read and the resolution is scheduled. A
 *      fifth order-creating path that forgets it is a class of sale that is
 *      permanently unattributed, and it would look completely normal: the
 *      purchase succeeds, no error is raised, and the only symptom is a row
 *      missing from a table nobody opens until an invoice is disputed.
 *
 *   2. HEAL TIME. A cron route calls the backstop healer, and its path is on a
 *      schedule in `vercel.json`. The write-time path catches every error and
 *      returns null, and it runs after the response has been sent, so it can
 *      miss without anything noticing. An invariant that depends on a call that
 *      is allowed to fail silently needs a repair that runs whether or not
 *      anybody is watching.
 *
 * IT IS DERIVED, NEVER LISTED. The insert sites are found by reading `src/`, so
 * the fifth one is judged the day it is written rather than the day somebody
 * remembers to add it to an array here. The cron path is read out of the route
 * file that names the healer, so renaming the route cannot orphan this check.
 *
 * WHY IT RE-READS vercel.json WHEN cron-routes-scheduled ALREADY DOES.
 * `cron-routes-scheduled` proves that any route in the cron directory is on a
 * schedule. That is a different statement from "the attribution healer is on a
 * schedule", and it would go on passing if this route were deleted outright.
 * Three lines of overlap buys a clause that is true on its own terms.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. The SCHEDULE's frequency. Hourly versus
 * every ten minutes is a judgement about cost, not an invariant, and a guard
 * that argues about a cron expression is a guard somebody edits to win.
 *
 * Run standalone:  node scripts/guards/every-order-carries-its-attribution.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { orderInsertCount, captureCallCount } from './lib/order-insert-sites.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const CRON_DIR = join(SRC, 'app', 'api', 'cron')
const VERCEL_JSON = join(ROOT, 'vercel.json')
const TAG = '[every-order-carries-its-attribution]'

const CAPTURE = 'recordClickSignalForOrder'
const HEALER = 'healUnrecordedOrders'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/*
 * The counting lives in scripts/guards/lib/order-insert-sites.mjs so it can be
 * driven over difficult text in tests/unit/guards without importing this file,
 * which would run it.
 */

const files = walk(SRC)
const problems = []

/* ------------------------------------------------- clause 1: write time */

const CAPTURE_DEFINITION = join(SRC, 'lib', 'attribution', 'checkout-signal.ts')
let insertSites = 0
let insertFiles = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const inserts = orderInsertCount(source)
  if (inserts === 0) continue
  insertFiles += 1
  insertSites += inserts
  const rel = relative(ROOT, file).split(sep).join('/')
  const captures = file === CAPTURE_DEFINITION ? 0 : captureCallCount(source, CAPTURE)
  if (captures === 0) {
    problems.push(
      `${rel} inserts ${inserts} order(s) and never calls ${CAPTURE}. Every order created on this ` +
        'platform carries exactly one stored attribution decision (GA3), and a sale written by a path ' +
        'that skips the capture is permanently unattributed with no symptom at all.',
    )
  } else if (captures < inserts) {
    problems.push(
      `${rel} inserts ${inserts} order(s) but calls ${CAPTURE} only ${captures} time(s). One of the ` +
        'insert paths in this file creates an order that is never attributed.',
    )
  }
}

if (insertSites === 0) {
  problems.push(
    'no file under src/ inserts into `orders`. Either the checkout moved somewhere this guard cannot ' +
      'read, or the pattern it matches changed; either way it is no longer checking anything and must ' +
      'not pass by finding nothing.',
  )
}

/* -------------------------------------------------- clause 2: heal time */

let healerRoute = null
for (const file of walk(CRON_DIR)) {
  if (readFileSync(file, 'utf8').includes(HEALER)) {
    healerRoute = file
    break
  }
}

let scheduledPath = null
if (!healerRoute) {
  problems.push(
    `no cron route under src/app/api/cron calls ${HEALER}. The write-time capture is allowed to fail ` +
      'silently (it catches every error and runs after the response), so without a scheduled repair the ' +
      'invariant is defended only by a build guard that CI skips and production never runs.',
  )
} else {
  const dir = dirname(healerRoute)
  scheduledPath = '/api/cron/' + relative(CRON_DIR, dir).split(sep).join('/')
  if (!existsSync(VERCEL_JSON)) {
    problems.push('vercel.json does not exist, so no schedule can be proved for the attribution backstop.')
  } else {
    const crons = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')).crons ?? []
    if (!crons.some(entry => entry.path === scheduledPath)) {
      problems.push(
        `${scheduledPath} calls ${HEALER} but has no entry in vercel.json crons, so it never runs. A cron ` +
          'that is never invoked looks exactly like a cron with nothing to do.',
      )
    }
  }
}

declareWork('every-order-carries-its-attribution', {
  did: {
    'source file read': files.length,
    'order insert site judged': insertSites,
    'heal-time clause checked': 1,
  },
  found: { 'unattributed order path': problems.length },
})

console.log(
  `${TAG} ${insertSites} order insert site(s) across ${insertFiles} file(s), every one paired with ${CAPTURE}` +
    `${scheduledPath ? `; ${HEALER} is scheduled at ${scheduledPath}` : ''}`,
)

if (problems.length > 0) {
  console.error('')
  for (const problem of problems) console.error(`${TAG} FAIL: ${problem}`)
  console.error(`${TAG} ${problems.length} way(s) an order can exist with no attribution record.`)
  process.exit(1)
}
