// Summarises Lighthouse JSON reports in a target dir into a markdown table.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node lh-summary.mjs <dir>')
  process.exit(1)
}

const files = readdirSync(dir).filter(f => f.endsWith('.report.json'))
const order = ['home', 'events', 'city', 'category', 'event-detail', 'organisers', 'pricing', 'help', 'legal-terms', 'login', 'signup']
files.sort((a, b) => order.indexOf(a.replace('.report.json', '')) - order.indexOf(b.replace('.report.json', '')))

const pct = n => (n == null ? 'n/a' : Number(n).toFixed(2))

console.log('| Route | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS | FCP (ms) |')
console.log('|---|---|---|---|---|---|---|---|---|')

const rows = []
for (const file of files) {
  const label = file.replace('.report.json', '')
  let json
  try {
    json = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  } catch (_e) {
    console.log(`| ${label} | (parse error) | | | | | | | |`)
    continue
  }
  const c = json.categories ?? {}
  const a = json.audits ?? {}
  const lcp = a['largest-contentful-paint']?.numericValue
  const tbt = a['total-blocking-time']?.numericValue
  const cls = a['cumulative-layout-shift']?.numericValue
  const fcp = a['first-contentful-paint']?.numericValue
  const perf = c.performance?.score
  const a11y = c.accessibility?.score
  const bp = c['best-practices']?.score
  const seo = c.seo?.score
  rows.push({ label, perf, a11y, bp, seo, lcp, tbt, cls, fcp })
  console.log(`| ${label} | ${pct(perf)} | ${pct(a11y)} | ${pct(bp)} | ${pct(seo)} | ${lcp == null ? 'n/a' : Math.round(lcp)} | ${tbt == null ? 'n/a' : Math.round(tbt)} | ${cls == null ? 'n/a' : cls.toFixed(3)} | ${fcp == null ? 'n/a' : Math.round(fcp)} |`)
}

// gate summary
console.log('')
console.log('## Locked-standard gate per route')
console.log('')
for (const r of rows) {
  const reasons = []
  if (r.perf == null) reasons.push('no perf')
  else if (r.perf < 0.95) reasons.push(`perf ${pct(r.perf)} < 0.95`)
  if (r.a11y !== 1) reasons.push(`a11y ${pct(r.a11y)}`)
  if (r.bp !== 1) reasons.push(`bp ${pct(r.bp)}`)
  if (r.seo !== 1) reasons.push(`seo ${pct(r.seo)}`)
  if (r.lcp != null && r.lcp > 2500) reasons.push(`lcp ${Math.round(r.lcp)}ms > 2500`)
  if (r.tbt != null && r.tbt > 300) reasons.push(`tbt ${Math.round(r.tbt)}ms > 300`)
  if (r.cls != null && r.cls > 0.1) reasons.push(`cls ${r.cls.toFixed(3)} > 0.1`)
  console.log(`- **${r.label}**: ${reasons.length === 0 ? 'PASS' : 'FAIL — ' + reasons.join(', ')}`)
}
