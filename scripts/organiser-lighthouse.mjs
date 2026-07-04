// Organiser rebuild - Lighthouse median runner via the programmatic API.
// The Windows chrome-launcher teardown throws EPERM cleaning its temp dir
// AFTER the run completes; we capture scores first and swallow teardown errors.
// el-audit cookie => motion off (matches the CI gate). Warms next/image first.
import { chromium } from 'playwright'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const URL = 'http://localhost:3000/organisers'
const RUNS = 3

async function warm() {
  const b = await chromium.launch({ headless: true })
  const ctx = await b.newContext({ extraHTTPHeaders: { Cookie: 'el-audit=1' } })
  for (const w of [1440, 390]) {
    const p = await ctx.newPage()
    await p.setViewportSize({ width: w, height: 900 })
    await p.goto(URL, { waitUntil: 'networkidle', timeout: 90000 })
    await p.evaluate(async () => {
      await new Promise(r => { let y = 0; const s = () => { window.scrollTo(0, y); y += 600; if (y < document.body.scrollHeight) setTimeout(s, 80); else r() }; s() })
    })
    await p.close()
  }
  await b.close()
}

function median(nums) {
  const s = nums.filter(n => !Number.isNaN(n)).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

async function once(formFactor) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  let cats, lcp, cls
  try {
    const opts = {
      port: chrome.port,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      extraHeaders: { Cookie: 'el-audit=1' },
      maxWaitForLoad: 60000,
      formFactor,
      screenEmulation: formFactor === 'desktop'
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    }
    const result = await lighthouse(URL, opts)
    cats = result.lhr.categories
    lcp = result.lhr.audits['largest-contentful-paint']?.displayValue
    cls = result.lhr.audits['cumulative-layout-shift']?.displayValue
  } finally {
    try { await chrome.kill() } catch { /* swallow EPERM teardown on Windows */ }
  }
  return {
    perf: Math.round((cats.performance.score ?? NaN) * 100),
    a11y: Math.round((cats.accessibility.score ?? NaN) * 100),
    bp: Math.round((cats['best-practices'].score ?? NaN) * 100),
    seo: Math.round((cats.seo.score ?? NaN) * 100),
    lcp, cls,
  }
}

async function suite(formFactor) {
  const runs = []
  for (let i = 1; i <= RUNS; i++) {
    const r = await once(formFactor)
    runs.push(r)
    console.log(`  [${formFactor} ${i}] perf=${r.perf} a11y=${r.a11y} bp=${r.bp} seo=${r.seo} lcp=${r.lcp} cls=${r.cls}`)
  }
  console.log(`[${formFactor}] MEDIAN perf=${median(runs.map(r => r.perf))} a11y=${median(runs.map(r => r.a11y))} bp=${median(runs.map(r => r.bp))} seo=${median(runs.map(r => r.seo))}`)
}

console.log('warming next/image...')
await warm()
console.log('lighthouse mobile...')
await suite('mobile')
console.log('lighthouse desktop...')
await suite('desktop')
console.log('done')
process.exit(0)
