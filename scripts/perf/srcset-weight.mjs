/**
 * WHAT THE RESPONSIVE-IMAGE CANDIDATE LISTS COST IN THE DOCUMENT ITSELF.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8B.1's cost table measured the SCRIPT on each route and the four
 * phases of its paint. Nothing measured the HTML, and on this platform the HTML
 * is not small: the served homepage is around 375 KB before compression, more
 * than twice any other public page, and a document that size is parsed on a
 * mobile CPU Lighthouse throttles by 4x.
 *
 * This reports where those bytes go, in the one place they were never looked
 * for: the `srcset` attribute of every image.
 *
 * ============================================================================
 * THE RULE IT IS MEASURING AGAINST, READ OUT OF THE FRAMEWORK
 * ============================================================================
 *
 * `getWidths` in node_modules/next/dist/shared/lib/get-img-props.js decides how
 * many candidates an image emits, and the branch that matters is this one:
 *
 *     if (sizes) {
 *       const viewportWidthRe = /(^|\s)(1?\d?\d)vw/g
 *       ... collect percentSizes ...
 *       if (percentSizes.length) {
 *         const smallestRatio = Math.min(...percentSizes) * 0.01
 *         return { widths: allSizes.filter(s => s >= deviceSizes[0] * smallestRatio), kind: 'w' }
 *       }
 *       return { widths: allSizes, kind: 'w' }      // <- every width, unfiltered
 *     }
 *
 * So a `sizes` expressed only in CSS pixels, with no viewport-relative term,
 * gets the ENTIRE width list. On this repository's config that is twelve
 * candidates from 16w to 3840w, emitted for a 32 CSS pixel avatar as readily as
 * for a full-bleed hero, and no browser will ever request the top of that list
 * for a tile that is 280 pixels wide.
 *
 * The filter has no upper bound, which is the part that is easy to get wrong
 * when reasoning about it: a viewport-relative `sizes` trims the SMALL
 * candidates and never the large ones.
 *
 * ============================================================================
 * WHAT IT REPORTS
 * ============================================================================
 *
 * Per route: total document bytes, total srcset bytes and their share, and a
 * breakdown grouped by the `sizes` attribute, so the cost lands on the media
 * role that caused it rather than on "images" in general.
 *
 * It counts the served DOCUMENT, never the source, because the number that
 * matters is what a browser downloads and parses. A component can be correct in
 * isolation and a page can still ship six hundred candidate URLs.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - Compressed size. These URLs share a long common prefix, so gzip and brotli
 *   collapse them hard, and the wire cost is a fraction of the raw cost. The
 *   raw cost is still paid, by the parser, on a throttled CPU, after
 *   decompression. Both numbers are printed so neither can be quoted alone.
 * - Whether a candidate is actually FETCHED. That depends on the device pixel
 *   ratio and the layout, and it is a question for a driven browser, not a
 *   document reader.
 *
 * SERVING. `--serve` starts this tree's production build through
 * `startGateServer`, the one function permitted to run `next start` for a
 * measurement (scripts/guards/gate-servers-carry-a-limiter.mjs). Without it the
 * base URL is whatever is already listening, and nothing checks what built it.
 *
 * Usage (paths carry NO leading slash: MSYS rewrites a leading slash to a
 * Windows path before the process starts):
 *
 *   node scripts/perf/srcset-weight.mjs --serve --port=3200 --path=home --path=events
 *   node scripts/perf/srcset-weight.mjs https://www.eventlinqs.com.au --path=home --out=x.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { analyseDocument, catalogueWeight } from './lib/document-weight.mjs'
import { CATALOGUES } from './lib/catalogues.mjs'

const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let base = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const outArg = args.find(a => a.startsWith('--out='))?.split('=')[1]
/*
 * `--dump=DIR` writes each served document to disk. It exists because the two
 * biggest things in these documents, the candidate lists and the flight
 * payload, are only ANSWERABLE by reading the bytes: a share tells you a
 * question is worth asking and never what the answer is. The alternative was
 * a second harness that serves the build again to fetch the same page twice.
 */
const dumpArg = args.find(a => a.startsWith('--dump='))?.split('=')[1]
const rawPaths = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])

if (rawPaths.length === 0) {
  console.error('[srcset-weight] REFUSING: no --path given. Nothing to measure.')
  process.exit(1)
}
for (const p of rawPaths) {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
    console.error(
      `[srcset-weight] REFUSING: --path=${p} arrived with a leading slash or a drive letter.\n` +
        '             MSYS rewrites a leading slash to a Windows path before this process starts,\n' +
        '             and a harness that silently measures the wrong route is worse than one that stops.\n' +
        '             Pass paths with no leading slash: --path=home, --path=events/browse/melbourne',
    )
    process.exit(1)
  }
}
/** `home` is the one path that cannot be written without a slash. */
const paths = rawPaths.map(p => (p === 'home' ? '/' : `/${p}`))

let stopServer = null
if (SERVE) {
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/srcset-weight-server.log', {
    port: PORT,
  })
  if (started.error) {
    console.error(`[srcset-weight] could not serve the build: ${started.error}`)
    process.exit(1)
  }
  base = started.base
  stopServer = started.stop
  console.log(`[srcset-weight] serving the production build on ${base}`)
}

const report = { base, takenAt: new Date().toISOString(), routes: [] }

for (const path of paths) {
  const url = base + path
  const res = await fetch(url, { headers: { 'user-agent': 'eventlinqs-srcset-weight' } })
  if (!res.ok) {
    console.error(`[srcset-weight] REFUSING: ${url} answered ${res.status}`)
    process.exit(1)
  }
  const html = await res.text()
  if (dumpArg) {
    const dir = resolve(dumpArg)
    mkdirSync(dir, { recursive: true })
    const name = (path === '/' ? 'home' : path.slice(1)).replace(/[^a-z0-9]+/gi, '-')
    writeFileSync(join(dir, `${name}.html`), html)
  }
  const a = analyseDocument(html)
  /*
   * THE CATALOGUES, MEASURED ON THE SERVED DOCUMENT AND NOT ONLY ON THE BUILT
   * ONE. The built documents are the deterministic comparison; these are what a
   * visitor actually downloads, and the two are assembled at different moments.
   *
   * ON THE TREE OF 19 SEPTEMBER 2026 THEY AGREE EXACTLY: 20 distinct cities and
   * 6,988 bytes, built and served. That is worth writing down rather than
   * assuming, because the obvious guess is wrong in BOTH directions. The guess
   * that a built document understates it is wrong here (checked: the 20 rows the
   * endpoint returns are exactly LAUNCH_TARGET_CITIES). The guess that they must
   * therefore always agree is also wrong: `getPickerCities` merges the `cities`
   * table and the distinct venue cities of published events on top of the
   * curated list, so a build made before an organiser publishes in a new town
   * and a request made after it are answering different questions. The served
   * number is the one a visitor pays, so it is the one measured here.
   */
  const catalogues = CATALOGUES.map(c => ({
    name: c.name,
    ...catalogueWeight(html, { marker: c.marker, arrayKeys: c.arrayKeys }),
  }))
  report.routes.push({ path, ...a, catalogues })

  console.log('')
  console.log(`${path}`)
  console.log(
    `  document ${a.documentBytes} B raw / ${a.gzipBytes} B gzip     srcset ${a.srcsetBytes} B` +
      ` in ${a.candidates} candidates  (${a.sharePercent.toFixed(1)}% of the document)`,
  )
  console.log(
    `    flight payload ${a.flightBytes} B in ${a.flightScripts} script tags ` +
      `(${a.flightSharePercent.toFixed(1)}% of the document): the same tree again, as script`,
  )
  console.log(
    `    class lists ${a.classLists.bytes} B in ${a.classLists.occurrences} attributes ` +
      `(${a.classLists.sharePercent.toFixed(1)}% of the document), ${a.classLists.distinct} distinct, ` +
      `of which ${a.classLists.repeatBytes} B is a value said again`,
  )
  for (const row of a.classLists.byValue.slice(0, 3)) {
    if (row.repeatBytes === 0) break
    console.log(
      `      ${String(row.repeatBytes).padStart(7)} B repeats   ${row.count} x ${row.value.length} chars   ` +
        `${row.value.slice(0, 58)}`,
    )
  }
  /* The inline-style row, added 19 September 2026 with the browse card
   * collapse. A `style={{ ... }}` object is paid per instance in the markup
   * AND again as a serialised object in the payload, exactly as a class list
   * is, and nothing here could see it until now. Not all of it is removable:
   * Next's `fill` images set six positioning declarations inline on every
   * image, which is the framework's and not ours. `repeats` is the actionable
   * half. */
  /* What the named rows do NOT explain. This exists because the class-attribute
   * row was found by a reader asking, once, what the other third of a
   * 1,007,295-byte homepage was, and the next third should not have to wait for
   * somebody to be curious on a different day. */
  console.log(
    `    composition: markup ${a.composition.markupBytes} B + flight ${a.composition.flightBytes} B ` +
      `= ${a.composition.documentBytes} B (exact: ${a.composition.partitionExact}); of the markup, ` +
      `srcset ${a.composition.srcsetMarkup}, class ${a.composition.classMarkup}, style ${a.composition.styleMarkup}, ` +
      `UNEXPLAINED ${a.composition.unexplainedMarkup} B (${a.composition.unexplainedSharePercent.toFixed(1)}%)`,
  )
  console.log(
    `    inline styles ${a.styleAttributes.bytes} B in ${a.styleAttributes.occurrences} attributes ` +
      `(${a.styleAttributes.sharePercent.toFixed(1)}% of the document), ${a.styleAttributes.distinct} distinct, ` +
      `of which ${a.styleAttributes.repeatBytes} B is a value said again`,
  )
  for (const row of a.styleAttributes.byValue.slice(0, 3)) {
    if (row.repeatBytes === 0) break
    console.log(
      `      ${String(row.repeatBytes).padStart(7)} B repeats   ${row.count} x ${row.value.length} chars   ` +
        `${row.value.slice(0, 58)}`,
    )
  }
  for (const c of catalogues) {
    console.log(
      `    catalogue "${c.name}": ${c.bytes} B, ${c.rows} row(s), ${c.distinct} distinct, ` +
        `${c.copies} copy(ies) (${c.sharePercent.toFixed(2)}% of the document)`,
    )
  }
  if (a.sample) {
    console.log(
      `    one candidate is ${a.sample.bytes} B, of which ${a.sample.encodedSrcBytes} B ` +
        `(${a.sample.srcSharePercent.toFixed(1)}%) is the encoded src`,
    )
    console.log(`    ${a.sample.candidate}`)
  }
  for (const r of a.byRole) {
    const each = Math.round(r.candidates / r.images)
    console.log(
      `    ${String(r.bytes).padStart(7)} B  ${String(r.images).padStart(3)} imgs  ` +
        `${String(each).padStart(3)} cands each   sizes=${r.sizes}`,
    )
  }
}

const totals = report.routes.reduce(
  (acc, r) => ({
    documentBytes: acc.documentBytes + r.documentBytes,
    gzipBytes: acc.gzipBytes + r.gzipBytes,
    srcsetBytes: acc.srcsetBytes + r.srcsetBytes,
    candidates: acc.candidates + r.candidates,
  }),
  { documentBytes: 0, gzipBytes: 0, srcsetBytes: 0, candidates: 0 },
)
report.totals = totals
console.log('')
console.log(
  `TOTAL across ${report.routes.length} routes: document ${totals.documentBytes} B raw / ` +
    `${totals.gzipBytes} B gzip, srcset ${totals.srcsetBytes} B in ${totals.candidates} candidates ` +
    `(${((totals.srcsetBytes / totals.documentBytes) * 100).toFixed(1)}%)`,
)

if (outArg) {
  const out = resolve(outArg)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\nwritten ${out}`)
}

if (stopServer) stopServer()
