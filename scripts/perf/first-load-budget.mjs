/**
 * THE INITIAL BUNDLE TABLE: every route, every chunk, every byte named.
 *
 * ============================================================================
 * WHAT IT IS FOR
 * ============================================================================
 *
 * Close-out C8B.1 asks for a cost table that says, for every chunk, its size,
 * whether it is on the critical path, and WHAT FEATURE IT SERVES, and then says
 * "that table decides the work order". C8B.3 works down it one item at a time.
 * `scripts/perf/chunk-cost-table.mjs` answers that by DRIVING three routes with
 * a browser, which is the better evidence and costs a server, a build and a
 * browser. This answers it for ALL 133 routes from the build output alone, in
 * about two seconds, which is what makes it usable as a gate.
 *
 * The two agree where they overlap, and that agreement is the reason to trust
 * either. On the build of 15 September 2026 this reports /events/[slug] at
 * 200.4 KB gzip; the C8B.5 drive, which cut a real network against a real
 * server and counted what the browser fetched, reported 198.9 KB. Two
 * independent methods, 1.5 KB apart, which is the difference between `gzip -9`
 * on disk and the compressor a Node server runs at request time.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *     node scripts/perf/first-load-budget.mjs                 the table
 *     node scripts/perf/first-load-budget.mjs --json          machine readable
 *     node scripts/perf/first-load-budget.mjs --write-baseline rewrite the marks
 *     node scripts/perf/first-load-budget.mjs --route /login  one route's chunks
 *
 * `--write-baseline` is deliberately a HUMAN command and is never run by the
 * build. A ratchet that rewrites its own mark is not a ratchet.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFirstLoad, bodies, kb, SCOPE_10_3_BUDGET_BYTES } from './lib/first-load.mjs'
import { markerCoverage } from './lib/chunk-attribution.mjs'
import { audienceOf, classifyRoutes, audienceDisagreements } from './lib/route-audience.mjs'

const ROOT = process.cwd()
export const BASELINE_FILE = 'perf-budget.json'

function parseArgs(argv) {
  const args = { json: false, writeBaseline: false, route: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') args.json = true
    else if (argv[i] === '--write-baseline') args.writeBaseline = true
    else if (argv[i] === '--route') args.route = argv[++i] ?? null
  }
  return args
}

/** The whole measurement, shaped for a reader or a guard. */
export function collect(root = ROOT) {
  const { routes, chunks, shell, polyfillFiles } = readFirstLoad(root)
  const classes = classifyRoutes(routes.map((r) => r.route), root)
  const withAudience = routes.map((r) => ({
    ...r,
    audience: audienceOf(r.route),
    indexing: classes[r.route] ?? null,
    overBudget: r.gzip > SCOPE_10_3_BUDGET_BYTES,
  }))
  return {
    routes: withAudience,
    chunks,
    shell,
    polyfillFiles,
    coverage: markerCoverage(bodies(chunks)),
    disagreements: audienceDisagreements(routes.map((r) => r.route), classes),
  }
}

/**
 * The baseline shape: one high-water mark in gzip bytes per route, plus the
 * register of public routes that are over the Scope budget today.
 *
 * `overBudget` is preserved rather than regenerated. It is written by a person,
 * with a date and a reason, and rewriting the marks must never silently adopt a
 * new breach as though somebody had accepted it. The guard refuses an entry
 * whose route is no longer over budget, so the register cannot outlive the
 * defect it describes either.
 */
export function baselineFrom(result, previous = null) {
  const marks = {}
  for (const r of [...result.routes].sort((a, b) => a.route.localeCompare(b.route))) marks[r.route] = r.gzip
  return {
    _doc:
      'High-water marks for first-load JavaScript, gzip bytes per route, measured from ' +
      '.next/diagnostics/route-bundle-stats.json. Held by scripts/guards/initial-bundle-budget.mjs. ' +
      'A mark may only ever go DOWN. Rewrite with: node scripts/perf/first-load-budget.mjs --write-baseline',
    _budgetBytes: SCOPE_10_3_BUDGET_BYTES,
    _budgetSource: 'Scope v5 section 10.3, pulled forward by the close-out on 7 September 2026',
    _overBudgetDoc:
      'PUBLIC routes over the budget today. Every entry is dated, says why, and says what would fix it. ' +
      'The guard FAILS on a public route over budget with no entry here, and FAILS on an entry whose route ' +
      'is no longer over budget, so this register can neither grow by accident nor outlive the defect. ' +
      'Written by a person; --write-baseline preserves it and never adds to it.',
    overBudget: previous?.overBudget ?? {},
    marks,
  }
}

export function readBaseline(root = ROOT) {
  const p = join(root, BASELINE_FILE)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

function printTable(result) {
  const { routes, shell, chunks, polyfillFiles, coverage, disagreements } = result
  const pub = routes.filter((r) => r.audience === 'public')
  const int = routes.filter((r) => r.audience === 'internal')

  console.log('')
  console.log('THE PLATFORM-WIDE CLIENT SHELL: every route pays for this before its own code.')
  console.log('   gzip  brotli  chunk                       serves')
  let sg = 0
  let sb = 0
  for (const c of [...shell].sort((a, b) => b.gzip - a.gzip)) {
    sg += c.gzip
    sb += c.brotli
    console.log(`${kb(c.gzip).padStart(7)} ${kb(c.brotli).padStart(7)}  ${c.name.padEnd(27)} ${c.features.join(', ')}`)
  }
  console.log(`${kb(sg).padStart(7)} ${kb(sb).padStart(7)}  TOTAL, ${shell.length} chunks`)
  for (const name of polyfillFiles) {
    const c = chunks.get(name)
    if (c) {
      console.log(
        `${kb(c.gzip).padStart(7)} ${kb(c.brotli).padStart(7)}  ${name.padEnd(27)} ` +
          'legacy polyfill, <script noModule>, NOT counted: no module-capable browser fetches it',
      )
    }
  }

  console.log('')
  console.log(`FIRST-LOAD JAVASCRIPT PER ROUTE, against the Scope v5 10.3 budget of ${kb(SCOPE_10_3_BUDGET_BYTES)} KB gzip.`)
  console.log(`  public routes:   ${pub.length}, over budget: ${pub.filter((r) => r.overBudget).length}`)
  console.log(`  internal routes: ${int.length}, over budget: ${int.filter((r) => r.overBudget).length}`)
  console.log('')
  console.log('   gzip  brotli  audience  verdict  route')
  for (const r of routes) {
    console.log(
      `${kb(r.gzip).padStart(7)} ${kb(r.brotli).padStart(7)}  ${r.audience.padEnd(8)}  ` +
        `${(r.overBudget ? 'OVER' : 'ok').padEnd(7)}  ${r.route}`,
    )
  }

  if (coverage.absent.length) {
    console.log('')
    // NOT "not in this build": this table reads first-load chunks only, so a
    // feature loaded by dynamic import is absent here and present on disk.
    console.log(`IN NO ROUTE'S FIRST LOAD, declared conditional (${coverage.absent.length}):`)
    for (const a of coverage.absent) console.log(`  ${a}`)
  }
  if (coverage.dead.length) {
    console.log('')
    console.log(`DEAD ATTRIBUTION MARKERS (${coverage.dead.length}): ${coverage.dead.join(', ')}`)
    console.log('  Each names a feature declared ALWAYS present that no chunk in this build carries. That is')
    console.log('  how the table goes blind while still reading confidently; see scripts/perf/lib/chunk-attribution.mjs.')
  }
  if (disagreements.length) {
    console.log('')
    console.log('AUDIENCE DISAGREEMENTS:')
    for (const d of disagreements) console.log(`  ${d}`)
  }
}

function printRoute(result, route) {
  const row = result.routes.find((r) => r.route === route)
  if (!row) {
    console.error(`no such route in the build: ${route}`)
    console.error(`routes are enumerated from .next/diagnostics/route-bundle-stats.json, never typed.`)
    process.exit(1)
  }
  console.log(`${row.route}  ${kb(row.gzip)} KB gzip / ${kb(row.brotli)} KB brotli, ${row.chunks.length} chunks, ${row.audience}`)
  console.log('   gzip  brotli  shell  chunk                       serves')
  const rows = row.chunks.map((n) => result.chunks.get(n)).sort((a, b) => b.gzip - a.gzip)
  for (const c of rows) {
    console.log(
      `${kb(c.gzip).padStart(7)} ${kb(c.brotli).padStart(7)}  ${c.inShell ? ' yes ' : '  -  '}  ` +
        `${c.name.padEnd(27)} ${c.features.join(', ')}`,
    )
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = collect(ROOT)

  if (args.writeBaseline) {
    const baseline = baselineFrom(result, readBaseline(ROOT))
    writeFileSync(join(ROOT, BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
    console.log(`[first-load] wrote ${BASELINE_FILE}: ${Object.keys(baseline.marks).length} route marks.`)
    return
  }
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          budgetBytes: SCOPE_10_3_BUDGET_BYTES,
          routes: result.routes.map(({ route, gzip, brotli, uncompressed, audience, indexing, overBudget, chunks }) => ({
            route, gzip, brotli, uncompressed, audience, indexing, overBudget, chunks,
          })),
          shell: result.shell.map(({ name, gzip, brotli, features }) => ({ name, gzip, brotli, features })),
          coverage: result.coverage,
          disagreements: result.disagreements,
        },
        null,
        2,
      ),
    )
    return
  }
  if (args.route) {
    printRoute(result, args.route)
    return
  }
  printTable(result)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
