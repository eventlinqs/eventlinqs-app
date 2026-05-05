// Compute median across run1/run2/run3 for the 6 Batch 5.5 culture routes.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const baseDir = process.argv[2] ?? 'docs/redesign/batch-5-evidence/lighthouse'

const routes = [
  'culture-african',
  'culture-south-asian',
  'culture-mediterranean',
  'culture-east-asian',
  'culture-caribbean',
  'culture-latin',
]
const runs = ['run1', 'run2', 'run3']

function loadAll(label) {
  const out = []
  for (const r of runs) {
    const p = join(baseDir, r, `${label}.report.json`)
    if (!existsSync(p)) continue
    try { out.push(JSON.parse(readFileSync(p, 'utf8'))) } catch {}
  }
  return out
}

function median(nums) {
  const v = nums.filter(n => n != null && Number.isFinite(n)).sort((a,b)=>a-b)
  if (v.length === 0) return null
  const m = Math.floor(v.length/2)
  return v.length % 2 ? v[m] : (v[m-1]+v[m])/2
}

const round = (n) => n == null ? 'n/a' : Math.round(n)
const fmt = (n) => n == null ? 'n/a' : Number(n).toFixed(2)

const rows = []
for (const label of routes) {
  const all = loadAll(label)
  const perfs = all.map(j => j.categories?.performance?.score)
  const a11ys = all.map(j => j.categories?.accessibility?.score)
  const bps = all.map(j => j.categories?.['best-practices']?.score)
  const seos = all.map(j => j.categories?.seo?.score)
  const lcps = all.map(j => j.audits?.['largest-contentful-paint']?.numericValue)
  const tbts = all.map(j => j.audits?.['total-blocking-time']?.numericValue)
  const clss = all.map(j => j.audits?.['cumulative-layout-shift']?.numericValue)
  rows.push({
    label,
    perf: median(perfs), a11y: median(a11ys), bp: median(bps), seo: median(seos),
    lcp: median(lcps), tbt: median(tbts), cls: median(clss),
    runs: all.length, raw: perfs,
  })
}

console.log('| Route | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS | Runs |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(
    `| ${r.label} | ${fmt(r.perf)} | ${fmt(r.a11y)} | ${fmt(r.bp)} | ${fmt(r.seo)} | ${round(r.lcp)} | ${round(r.tbt)} | ${r.cls == null ? 'n/a' : Number(r.cls).toFixed(3)} | ${r.runs}/3 |`,
  )
}
