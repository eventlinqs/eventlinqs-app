/**
 * PREVIEW vs PRODUCTION on the two metrics that move between runs, measured
 * back to back on the same machine with the same instrument.
 *
 * The absolute numbers this produces are NOT the gate's: a GitHub runner sits
 * milliseconds from Vercel and this machine does not, and the same page that
 * CI scores 0.95 scores about 0.78 here. What IS valid is the COMPARISON,
 * because both sides are measured within minutes of each other under identical
 * conditions. Three runs per URL, median reported, all values printed.
 *
 * Usage: node tmp-lcp-compare.mjs <previewBase> <productionBase> <previewPath> <productionPath> [label]
 *   Paths without a leading slash; '.' for the root.
 */
import lighthouse from 'lighthouse'
import { launch } from 'chrome-launcher'

const [, , PREVIEW, PROD, PREV_PATH, PROD_PATH, LABEL = 'surface'] = process.argv
const norm = (p) => (p === '.' ? '/' : '/' + p.replace(/^\/+/, ''))
const targets = [
  { side: 'preview', url: PREVIEW + norm(PREV_PATH) },
  { side: 'production', url: PROD + norm(PROD_PATH) },
]

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

console.log(`${LABEL}: 3 runs per side, interleaved so neither side owns a quiet minute`)
const acc = { preview: { perf: [], lcp: [] }, production: { perf: [], lcp: [] } }
for (let run = 1; run <= 3; run += 1) {
  for (const t of targets) {
    const { lhr } = await lighthouse(t.url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      throttlingMethod: 'simulate',
      maxWaitForLoad: 60000,
      pauseAfterLoadMs: 5000,
      networkQuietThresholdMs: 5000,
      cpuQuietThresholdMs: 3000,
      extraHeaders: { Cookie: 'el-audit=1' },
      onlyCategories: ['performance'],
    })
    const perf = lhr.categories.performance.score
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? null
    acc[t.side].perf.push(perf)
    acc[t.side].lcp.push(lcp)
    console.log(`  run ${run} ${t.side.padEnd(10)} perf ${perf}  lcp ${Math.round(lcp)}ms`)
  }
}
try { await chrome.kill() } catch (err) { console.log(`  (chrome teardown: ${String(err?.code || err)})`) }

console.log('')
for (const side of ['preview', 'production']) {
  console.log(`${side.padEnd(10)} perf median ${median(acc[side].perf)} (${acc[side].perf.join(', ')})   lcp median ${Math.round(median(acc[side].lcp))}ms (${acc[side].lcp.map((v) => Math.round(v)).join(', ')})`)
}
