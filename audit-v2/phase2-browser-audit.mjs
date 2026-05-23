// Phase 2: Live browser audit — every public page, desktop + mobile.
//
// Renders each URL in a real headless browser, captures HTTP status,
// console errors, pageerror exceptions, 4xx/5xx network responses,
// and a screenshot. Mobile viewport runs first because that is where
// React #185 surfaced and was missed by the previous static audit.
//
// Output: audit-v2/evidence/phase2-results.json + screenshots/*.png.
import { chromium, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.AUDIT_BASE_URL || 'https://www.eventlinqs.com'
const ROOT = path.resolve('audit-v2')
const SHOTS = path.join(ROOT, 'screenshots')
const RESULTS = path.join(ROOT, 'evidence', 'phase2-results.json')
const OBSERVE_MS = 5000

const PAGES = [
  '/',
  '/events',
  '/events/africultures-festival-sydney-2027',
  '/events/pasifika-festival-melbourne-2027',
  '/events/diwali-mela-brisbane-2026',
  '/city/sydney',
  '/city/melbourne',
  '/city/brisbane',
  '/culture/african',
  '/culture/indian',
  '/culture/filipino',
  '/organisers',
  '/organisers/owambe-sydney',
  '/organisers/afrobeats-melbourne',
  '/organisers/gospel-brisbane',
  '/pricing',
  '/help',
  '/contact',
  '/for-organisers',
  '/legal/terms',
  '/legal/privacy',
  '/legal/refunds',
  '/legal/cookies',
  '/legal/organiser-terms',
  '/sign-in',
  '/sign-up',
  '/tickets',
  '/admin/login',
]

const VIEWPORTS = [
  { name: 'mobile', device: devices['iPhone 12 Pro'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, userAgent: undefined },
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function safeName(s) {
  return s.replace(/^\//, 'root').replace(/[\/]/g, '_').replace(/[^a-z0-9_-]/gi, '-') || 'root'
}

async function auditOnePage(browser, urlPath, vp) {
  const contextOpts = vp.device ? { ...vp.device } : { viewport: vp.viewport, userAgent: vp.userAgent }
  const context = await browser.newContext({ ...contextOpts, ignoreHTTPSErrors: true })
  const page = await context.newPage()

  const result = {
    path: urlPath,
    viewport: vp.name,
    httpStatus: null,
    loadTimeMs: null,
    consoleErrors: [],
    pageErrors: [],
    badResponses: [],
    visibleErrorText: null,
    screenshot: null,
    navError: null,
  }

  page.on('console', msg => {
    if (msg.type() === 'error') {
      result.consoleErrors.push({ text: msg.text().slice(0, 500), location: msg.location() })
    }
  })
  page.on('pageerror', err => {
    result.pageErrors.push({ message: String(err.message || err).slice(0, 500), stack: String(err.stack || '').slice(0, 800) })
  })
  page.on('response', resp => {
    const s = resp.status()
    if (s >= 400) {
      result.badResponses.push({ url: resp.url(), status: s, method: resp.request().method() })
    }
  })

  const url = BASE + urlPath
  const start = Date.now()
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    result.httpStatus = resp ? resp.status() : null
    result.loadTimeMs = Date.now() - start
    await sleep(OBSERVE_MS)
    // Look for visible error boundary text
    const boundary = await page.evaluate(() => {
      const candidates = [
        'We hit a snag',
        'Something went wrong',
        'Application error',
        'Page not found',
        '500',
        'Internal Server Error',
      ]
      const body = document.body?.innerText || ''
      for (const c of candidates) {
        if (body.toLowerCase().includes(c.toLowerCase())) return c
      }
      return null
    }).catch(() => null)
    result.visibleErrorText = boundary
    const shotName = `${safeName(urlPath)}_${vp.name}.png`
    const shotPath = path.join(SHOTS, shotName)
    await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {})
    result.screenshot = path.relative(ROOT, shotPath).replace(/\\/g, '/')
  } catch (err) {
    result.navError = String(err.message || err).slice(0, 500)
    result.loadTimeMs = Date.now() - start
  } finally {
    await context.close()
  }
  return result
}

async function main() {
  await mkdir(SHOTS, { recursive: true })
  await mkdir(path.dirname(RESULTS), { recursive: true })
  const browser = await chromium.launch()
  const all = []
  // Run mobile first (React #185 surface) then desktop, per the audit brief.
  for (const vp of VIEWPORTS) {
    process.stdout.write(`\n=== ${vp.name.toUpperCase()} viewport ===\n`)
    for (const p of PAGES) {
      const r = await auditOnePage(browser, p, vp)
      const flagBits = []
      if (r.httpStatus && r.httpStatus >= 400) flagBits.push(`HTTP ${r.httpStatus}`)
      if (r.pageErrors.length) flagBits.push(`pageerror×${r.pageErrors.length}`)
      if (r.consoleErrors.length) flagBits.push(`console×${r.consoleErrors.length}`)
      if (r.navError) flagBits.push('NAV-FAIL')
      const flag = flagBits.length ? ` [${flagBits.join(', ')}]` : ''
      process.stdout.write(`  ${vp.name.padEnd(7)} ${String(r.httpStatus ?? '---').padEnd(4)} ${String(r.loadTimeMs).padStart(5)}ms  ${p}${flag}\n`)
      all.push(r)
    }
  }
  await browser.close()
  await writeFile(RESULTS, JSON.stringify(all, null, 2))
  // Summary
  const fail = all.filter(r => (r.httpStatus && r.httpStatus >= 400) || r.pageErrors.length || r.navError)
  process.stdout.write(`\n=== SUMMARY ===\nTotal page-renders: ${all.length}\nPages with issues: ${fail.length}\n`)
  for (const f of fail) {
    process.stdout.write(`  ${f.viewport.padEnd(7)} ${f.path}\n`)
  }
  process.stdout.write(`\nResults: ${RESULTS}\nScreenshots: ${SHOTS}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
