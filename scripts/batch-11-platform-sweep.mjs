// Batch 11 - platform-wide header + console verification.
//
// Visits every public route at desktop 1440 and mobile 390, captures
// top (scroll=0) and scrolled (scroll=1000) screenshots of the header
// strip, and records the browser console for 404s and red errors.
//
// Output:
//   docs/redesign/batch-11-evidence/header-verify/<route>-<vp>-{top,scrolled}.png
//   docs/redesign/batch-11-evidence/console-audit/<route>-<vp>.json
//
// Routes selected from the founder's Batch 11 platform inventory.
// Auth-gated routes (/account, /dashboard*, /admin*) are skipped at
// this layer - they're guarded by middleware and need a separate
// authenticated-session sweep.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:3007'
const HDR_OUT = 'docs/redesign/batch-11-evidence/header-verify'
const CON_OUT = 'docs/redesign/batch-11-evidence/console-audit'
for (const d of [HDR_OUT, CON_OUT]) if (!existsSync(d)) mkdirSync(d, { recursive: true })

const routes = [
  // Homepage
  ['home',                       '/'],
  // Browse + events
  ['events',                     '/events'],
  ['events-slug-1',              '/events/diwali-festival-melbourne-festival-of-lights'],
  ['events-slug-2',              '/events/afrobeats-live-headline-concert'],
  ['events-slug-3',              '/events/latin-sabor-sydney-salsa-saturdays'],
  ['events-slug-4',              '/events/filipino-fiesta-brisbane-sariwa-sunday'],
  ['events-slug-5',              '/events/caribbean-carnival-melbourne-soca-saturday'],
  ['events-browse-city',         '/events/browse/sydney'],
  // Communities
  ['community-african',            '/community/african'],
  ['community-south-asian',        '/community/south-asian'],
  ['community-caribbean',          '/community/caribbean'],
  ['community-latin',              '/community/latin'],
  ['community-pacific',            '/community/pacific'],
  ['communities-index',             '/communities'],
  // Intersections
  ['community-african-sydney',     '/community/african/sydney'],
  ['community-south-asian-melb',   '/community/south-asian/melbourne'],
  ['community-caribbean-melb',     '/community/caribbean/melbourne'],
  ['community-pacific-sydney',     '/community/pacific/sydney'],
  ['community-latin-sydney',       '/community/latin/sydney'],
  // Cities
  ['city-sydney',                '/city/sydney'],
  ['city-melbourne',             '/city/melbourne'],
  ['city-brisbane',              '/city/brisbane'],
  ['city-perth',                 '/city/perth'],
  ['city-adelaide',              '/city/adelaide'],
  ['city-canberra',              '/city/canberra'],
  ['city-hobart',                '/city/hobart'],
  ['city-darwin',                '/city/darwin'],
  ['cities-index',               '/cities'],
  // Organisers + venues
  ['organisers',                 '/organisers'],
  ['organisers-signup',          '/organisers/signup'],
  // Marketing
  ['pricing',                    '/pricing'],
  ['about',                      '/about'],
  ['careers',                    '/careers'],
  ['contact',                    '/contact'],
  ['press',                      '/press'],
  ['blog',                       '/blog'],
  ['help',                       '/help'],
  // Legal
  ['legal-terms',                '/legal/terms'],
  ['legal-privacy',              '/legal/privacy'],
  ['legal-refunds',              '/legal/refunds'],
  ['legal-cookies',              '/legal/cookies'],
  ['legal-accessibility',        '/legal/accessibility'],
  ['legal-organiser-terms',      '/legal/organiser-terms'],
  // Auth
  ['login',                      '/login'],
  ['signup',                     '/signup'],
  ['forgot-password',            '/forgot-password'],
  ['verify-email-sent',          '/verify-email-sent'],
]

const viewports = [
  ['mobile-390',  { width: 390,  height: 844 }],
  ['desktop-1440', { width: 1440, height: 900 }],
]

const summary = []

const browser = await chromium.launch({ headless: true })
for (const [routeLabel, path] of routes) {
  for (const [vpLabel, vp] of viewports) {
    const console404s = []
    const consoleErrors = []
    const consoleWarns = []
    const failedRequests = []
    const httpStatus = { status: null, ok: false }

    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
    const page = await context.newPage()

    page.on('console', msg => {
      const type = msg.type()
      const text = msg.text()
      if (type === 'error') consoleErrors.push(text.slice(0, 400))
      else if (type === 'warning') consoleWarns.push(text.slice(0, 400))
    })
    page.on('pageerror', err => {
      consoleErrors.push(`pageerror: ${err.message?.slice(0, 400)}`)
    })
    page.on('requestfailed', req => {
      failedRequests.push({
        url: req.url().slice(0, 200),
        method: req.method(),
        failure: req.failure()?.errorText,
      })
    })
    page.on('response', resp => {
      if (resp.status() === 404) {
        console404s.push({ url: resp.url().slice(0, 200), status: 404 })
      }
    })

    const url = BASE + path
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
      httpStatus.status = resp?.status()
      httpStatus.ok = resp?.ok() ?? false
      await page.waitForTimeout(700)
      await page.screenshot({
        path: `${HDR_OUT}/${routeLabel}-${vpLabel}-top.png`,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 200) },
      })
      // Scroll to 1000px to trigger State B and capture the scrolled
      // header strip. Use 'instant' so the screenshot lands before any
      // transition completes.
      await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }))
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `${HDR_OUT}/${routeLabel}-${vpLabel}-scrolled.png`,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 160) },
      })

      const report = {
        route: path,
        viewport: vpLabel,
        status: httpStatus.status,
        ok: httpStatus.ok,
        consoleErrors,
        consoleWarns: consoleWarns.slice(0, 20),
        console404s,
        failedRequests,
      }
      writeFileSync(`${CON_OUT}/${routeLabel}-${vpLabel}.json`, JSON.stringify(report, null, 2), 'utf8')

      const verdict = httpStatus.ok && consoleErrors.length === 0 && console404s.length === 0
        ? 'CLEAN'
        : `ISSUES (err=${consoleErrors.length}, 404=${console404s.length}, http=${httpStatus.status})`
      summary.push([routeLabel, vpLabel, verdict])
      console.log(`  ${routeLabel.padEnd(28)} ${vpLabel.padEnd(15)} ${verdict}`)
    } catch (e) {
      summary.push([routeLabel, vpLabel, `ERROR: ${e.message?.slice(0, 60)}`])
      console.log(`  ${routeLabel.padEnd(28)} ${vpLabel.padEnd(15)} ERR: ${e.message?.slice(0, 80)}`)
    }
    await context.close()
  }
}
await browser.close()

console.log('\n=== Summary ===')
const clean = summary.filter(s => s[2] === 'CLEAN').length
const issues = summary.filter(s => s[2].startsWith('ISSUES')).length
const errored = summary.filter(s => s[2].startsWith('ERROR')).length
console.log(`Total: ${summary.length} | CLEAN: ${clean} | ISSUES: ${issues} | ERROR: ${errored}`)
for (const [r, v, verdict] of summary) {
  if (verdict !== 'CLEAN') console.log(`  ${r} ${v} -> ${verdict}`)
}
