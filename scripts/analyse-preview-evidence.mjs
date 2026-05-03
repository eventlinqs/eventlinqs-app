// Deeper evidence extraction for Pre-Task 4 Checkpoint 1.
// For each route's Lighthouse JSON, surface:
//   1. Top opportunity audits (negative-impact, score < 0.9) with savings
//   2. Top diagnostic audits with displayValue
//   3. LCP subparts (TTFB / load delay / load duration / render delay)
//   4. LCP element type/url
//   5. Network bytes / requests
//   6. JS bootup + main-thread time
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

const ms = (n) => n == null ? 'n/a' : `${Math.round(n)}ms`
const kib = (n) => n == null ? 'n/a' : `${Math.round(n / 1024)} KiB`

for (const [label] of routes) {
  let r
  try {
    r = JSON.parse(readFileSync(`${OUT}/${label}.report.json`, 'utf8'))
  } catch (e) {
    console.log(`\n## ${label}\n  ERROR reading report: ${e.message}`)
    continue
  }
  const a = r.audits
  const c = r.categories

  console.log(`\n## ${label}`)
  console.log(`  Performance:        ${c.performance?.score ?? 'n/a'}`)
  console.log(`  A11y / BP / SEO:    ${c.accessibility?.score} / ${c['best-practices']?.score} / ${c.seo?.score}`)
  console.log(`  FCP / LCP / TBT:    ${ms(a['first-contentful-paint']?.numericValue)} / ${ms(a['largest-contentful-paint']?.numericValue)} / ${ms(a['total-blocking-time']?.numericValue)}`)
  console.log(`  CLS / SI / TTFB:    ${a['cumulative-layout-shift']?.numericValue?.toFixed(3) ?? 'n/a'} / ${ms(a['speed-index']?.numericValue)} / ${ms(a['server-response-time']?.numericValue)}`)
  console.log(`  Total bytes:        ${kib(a['total-byte-weight']?.numericValue)}`)
  console.log(`  JS bootup:          ${ms(a['bootup-time']?.numericValue)}`)
  console.log(`  Main-thread work:   ${ms(a['mainthread-work-breakdown']?.numericValue)}`)
  console.log(`  DOM size:           ${a['dom-size']?.numericValue ?? 'n/a'} nodes`)

  // LCP element
  const lcpEl = a['largest-contentful-paint-element']
  if (lcpEl?.details?.items?.[0]) {
    const item = lcpEl.details.items[0]
    if (item.node) {
      console.log(`  LCP element:        ${item.node.nodeLabel?.slice(0, 80) ?? '?'}`)
      console.log(`     selector:        ${item.node.selector?.slice(0, 100) ?? '?'}`)
    }
  } else if (lcpEl) {
    console.log(`  LCP element:        ${lcpEl.scoreDisplayMode === 'notApplicable' ? 'NOT APPLICABLE (no LCP fired)' : 'no items'}`)
  }

  // Top opportunities (score < 0.9, with overallSavingsMs)
  const opportunities = Object.values(a)
    .filter((x) => x.details?.type === 'opportunity' && (x.score ?? 1) < 0.9 && x.numericValue > 50)
    .sort((x, y) => (y.numericValue ?? 0) - (x.numericValue ?? 0))
    .slice(0, 5)
  if (opportunities.length) {
    console.log(`  Top opportunities:`)
    for (const o of opportunities) {
      console.log(`    - ${o.id}: ${ms(o.numericValue)} savings (${o.title})`)
    }
  }

  // Failing diagnostics
  const failedDiag = Object.values(a)
    .filter((x) => x.scoreDisplayMode === 'metricSavings' && (x.score ?? 1) < 0.9)
    .sort((x, y) => (x.score ?? 1) - (y.score ?? 1))
    .slice(0, 5)
  if (failedDiag.length) {
    console.log(`  Failing diagnostics:`)
    for (const d of failedDiag) {
      console.log(`    - ${d.id}: score ${d.score?.toFixed(2)} (${d.title})`)
    }
  }

  // A11y violations
  if ((c.accessibility?.score ?? 1) < 1.0) {
    const a11y = Object.values(a).filter(
      (x) => x.score === 0 && r.categories.accessibility.auditRefs.some((ref) => ref.id === x.id),
    )
    console.log(`  A11y failures (${a11y.length}):`)
    for (const v of a11y) {
      console.log(`    - ${v.id}: ${v.title}`)
    }
  }
}
