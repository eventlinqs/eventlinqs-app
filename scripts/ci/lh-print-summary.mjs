// Print the median Lighthouse category scores per URL from a completed
// `lhci collect` run (.lighthouseci/lhr-*.json). Runs with `if: always()`
// so the actual measured scores are visible in the CI log on both pass and
// fail - this is the evidence the gate floors are calibrated against
// (docs/perf/v2/gate-to-law.md).
import { readdirSync, readFileSync } from 'node:fs'

const DIR = '.lighthouseci'
let files
try {
  files = readdirSync(DIR).filter(f => /^lhr-.*\.json$/.test(f))
} catch {
  console.log('No .lighthouseci directory found (collect did not run).')
  process.exit(0)
}
if (files.length === 0) {
  console.log('No lhr-*.json reports found.')
  process.exit(0)
}

const CATS = ['performance', 'accessibility', 'best-practices', 'seo']
const byUrl = new Map()

for (const f of files) {
  let lhr
  try {
    lhr = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  } catch {
    continue
  }
  const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || 'unknown'
  if (!byUrl.has(url)) byUrl.set(url, [])
  byUrl.get(url).push(lhr)
}

const median = arr => {
  const s = arr.filter(n => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const fmt = n => (n == null ? ' n/a ' : (n * 100).toFixed(0).padStart(4) + ' ')
const fmtMs = n => (n == null ? '   n/a' : Math.round(n).toString().padStart(6))

console.log('')
console.log('Median-of-' + Math.max(...[...byUrl.values()].map(a => a.length)) + ' Lighthouse scores (this form factor):')
console.log('  perf  a11y   bp   seo |    LCP    TBT    CLS    FCP     SI | url')
console.log('  ' + '-'.repeat(96))

for (const [url, runs] of byUrl) {
  const score = cat => median(runs.map(r => r.categories?.[cat]?.score))
  const audit = id => median(runs.map(r => r.audits?.[id]?.numericValue))
  const cls = median(runs.map(r => r.audits?.['cumulative-layout-shift']?.numericValue))
  const row =
    fmt(score('performance')) +
    fmt(score('accessibility')) +
    fmt(score('best-practices')) +
    fmt(score('seo')) +
    '|' +
    fmtMs(audit('largest-contentful-paint')) +
    fmtMs(audit('total-blocking-time')) +
    (cls == null ? '   n/a' : cls.toFixed(3).padStart(6)) +
    fmtMs(audit('first-contentful-paint')) +
    fmtMs(audit('speed-index')) +
    ' | ' +
    url
  console.log('  ' + row)
}
console.log('')
