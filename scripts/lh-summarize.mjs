import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('usage: node lh-summarize.mjs <dir>'); process.exit(1) }

const order = ['home','events','city','category','event-detail','organisers','pricing','help','legal-terms','login','signup']
const files = readdirSync(dir).filter(f => f.endsWith('.report.json'))
files.sort((a,b) => order.indexOf(a.replace('.report.json','')) - order.indexOf(b.replace('.report.json','')))

const round = (n) => Math.round(n)
const fmt = (n) => n == null ? 'n/a' : Number(n).toFixed(2)

console.log('| Route | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const file of files) {
  const label = file.replace('.report.json','')
  let j
  try { j = JSON.parse(readFileSync(join(dir, file), 'utf8')) }
  catch { console.log(`| ${label} | parse-err |||||||||`); continue }
  const c = j.categories ?? {}
  const a = j.audits ?? {}
  const lcp = a['largest-contentful-paint']?.numericValue
  const tbt = a['total-blocking-time']?.numericValue
  const cls = a['cumulative-layout-shift']?.numericValue
  const si  = a['speed-index']?.numericValue
  const fcp = a['first-contentful-paint']?.numericValue
  console.log(`| ${label} | ${fmt(c.performance?.score)} | ${fmt(c.accessibility?.score)} | ${fmt(c['best-practices']?.score)} | ${fmt(c.seo?.score)} | ${lcp == null ? 'n/a' : round(lcp)+'ms'} | ${tbt == null ? 'n/a' : round(tbt)+'ms'} | ${cls == null ? 'n/a' : Number(cls).toFixed(3)} | ${si == null ? 'n/a' : round(si)+'ms'} | ${fcp == null ? 'n/a' : round(fcp)+'ms'} |`)
}
