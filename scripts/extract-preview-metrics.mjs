// Aggregate Lighthouse JSON reports from the preview sweep into a
// single Markdown table. Run after scripts/lh-preview-sweep.mjs.
import { readFileSync } from 'node:fs'

const OUT = 'docs/sprint1/phase-1b/iter-7-production-real-device'
const routes = [
  ['home',          '/'],
  ['events',        '/events'],
  ['city',          '/events/browse/melbourne'],
  ['category',      '/categories/afrobeats'],
  ['event-detail',  '/events/afrobeats-melbourne-summer-sessions'],
  ['organisers',    '/organisers'],
  ['pricing',       '/pricing'],
  ['help',          '/help'],
  ['legal-terms',   '/legal/terms'],
  ['login',         '/login'],
  ['signup',        '/signup'],
]

const fmt = (v, fn) => v == null ? 'n/a' : fn(v)

console.log('| Route | Path | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI | TTFB |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const [label, path] of routes) {
  let row
  try {
    const r = JSON.parse(readFileSync(`${OUT}/${label}.report.json`, 'utf8'))
    const c = r.categories
    const a = r.audits
    row = {
      perf: c.performance?.score,
      a11y: c.accessibility?.score,
      bp: c['best-practices']?.score,
      seo: c.seo?.score,
      fcp: a['first-contentful-paint']?.numericValue,
      lcp: a['largest-contentful-paint']?.numericValue,
      tbt: a['total-blocking-time']?.numericValue,
      cls: a['cumulative-layout-shift']?.numericValue,
      si: a['speed-index']?.numericValue,
      ttfb: a['server-response-time']?.numericValue,
    }
  } catch (_e) {
    console.log(`| ${label} | \`${path}\` | ERROR | | | | | | | | | |`)
    continue
  }
  console.log(
    `| ${label} | \`${path}\` |`,
    fmt(row.perf, x => x.toFixed(2)), '|',
    fmt(row.a11y, x => x.toFixed(2)), '|',
    fmt(row.bp, x => x.toFixed(2)), '|',
    fmt(row.seo, x => x.toFixed(2)), '|',
    fmt(row.fcp, x => Math.round(x)), '|',
    fmt(row.lcp, x => Math.round(x)), '|',
    fmt(row.tbt, x => Math.round(x)), '|',
    fmt(row.cls, x => x.toFixed(3)), '|',
    fmt(row.si, x => Math.round(x)), '|',
    fmt(row.ttfb, x => Math.round(x)), '|',
  )
}
