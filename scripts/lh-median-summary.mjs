// Compute median across run1/run2/run3 directories.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const baseDir = process.argv[2]
if (!baseDir) { console.error('usage: node lh-median-summary.mjs <iter-dir-with-run1-run2-run3>'); process.exit(1) }

const order = ['home','events','city','category','event-detail','organisers','pricing','help','legal-terms','login','signup']
const runs = ['run1','run2','run3']

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
  const valid = nums.filter(n => n != null && Number.isFinite(n))
  if (valid.length === 0) return null
  valid.sort((a,b)=>a-b)
  const m = Math.floor(valid.length/2)
  return valid.length % 2 ? valid[m] : (valid[m-1]+valid[m])/2
}

const round = (n) => n == null ? 'n/a' : Math.round(n)
const fmt = (n) => n == null ? 'n/a' : Number(n).toFixed(2)

console.log('| Route | Perf (med) | LCP (med) | TBT (med) | CLS (med) | SI (med) | FCP (med) | Runs |')
console.log('|---|---|---|---|---|---|---|---|')
for (const label of order) {
  const all = loadAll(label)
  const perfs = all.map(j => j.categories?.performance?.score)
  const lcps = all.map(j => j.audits?.['largest-contentful-paint']?.numericValue)
  const tbts = all.map(j => j.audits?.['total-blocking-time']?.numericValue)
  const clss = all.map(j => j.audits?.['cumulative-layout-shift']?.numericValue)
  const sis = all.map(j => j.audits?.['speed-index']?.numericValue)
  const fcps = all.map(j => j.audits?.['first-contentful-paint']?.numericValue)
  const mPerf = median(perfs)
  const mLcp = median(lcps)
  const mTbt = median(tbts)
  const mCls = median(clss)
  const mSi = median(sis)
  const mFcp = median(fcps)
  const runStr = `${all.length}/3 (${perfs.map(p => p == null ? 'n/a' : p.toFixed(2)).join(', ')})`
  console.log(`| ${label} | ${fmt(mPerf)} | ${mLcp == null ? 'n/a' : round(mLcp)+'ms'} | ${mTbt == null ? 'n/a' : round(mTbt)+'ms'} | ${mCls == null ? 'n/a' : Number(mCls).toFixed(3)} | ${mSi == null ? 'n/a' : round(mSi)+'ms'} | ${mFcp == null ? 'n/a' : round(mFcp)+'ms'} | ${runStr} |`)
}
