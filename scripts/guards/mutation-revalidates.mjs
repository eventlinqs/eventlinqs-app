/**
 * A MUTATION THAT CHANGES WHAT A BUYER SEES MUST INVALIDATE WHAT IT AFFECTED.
 *
 * THE DEFECT THIS GUARDS, 18 August 2026. An organiser edited a field, reloaded
 * the public page, and saw the old value. They concluded the platform was
 * broken, which is the correct conclusion from the evidence they had.
 *
 * The cache was not too aggressive. The revalidation was gated on the wrong
 * thing. `updateEvent` called
 *
 *     if (input.has_reserved_seating && event.slug) {
 *       revalidatePath(`/events/${event.slug}`)
 *     }
 *
 * so an ordinary event, which is nearly all of them, was never invalidated at
 * all and waited out its own 300 second ISR window. Worse, FOUR mutations
 * invalidated NOTHING: publishEvent refreshed only the city picker, and
 * pauseEvent, cancelEvent, duplicateEvent and deleteEvent did not revalidate at
 * any point. A cancelled event went on being sold from a cached page.
 *
 * And the window is not the whole wait. Next.js time-based revalidation is
 * stale-while-revalidate, so the FIRST reload after expiry still serves the old
 * page (next/dist/docs/01-app/02-guides/how-revalidation-works.md, shipped with
 * next@16.3.0). Refreshing once and seeing nothing change is the designed
 * behaviour of a cache nobody told about the write.
 *
 * WHAT IT CHECKS. Every exported server action that WRITES to a table a public
 * surface reads must reach a revalidation before it returns. It does not try to
 * verify the invalidation is complete, which is a judgement; it verifies one was
 * attempted, which is what was missing five times out of seven.
 *
 * WHAT IT CANNOT SEE, plainly: it reads source text and cannot prove the set of
 * invalidated paths is the right set. `revalidateEventSurfaces` owns that, in one
 * place, precisely so there is a single thing to get right.
 *
 * IT PRINTS WHAT IT SCANNED and FAILS if it scanned nothing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src', 'app')

const failures = []

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

const rel = (f) => relative(ROOT, f).replace(/\\/g, '/')

/** Tables whose rows a PUBLIC, cached surface renders. */
const PUBLIC_TABLES = ['events', 'ticket_tiers']

/**
 * What counts as telling the cache about a PUBLIC surface.
 *
 * TIGHTENED 18 August 2026, because the first version of this guard passed
 * `saveDynamicPricing`, which revalidated `/dashboard/events/{id}/pricing` and
 * nothing else. That is the organiser's own screen. A dynamic price change was
 * therefore visible to the person who made it and to no buyer until the event
 * page expired on its own timer, and the guard reported the mutation as covered.
 *
 * A guard that accepts any revalidation at all accepts the dashboard-only
 * revalidation, which is the exact shape of the defect. So a dashboard path does
 * not count, and the shared helper or a non-dashboard path is required.
 */
const PUBLIC_REVALIDATORS = /revalidateEventSurfaces(?:ById)?\s*\(|revalidateTag\s*\(/
const ANY_REVALIDATE_PATH = /revalidatePath\(\s*[`'"]([^`'"]*)/g

/**
 * Split a file into top-level exported async functions. Bodies are matched to the
 * closing brace at column zero, which is the house style in these action files.
 */
function exportedActions(src) {
  const out = []
  const re = /export async function (\w+)\s*\(/g
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index
    const next = src.indexOf('\nexport ', start + 1)
    out.push({ name: m[1], body: src.slice(start, next === -1 ? src.length : next) })
  }
  return out
}

const files = walk(SRC).filter((f) => readFileSync(f, 'utf8').includes("'use server'"))

let actionsScanned = 0
let mutatingActions = 0
const mutating = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const action of exportedActions(src)) {
    actionsScanned += 1

    // Does it write to a table a public surface renders?
    const writes = PUBLIC_TABLES.filter((table) => {
      const write = new RegExp(
        String.raw`\.from\(['"]${table}['"]\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\(`,
      )
      return write.test(action.body)
    })
    if (writes.length === 0) continue

    mutatingActions += 1

    // A revalidatePath that only ever names a dashboard route has not told any
    // buyer-facing cache anything.
    const paths = [...action.body.matchAll(ANY_REVALIDATE_PATH)].map((m) => m[1])
    const publicPaths = paths.filter((p) => !p.startsWith('/dashboard') && !p.startsWith('/admin'))
    const revalidates = PUBLIC_REVALIDATORS.test(action.body) || publicPaths.length > 0
    const dashboardOnly = !revalidates && paths.length > 0

    mutating.push({ file: rel(file), name: action.name, writes, revalidates, dashboardOnly })

    if (!revalidates) {
      failures.push(
        `${rel(file)}: ${action.name}() writes ${writes.join(' and ')} but ` +
          (dashboardOnly
            ? `only invalidates ${paths.join(', ')}, which is the organiser's own screen. The ` +
              `change is then visible to the person who made it and to no buyer until the public ` +
              `page expires on its own timer.`
            : `never invalidates a cached surface.`) +
          ` Every public page that renders this row keeps serving the old value, and ` +
          `stale-while-revalidate means even the first reload after expiry still returns the old ` +
          `one. Call revalidateEventSurfacesById.`,
      )
    }
  }
}

console.log(
  `[mutation-revalidates] scanned ${files.length} server-action file(s), ${actionsScanned} exported action(s), ` +
    `${mutatingActions} of which write a publicly rendered table`,
)
for (const m of mutating) {
  const verdict = m.revalidates ? 'invalidates public' : m.dashboardOnly ? 'DASHBOARD ONLY   ' : 'DOES NOT         '
  console.log(`    ${verdict}  ${m.name}  (${m.writes.join(', ')})  ${m.file}`)
}

if (actionsScanned === 0 || mutatingActions === 0) {
  failures.push(
    'ZERO mutating actions were found. The platform certainly has some, so this guard is no ' +
      'longer looking where they are, and a guard that scans nothing passes everything.',
  )
}

if (failures.length > 0) {
  console.error(
    `\n[mutation-revalidates] FAILED. ${failures.length} mutation(s) can change what a buyer sees ` +
      `without telling the cache.\n`,
  )
  for (const f of failures) console.error(`    ${f}\n`)
  process.exit(1)
}

console.log('[mutation-revalidates] PASS - every publicly visible mutation invalidates what it affected.')
