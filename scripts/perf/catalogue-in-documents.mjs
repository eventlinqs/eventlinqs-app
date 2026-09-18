/**
 * WHAT A REFERENCE CATALOGUE COSTS IN EVERY DOCUMENT THAT CARRIES IT.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8B.1's origin cost table measured the flight payload of four
 * routes and found it was 86.9 percent of the login document: 83,282 bytes of
 * serialised React tree on a page with a form and a photograph on it. Inside
 * that payload, 6,152 bytes were the location picker's city catalogue, present
 * twice, with coordinates, on a page where nobody is choosing a city.
 *
 * A catalogue is the one part of a flight payload that is NOT the page. The
 * markup around it describes what the visitor is looking at; a city list is
 * identical on every route and is read only by a dialog that almost nobody
 * opens. So it is worth counting on its own, and worth counting in the built
 * documents rather than in the source, because the source cannot show you how
 * many times the tree serialised it.
 *
 * ============================================================================
 * WHAT IT READS, AND WHY THAT IS THE BUILD AND NOT A SERVER
 * ============================================================================
 *
 * The prerendered documents `next build` wrote under `.next/server/app`. They
 * are the exact bytes the platform serves for those routes, they exist without
 * starting anything, and they are the same on every run of the same build, so
 * a before-and-after is a comparison rather than two samples.
 *
 * IT THEREFORE SEES ONLY PRERENDERED ROUTES, which is stated here rather than
 * left to be discovered: a dynamic route's document does not exist until a
 * request arrives. What it does see includes `_not-found`, which Next
 * serialises into the payload of EVERY page, so a catalogue visible here is a
 * catalogue on every route in the platform.
 *
 * Run:  node scripts/perf/catalogue-in-documents.mjs
 *       node scripts/perf/catalogue-in-documents.mjs --json > before.json
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { catalogueWeight } from './lib/document-weight.mjs'
import { CATALOGUES } from './lib/catalogues.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(ROOT, '.next', 'server', 'app')
const TAG = '[catalogue-in-documents]'

function documents(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...documents(path))
      continue
    }
    if (name.endsWith('.html')) out.push(path)
  }
  return out
}

export function measureBuiltDocuments({ app = APP } = {}) {
  const files = documents(app).sort()
  const rows = []
  for (const file of files) {
    const html = readFileSync(file, 'utf8')
    const where = relative(app, file).replace(/\\/g, '/')
    for (const catalogue of CATALOGUES) {
      const weight = catalogueWeight(html, {
        marker: catalogue.marker,
        arrayKeys: catalogue.arrayKeys,
      })
      rows.push({
        document: where,
        catalogue: catalogue.name,
        documentBytes: html.length,
        ...weight,
      })
    }
  }
  return { app, documents: files.length, rows }
}

/* `file://` + a Windows path is not the URL Node gives for the same file, so the
   entry-point test goes through pathToFileURL rather than through a join. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(APP)) {
    console.error(`${TAG} no build under .next/server/app. Run node scripts/perf/build-like-the-gate.mjs first.`)
    process.exit(1)
  }
  const result = measureBuiltDocuments()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`${TAG} ${result.documents} prerendered document(s) under .next/server/app`)
    for (const c of CATALOGUES) console.log(`${TAG}   catalogue "${c.name}": ${c.why}`)
    console.log('')
    const carrying = result.rows.filter(r => r.bytes > 0)
    if (carrying.length === 0) {
      console.log(`${TAG} no document carries a registered catalogue.`)
    }
    for (const r of carrying) {
      console.log(
        `${TAG} ${r.document.padEnd(30)} ${r.catalogue.padEnd(14)} ` +
          `doc ${String(r.documentBytes).padStart(8)}  rows ${String(r.rows).padStart(4)}  ` +
          `distinct ${String(r.distinct).padStart(3)}  copies ${String(r.copies).padStart(2)}  ` +
          `bytes ${String(r.bytes).padStart(6)}  ${r.sharePercent.toFixed(2)}%`,
      )
    }
    const total = result.rows.reduce((a, r) => a + r.bytes, 0)
    console.log('')
    console.log(`${TAG} ${total} catalogue byte(s) across ${result.documents} prerendered document(s).`)
  }
}
