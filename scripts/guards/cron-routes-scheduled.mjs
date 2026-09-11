/**
 * EVERY CRON ROUTE IS ACTUALLY SCHEDULED. A build-failing guard.
 *
 * WHY THIS EXISTS. On 10 September 2026, while auditing the notification
 * routing for close-out UX4, `src/app/api/cron/queue-admit/route.ts` was found
 * with this in its own header:
 *
 *     Cron route: runs every minute via Vercel Crons.
 *
 * and no entry in `vercel.json`. Nineteen cron route directories, eighteen
 * schedules. So the virtual-queue admission batch had never run once: anybody
 * placed in a high-demand queue waited for ever, and `admitted` entries whose
 * window had elapsed were never expired. Nothing anywhere could notice, because
 * a route that is never invoked emits no error, writes no row, and passes every
 * test that calls it directly.
 *
 * That is the whole failure class: a scheduled job is the one kind of code
 * whose ABSENCE is silent. A page that is never rendered 404s. A cron that is
 * never invoked looks exactly like a cron with nothing to do.
 *
 * WHAT IT CHECKS, in both directions, because each direction hides a different
 * defect:
 *
 *   1. Every `src/app/api/cron/<name>/route.ts` has a `vercel.json` cron entry,
 *      or a named exemption below saying how it is invoked instead. A route
 *      with neither is the queue-admit defect returning.
 *   2. Every `vercel.json` cron entry points at a route that exists. A schedule
 *      aimed at a deleted route is a 404 every minute, for ever, and shows up
 *      nowhere except the function log nobody reads.
 *   3. No exemption is stale: an exemption naming a route that has since been
 *      scheduled, or that no longer exists, is deleted rather than left to rot
 *      into an unexamined list.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Whether the SCHEDULE matches the
 * frequency a route's comment claims. That would mean judging prose, and a
 * guard that parses English is a guard that argues with the next person to
 * write a sentence. The decidable invariant is that the path exists on both
 * sides, and that is the one that was broken.
 *
 * Run standalone:  node scripts/guards/cron-routes-scheduled.mjs
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CRON_DIR = join(ROOT, 'src', 'app', 'api', 'cron')
const VERCEL_JSON = join(ROOT, 'vercel.json')
const TAG = '[cron-routes-scheduled]'

/**
 * Cron routes that are deliberately NOT on a Vercel schedule, each with the
 * thing that invokes them instead.
 *
 * An entry here is a statement about how the route is driven, not a waiver. If
 * nothing drives it, it does not belong here; it belongs in `vercel.json` or in
 * the bin.
 *
 * @type {Record<string, string>}
 */
export const INVOKED_WITHOUT_A_SCHEDULE = {}

/** Every cron route directory that carries a route handler. */
export function cronRouteNames(dir = CRON_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(dir, entry.name, 'route.ts')) || existsSync(join(dir, entry.name, 'route.tsx')))
    .map((entry) => entry.name)
    .sort()
}

/** The cron paths `vercel.json` actually schedules. */
export function scheduledPaths(configText) {
  const parsed = JSON.parse(configText)
  const crons = Array.isArray(parsed.crons) ? parsed.crons : []
  return crons.map((c) => ({ path: String(c.path ?? ''), schedule: String(c.schedule ?? '') }))
}

/**
 * The whole judgement, pure, so the drill can feed it a broken pair without
 * touching the repository.
 *
 * @param {string[]} routes cron route directory names
 * @param {{path: string, schedule: string}[]} scheduled entries from vercel.json
 * @param {Record<string, string>} exempt
 */
export function judge(routes, scheduled, exempt = INVOKED_WITHOUT_A_SCHEDULE) {
  const problems = []
  const scheduledNames = new Set(
    scheduled
      .map((entry) => entry.path.replace(/^\/api\/cron\//, ''))
      .filter((name) => name !== ''),
  )

  for (const route of routes) {
    if (scheduledNames.has(route)) continue
    if (Object.prototype.hasOwnProperty.call(exempt, route)) continue
    problems.push(
      `/api/cron/${route} has a route handler and no schedule in vercel.json, so it never runs. ` +
        'Add the entry, or record what invokes it in INVOKED_WITHOUT_A_SCHEDULE.',
    )
  }

  const routeNames = new Set(routes)
  for (const entry of scheduled) {
    const name = entry.path.replace(/^\/api\/cron\//, '')
    if (!entry.path.startsWith('/api/cron/')) {
      problems.push(`vercel.json schedules ${entry.path}, which is not a cron route; this guard cannot see whether it exists.`)
      continue
    }
    if (!routeNames.has(name)) {
      problems.push(`vercel.json schedules ${entry.path} "${entry.schedule}" and no such route exists, so it is a 404 on every tick.`)
    }
  }

  for (const [name, reason] of Object.entries(exempt)) {
    if (!routeNames.has(name)) {
      problems.push(`INVOKED_WITHOUT_A_SCHEDULE names ${name}, which has no route handler. Delete the entry.`)
      continue
    }
    if (scheduledNames.has(name)) {
      problems.push(`INVOKED_WITHOUT_A_SCHEDULE names ${name}, which IS scheduled in vercel.json. Delete the entry: ${reason}`)
    }
  }

  return problems
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cron-routes-scheduled.mjs')

if (invokedDirectly) {
  const routes = cronRouteNames()
  let scheduled = []
  try {
    scheduled = scheduledPaths(readFileSync(VERCEL_JSON, 'utf8'))
  } catch (err) {
    console.error(`${TAG} FAIL - vercel.json could not be read or parsed: ${err instanceof Error ? err.message : String(err)}`)
    console.error('  A guard that cannot read the schedule cannot report a pass.')
    process.exit(1)
  }

  const problems = judge(routes, scheduled)

  console.log(`${TAG} what this guard scanned:`)
  console.log(`${TAG}   ${routes.length} cron route handler(s) under src/app/api/cron`)
  console.log(`${TAG}   ${scheduled.length} cron entr(ies) in vercel.json`)
  console.log(`${TAG}   ${Object.keys(INVOKED_WITHOUT_A_SCHEDULE).length} route(s) recorded as invoked without a schedule`)

  if (problems.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${problems.length} cron route problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  A cron that is never invoked looks exactly like a cron with nothing to do.')
    console.error('  That is how /api/cron/queue-admit went its whole life without running once.')
    process.exit(1)
  }

  declareWork('cron-routes-scheduled', {
    did: {
      'cron route handler judged': routes.length,
      'vercel.json cron entry judged': scheduled.length,
    },
    found: { 'cron route that never runs': problems.length },
    zeroIsFine: {
      'cron route that never runs':
        'every cron route being scheduled is the goal state; the guard exists because one was not and nothing could notice',
    },
    exitOnZero: false,
  })

  console.log(`${TAG} PASS - ${routes.length} cron route(s), ${scheduled.length} schedule(s), every one matched.`)
  process.exit(0)
}
