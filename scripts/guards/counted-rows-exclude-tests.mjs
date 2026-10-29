/**
 * EVERY READ OF A COUNTED HOP LEAVES QA PRESSES OUT (the master mandate of 29 October 2026, sections 10, 13 and 16; the
 * project manager's 21:42 ruling R3; 20261029220001).
 *
 * A QA drive proves the counted hops (/out, /go, /e, /s) on production by pressing them with a verified marker
 * (src/lib/broadcast/qa-marker.ts), and its press is recorded with is_test true so the real writer is exercised. That
 * is only safe while EVERY read of those rows leaves is_test rows out: one read that forgets turns a QA press into a
 * person in an organiser's report, the growth page or an invoice's attribution.
 *
 * So: every select from share_link_events or go_presses under src/ must name is_test in its own chain (normally
 * `.eq('is_test', false)`; a writer's dedupe compares `input.isTest`, so a QA press dedupes only against QA presses).
 * A read that legitimately wants the test rows (the growth page's own QA line) names is_test too, so it passes the
 * same way and says so in its chain. A read pinned to `.eq('kind', 'conversion')` passes without it: a conversion is
 * written only by the order path (src/lib/broadcast/conversion.ts), which never carries a marker.
 *
 * WHAT THIS CANNOT SEE, said here so it is not mistaken for coverage: SQL functions and views. The one SQL reader of
 * share_link_events (20260921000010, the directory ranking) joins conversions to orders, and a QA press is never a
 * conversion with an order; if a SQL reader of clicks, views, outbound presses or go_presses is ever added, it filters
 * is_test itself and is listed here.
 */
import { join, relative, resolve } from 'node:path'
import { sourceFiles } from './lib/source.mjs'
import { selectChainsIn } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[counted-rows-exclude-tests]'
const ROOT = process.cwd()
const COUNTED = new Set(['share_link_events', 'go_presses'])
const WRITES = /\.(insert|upsert|update|delete)\(/

const files = sourceFiles(ROOT)
let reads = 0
let conversionsOnly = 0
const failures = []

for (const file of files) {
  for (const chain of selectChainsIn(file)) {
    if (!COUNTED.has(chain.table)) continue
    const text = chain.fullText ?? chain.text
    if (!/\.select\(/.test(text) && WRITES.test(text)) continue // a write, not a read
    reads += 1
    // A read pinned to conversions cannot hold a QA press: a conversion is written only by the order path
    // (src/lib/broadcast/conversion.ts), which never carries a marker. Judged on this chain's own text.
    if (/\.eq\(\s*'kind'\s*,\s*'conversion'\s*\)/.test(text)) {
      conversionsOnly += 1
      continue
    }
    if (!/is_test/.test(text)) {
      const rel = relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
      failures.push(`${rel}:${chain.line} reads ${chain.table} with no is_test filter, so a QA press would be counted as a person. Add .eq('is_test', false).`)
    }
  }
}

declareWork('counted-rows-exclude-tests', {
  did: { 'source file': files.length, 'read of a counted table': reads, 'read pinned to conversions': conversionsOnly },
  found: { failure: failures.length },
})
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} read(s) of share_link_events or go_presses would count a QA press.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${reads} read(s) of share_link_events and go_presses: ${reads - conversionsOnly} name is_test, ${conversionsOnly} read conversions only, which no QA press can be (${join('src', 'lib', 'broadcast', 'qa-marker.ts')}).`)
