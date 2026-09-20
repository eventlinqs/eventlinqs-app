/**
 * THE CHUNK COST TABLE. A REPORTER, NEVER A VERDICT.
 *
 * Close-out P0.5 asks for one thing before any optimisation is attempted: "for
 * the event route, the homepage and browse: every JavaScript chunk by
 * transferred size, its evaluation time, whether it is on the critical path,
 * and what feature it serves. Order by cost. That table decides the work
 * order." This produces exactly that, by DRIVING the routes rather than by
 * reading a build manifest, because the manifest cannot tell you what actually
 * arrives in a browser and a `<script noModule>` in the served HTML is 110KB
 * that no modern browser ever fetches.
 *
 * WHY DRIVEN AND NOT DERIVED. Three facts this table records are invisible to
 * every static source:
 *
 *   1. A chunk in the document is not necessarily requested. The Next.js
 *      legacy polyfill bundle ships as `<script noModule>`; it is in the HTML,
 *      it is real bytes on disk, and Chrome never asks for it.
 *   2. A chunk NOT in the document can be the biggest thing on the page. The
 *      error-reporting SDK is loaded by dynamic import after the load event,
 *      so it appears in no manifest for the route and is half the script
 *      weight the page actually pays.
 *   3. Transferred size is not file size. The three heaviest chunks on the
 *      deployed event page are 414KB, 340KB and 242KB on disk and 123KB, 95KB
 *      and 75KB over the wire.
 *
 * WHAT IT WILL NOT DO. It renders no opinion, sets no threshold and fails no
 * build. `scripts/ci/lighthouse-truth-table.mjs` is the same shape and for the
 * same reason: a reporter that starts refusing things becomes a gate nobody
 * can read.
 *
 * ============================================================================
 * WHERE `serves` COMES FROM, AND THE TWO WAYS IT WAS WRONG UNTIL
 * 21 SEPTEMBER 2026
 * ============================================================================
 *
 * ONE. THIS FILE WAS READING THE WRONG LIST. `scripts/perf/lib/chunk-attribution.mjs`
 * was created on 15 September to be the single reviewed marker list, and its
 * own opening paragraph names this file as one of the two readers that "must
 * never disagree". This file never started importing it, and kept its own older
 * copy, which still held the three markers that module documents as DEAD:
 * `react-stack-bottom-frame`, `prefetchReducer` and `APP_ROUTER_ACTION`. The
 * result, driven that morning on all thirteen gated routes, was the SECOND ROW
 * reading `unattributed` for a 29.9 KB chunk the shared list names correctly.
 *
 * TWO. A STRING MARKER CAN ONLY NAME A DEPENDENCY. Over the whole build, the
 * shared list leaves 131 of 154 chunks unnamed, and every one of those is OUR
 * code: there is no vendor identifier in it to match. Next's own per-route
 * client-reference manifests map a client module's SOURCE PATH to its chunks,
 * and that is what the `named by` column now says `manifest` about.
 *
 * Driven against a DEPLOYED preview there is no `.next` to read, so the
 * manifest half is absent and every row falls back to the markers. The run says
 * so in its own closing lines rather than reporting a thinner answer as the
 * same one.
 *
 * ROUTES ARE ENUMERATED, NEVER GUESSED. With no --routes the set is read from
 * lighthouse-gate-urls.json, which is the pinned, reviewed set the Lighthouse
 * gate itself audits, so this table and that gate always talk about the same
 * pages.
 *
 * USAGE
 *   node scripts/perf/chunk-cost-table.mjs --base http://127.0.0.1:3999
 *   node scripts/perf/chunk-cost-table.mjs --base https://<preview> --routes /,/events
 *   node scripts/perf/chunk-cost-table.mjs --base <url> --lhr .lighthouseci
 *
 * With --lhr pointing at a directory of Lighthouse report JSON, the script
 * evaluation column is filled in from that run's `bootup-time` audit rather
 * than left blank, so size and cost sit in one table.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { markerCoverage, nameChunk, readClientModuleChunks } from './lib/chunk-attribution.mjs'

/*
 * THE MARKER LIST IS NOT HERE. It is scripts/perf/lib/chunk-attribution.mjs,
 * imported above, and scripts/guards/the-cost-table-can-name-what-it-measures.mjs
 * fails the build if this file ever declares one of its own again.
 */


function parseArgs(argv) {
  const args = { base: '', routes: null, lhr: null, settleMs: 8000 }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--base') args.base = argv[++i] ?? ''
    else if (flag === '--routes') args.routes = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (flag === '--lhr') args.lhr = argv[++i] ?? null
    else if (flag === '--settle') args.settleMs = Number(argv[++i] ?? 8000)
  }
  return args
}

/** The pinned gate set, read from the file the Lighthouse gate reads. Never a guessed slug. */
function pinnedRoutes() {
  const file = join(process.cwd(), 'lighthouse-gate-urls.json')
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  return [...parsed.static, ...parsed.eventDetail].map((entry) => entry.path)
}

/**
 * Script evaluation per script URL, from a Lighthouse collection.
 *
 * `bootup-time` reports total, scriptParseCompile and scripting per URL. The
 * MEDIAN across runs is taken, not the best or the last, for the same reason
 * the gate's floors aggregate median: one run is not a measurement.
 */
function bootupByUrl(dir) {
  if (!dir || !existsSync(dir)) return new Map()
  const perUrl = new Map()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('manifest')) continue
    let lhr
    try {
      lhr = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    } catch (error) {
      // A half-written report in the collection directory is the caller's to
      // know about: the evaluation column would silently come back thinner and
      // read as "this chunk costs nothing".
      console.warn(`[chunk-cost] skipping ${name}: ${error.message}`)
      continue
    }
    const items = lhr?.audits?.['bootup-time']?.details?.items
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (typeof item.url !== 'string') continue
      const key = item.url.replace(/^https?:\/\/[^/]+/, '')
      if (!perUrl.has(key)) perUrl.set(key, [])
      perUrl.get(key).push(Number(item.total) || 0)
    }
  }
  const median = new Map()
  for (const [key, values] of perUrl) {
    const sorted = values.slice().sort((a, b) => a - b)
    median.set(key, sorted[Math.floor(sorted.length / 2)])
  }
  return median
}

const kb = (bytes) => (bytes / 1024).toFixed(1)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.base) {
    console.error('[chunk-cost] --base <url> is required (the server or preview to drive).')
    process.exitCode = 1
    return
  }
  const base = args.base.replace(/\/$/, '')
  const routes = args.routes ?? pinnedRoutes()
  const bootup = bootupByUrl(args.lhr)

  const { chromium, devices } = await import('playwright')
  /*
   * The manifests describe the tree on THIS disk, so they are only meaningful
   * when `base` is serving that tree. Against a deployed preview the map is
   * empty and every row falls back to the markers, which the closing lines say
   * out loud rather than leaving the reader to infer from a thinner table.
   */
  const manifestChunks = readClientModuleChunks(join(process.cwd(), '.next'))
  const bodiesSeen = []

  const browser = await chromium.launch()
  let totalRoutes = 0

  try {
    for (const route of routes) {
      const context = await browser.newContext({ ...devices['Moto G Power'] })
      // The same audit cookie lighthouserc.json sends, so the page renders in
      // the same mode the gate measures rather than in animated mode.
      await context.addCookies([{ name: 'el-audit', value: '1', url: base }])
      const page = await context.newPage()

      const requested = new Map()
      page.on('response', async (response) => {
        if (response.request().resourceType() !== 'script') return
        const url = response.url()
        // A blob: script is generated in the page (the SDK's own web worker),
        // so it crossed no network and Playwright reports a negative body size
        // for it. It is real main-thread cost but it is zero transfer, and
        // printing "-0.1 KB" in a size table is a lie in the reader's favour.
        if (url.startsWith('blob:')) return
        let transferred = 0
        let body = ''
        const unreadable = []
        try {
          const sizes = await response.request().sizes()
          transferred = sizes.responseBodySize ?? 0
        } catch (error) {
          // A chunk whose size cannot be read would print as 0 KB and sort to
          // the bottom of a table whose whole purpose is to order by cost.
          unreadable.push(`size unreadable: ${error.message}`)
        }
        try {
          body = (await response.body()).toString('utf8')
        } catch (error) {
          // No body means no attribution, and an unattributed chunk in this
          // table must say why rather than look like an ordinary miss.
          unreadable.push(`body unreadable: ${error.message}`)
        }
        const file = url.split('/').pop().split('?')[0]
        const named = nameChunk({ file, body, modules: manifestChunks.get(file) })
        bodiesSeen.push(body)
        requested.set(url, {
          url,
          transferred,
          raw: body.length,
          how: unreadable.length > 0 ? 'none' : named.how,
          features: unreadable.length > 0 ? unreadable : [named.label],
        })
      })

      let html = ''
      try {
        const response = await page.goto(base + route, { waitUntil: 'load', timeout: 60_000 })
        html = response ? await response.text() : ''
      } catch (error) {
        console.log(`\n## ${route}\n\nCOULD NOT DRIVE: ${error.message}\n`)
        await context.close()
        continue
      }
      await page.waitForTimeout(args.settleMs)

      // "On the critical path" is decided by the document, not by timing: a
      // chunk the HTML names is fetched by the parser before anything can defer
      // it. Anything else arrived by dynamic import.
      const inDocument = new Set(
        [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)]
          .filter((m) => !/noModule/.test(html.slice(Math.max(0, m.index - 200), m.index + 200)))
          .map((m) => base + m[1]),
      )

      const rows = [...requested.values()].sort((a, b) => b.transferred - a.transferred)
      const total = rows.reduce((sum, row) => sum + row.transferred, 0)
      const critical = rows.filter((row) => inDocument.has(row.url))
      const deferred = rows.filter((row) => !inDocument.has(row.url))

      console.log(`\n## ${route}`)
      console.log('')
      console.log(
        `${rows.length} script request(s), ${kb(total)} KB transferred: ` +
          `${kb(critical.reduce((s, r) => s + r.transferred, 0))} KB in the document, ` +
          `${kb(deferred.reduce((s, r) => s + r.transferred, 0))} KB by dynamic import`,
      )
      console.log('')
      console.log('| chunk | transferred | on disk | evaluation | in document | serves | named by |')
      console.log('|---|---|---|---|---|---|---|')
      for (const row of rows) {
        const path = row.url.replace(base, '')
        const evaluation = bootup.get(path)
        console.log(
          `| ${path.replace(/^\/_next\/static\/(immutable\/)?chunks\//, '')} ` +
            `| ${kb(row.transferred)} KB | ${kb(row.raw)} KB ` +
            `| ${evaluation == null ? '-' : `${Math.round(evaluation)} ms`} ` +
            `| ${inDocument.has(row.url) ? 'yes' : 'no'} | ${row.features.join(', ')} | ${row.how} |`,
        )
      }
      await context.close()
      totalRoutes += 1
    }
  } finally {
    await browser.close()
  }

  console.log('')
  console.log(`[chunk-cost] did ${totalRoutes} route(s) driven against ${base}`)
  if (manifestChunks.size === 0) {
    console.log(
      '[chunk-cost] NO BUILD ON DISK: every `serves` above came from the reviewed markers alone, which can only ' +
        'name a dependency. Drive a locally served build for the manifest answer.',
    )
  } else {
    console.log(`[chunk-cost] ${manifestChunks.size} chunk(s) in this build are named by Next's own client-reference manifests.`)
  }
  /*
   * The shared module splits an unmatched marker into DEAD (it claims to be
   * always present and is not, which is the table going blind) and ABSENT (it
   * can legitimately not be built here, with the reason). Both are printed;
   * neither fails, because scripts/guards/initial-bundle-budget.mjs already
   * fails the build on the first and this file is a reporter.
   */
  const coverage = markerCoverage(bodiesSeen)
  if (coverage.dead.length > 0) {
    console.log(`[chunk-cost] DEAD marker(s), claiming to be always present and matching nothing: ${coverage.dead.join(', ')}.`)
  }
  if (coverage.absent.length > 0) {
    console.log(`[chunk-cost] absent on these routes, declared conditional: ${coverage.absent.join('; ')}.`)
  }
  console.log('[chunk-cost] this is a report, not a gate: it sets no threshold and fails no build.')
}

await main()
