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
import { dirname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'

const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let base = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const outArg = args.find(a => a.startsWith('--out='))?.split('=')[1]
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

/**
 * Every srcset-bearing attribute in the document: `srcset` on an <img> and
 * `imagesrcset` on a preload <link>. Next serves the latter lower-cased in the
 * HTML even though the React prop is `imageSrcSet`, so the match is
 * case-insensitive rather than trusting either spelling.
 */
const SRCSET = /\b(?:image)?srcset="([^"]*)"/gi
const SIZES_ATTR = /\b(?:image)?sizes="([^"]*)"/i

function analyse(html) {
  const total = html.length
  const gz = gzipSync(Buffer.from(html)).length
  let srcsetBytes = 0
  let candidates = 0
  let firstCandidate = null
  const byRole = new Map()

  /*
   * The `sizes` that produced a given `srcset` is the one in the SAME tag, so
   * tags are walked rather than the two attribute lists being zipped together.
   * Zipping them silently mis-attributes every cost the moment one tag carries
   * a srcset and no sizes, which is exactly what a fixed-width image looks like
   * after it is fixed.
   */
  for (const tag of html.matchAll(/<(?:img|link)\b[^>]*>/g)) {
    const text = tag[0]
    SRCSET.lastIndex = 0
    const set = SRCSET.exec(text)
    if (!set) continue
    const value = set[1]
    const n = value.split(',').length
    if (firstCandidate === null) firstCandidate = value.split(',')[0].trim()
    const role = text.match(SIZES_ATTR)?.[1] ?? '(no sizes: fixed width, x descriptors)'
    srcsetBytes += value.length
    candidates += n
    const entry = byRole.get(role) ?? { images: 0, candidates: 0, bytes: 0 }
    entry.images += 1
    entry.candidates += n
    entry.bytes += value.length
    byRole.set(role, entry)
  }

  /*
   * ONE CANDIDATE, VERBATIM, AND ITS PARTS. A count and a total cannot tell you
   * WHY a candidate costs what it costs, and the two levers are different work:
   * fewer candidates is a framework question, shorter candidates is a src
   * question. The sample is the served bytes, never a reconstruction.
   */
  const sample = firstCandidate
    ? (() => {
        const url = firstCandidate.split(' ')[0]
        const encodedSrc = /[?&]url=([^&]*)/.exec(url)?.[1] ?? ''
        return {
          candidate: firstCandidate,
          bytes: firstCandidate.length,
          encodedSrcBytes: encodedSrc.length,
          decodedSrc: decodeURIComponent(encodedSrc),
          srcSharePercent:
            firstCandidate.length === 0 ? 0 : (encodedSrc.length / firstCandidate.length) * 100,
        }
      })()
    : null

  return {
    documentBytes: total,
    gzipBytes: gz,
    sample,
    srcsetBytes,
    candidates,
    sharePercent: total === 0 ? 0 : (srcsetBytes / total) * 100,
    byRole: [...byRole.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([sizes, v]) => ({ sizes, ...v })),
  }
}

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
  const a = analyse(html)
  report.routes.push({ path, ...a })

  console.log('')
  console.log(`${path}`)
  console.log(
    `  document ${a.documentBytes} B raw / ${a.gzipBytes} B gzip     srcset ${a.srcsetBytes} B` +
      ` in ${a.candidates} candidates  (${a.sharePercent.toFixed(1)}% of the document)`,
  )
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
