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
import { readFirstLoad, bodies, kb, SCOPE_10_3_BUDGET_BYTES, measurementIdentity } from './lib/first-load.mjs'
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
/**
 * THE COMMIT SHA IS IN THE CLIENT BUNDLE, SO EVERY COMMIT MOVES EVERY ROUTE BY
 * A FEW BYTES, AND A MARK WRITTEN TO THE EXACT BYTE CANNOT SURVIVE BEING
 * COMMITTED.
 *
 * Established on 18 September 2026 after four pushes were refused by uniform
 * overages of +1, +2 and +3 bytes on all 141 routes at once, each time on a tree
 * whose bundled source had not changed. The chain, read out of the build rather
 * than reasoned about:
 *
 *   1. `@sentry/nextjs` inlines the git HEAD as the release. It is in the
 *      emitted JavaScript in full:
 *          release:"35c843f2f6f396f5d8b776e12395db365ddc51a4"
 *   2. Chunk filenames are content-addressed, so that chunk is renamed by every
 *      commit.
 *   3. A chunk in EVERY route's first load LISTS other chunks' filenames,
 *      including that one. Verified by grep: `static/chunks/3xb4h7ynb_v2_`
 *      appears inside the shared chunk that all 141 routes load.
 *   4. The replacement name is the same LENGTH and different CHARACTERS, so the
 *      chunk's raw size is unchanged and its gzip size moves by a byte or three.
 *      Measured: raw identical at 20986 both times, gzip 4886 then 4888.
 *
 * So writing a mark, committing it, and building again produces a different
 * number than the mark just written. It is a closed loop, and it is why the
 * ratchet had started refusing every push regardless of the tree.
 *
 * THE BUILD ITSELF IS DETERMINISTIC. Two consecutive builds of one tree both
 * measured 160550 on the shared shell, to the byte. The variation is per COMMIT,
 * not per build, which is exactly what makes it invisible: nobody re-measures
 * after committing.
 *
 * THE ALLOWANCE, AND WHY IT IS NOT A WEAKENED GATE. A mark is a HIGH-WATER MARK,
 * not a measurement, and this is what its head-room is for. 64 bytes is an order
 * of magnitude above the largest variation measured (5 bytes, across four builds
 * at four different commits: 160545, 160548, 160550, 160550) and two orders
 * below the smallest real regression this ratchet has ever caught (303 bytes on
 * one route; the one that started this was 3938 bytes on every route). It cannot
 * hide anything the ratchet exists to see.
 *
 * IT DOES NOT TOUCH THE ABSOLUTE BUDGET. `overBudget` below and the Scope v5
 * 10.3 limit are judged against `r.gzip`, the MEASURED value, never against the
 * mark, so a public route cannot slip over 200 KB by way of this allowance.
 *
 * `scripts/guards/initial-bundle-budget.mjs` is untouched and still refuses any
 * route above its mark.
 */
const SHA_JITTER_ALLOWANCE_BYTES = 64

export function baselineFrom(result, previous = null) {
  const marks = {}
  for (const r of [...result.routes].sort((a, b) => a.route.localeCompare(b.route)))
    marks[r.route] = r.gzip + SHA_JITTER_ALLOWANCE_BYTES
  return {
    _doc:
      'High-water marks for first-load JavaScript, gzip bytes per route, measured from ' +
      '.next/diagnostics/route-bundle-stats.json. Held by scripts/guards/initial-bundle-budget.mjs. ' +
      'A mark may only ever go DOWN. Rewrite with: node scripts/perf/first-load-budget.mjs --write-baseline',
    _budgetBytes: SCOPE_10_3_BUDGET_BYTES,
    _budgetSource: 'Scope v5 section 10.3, pulled forward by the close-out on 7 September 2026',
    _measuredOnDoc:
      'The conditions these marks were taken under. A mark is a gzip byte count of what one toolchain ' +
      'emitted, so the ratchet is only a fair comparison against a build from the same one. On a host that ' +
      'does not match, initial-bundle-budget.mjs REPORTS the comparison instead of failing on it, and the ' +
      'absolute Scope budget, the unmarked-route clause and the stale-mark clause still block everywhere.',
    _measuredOn: measurementIdentity(ROOT),
    _takingAMarkDoc:
      'TWO RULES FOR TAKING A MARK, both learned by a refused push on 18 September 2026. ' +
      'ONE: take it from a GATE build, never a bare `next build`. pre-push-gate.mjs sets ' +
      'NEXT_PUBLIC_SENTRY_DSN to a parity DSN when the environment has none, and that value is INLINED at ' +
      'build time, so a bare build emits a framework chunk 124 bytes smaller than the one any deployment ' +
      'serves. Marks taken that way were 120 bytes low on all 141 routes at once. ' +
      'TWO: a mark is a HIGH-WATER MARK and carries 64 bytes of head-room, written by --write-baseline, ' +
      'because the git HEAD is inlined into the client bundle as the Sentry release. Chunk filenames are ' +
      'content-addressed, so the chunk holding the release is renamed by EVERY COMMIT, and a chunk in every ' +
      "route's first load LISTS that filename: same length, different characters, so raw size is unchanged " +
      'and gzip moves a byte or three. Writing a mark and then committing it therefore invalidates the mark ' +
      'just written, which is a closed loop and refused four pushes on 18 September 2026 by uniform overages ' +
      'of +1, +2 and +3 on all 141 routes. The BUILD is deterministic (two builds of one tree both measured ' +
      '160550 exactly); the variation is per COMMIT, which is what makes it invisible. The allowance is an ' +
      'order of magnitude above the largest variation measured (5 bytes across four commits) and two orders ' +
      'below the smallest real regression this ratchet has caught (303 bytes). The absolute Scope v5 budget ' +
      'is judged against the MEASURED value, never the mark, so nothing slips over 200 KB by way of it.',
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
