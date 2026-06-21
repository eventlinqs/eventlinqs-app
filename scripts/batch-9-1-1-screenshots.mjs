// Batch 9.1.1 - 48 AFTER screenshot captures.
//
// Coverage per Section 9.2 of the batch brief:
//   - 5 existing pages × 3 viewports × 2 states = 30
//   - 2 new index pages × 3 viewports × 2 states = 12
//   - /account × 3 viewports × 1 state         =  3 (anonymous redirects to /login)
//   - authenticated home × 3 viewports × 1 state =  3 (authenticated state)
//   - Total                                    = 48
//
// Authenticated captures require a Supabase session cookie. Without one, the
// /account page redirects to /login and the homepage renders the anonymous
// header. The script attempts authenticated captures only when the
// ELINQS_TEST_USER_COOKIE env var carries a valid `sb-*-auth-token` cookie
// value; otherwise the auth slots are skipped and the script reports the
// gap honestly (DEFERRED-WITH-ESCALATION in the closure report).
//
// Output: docs/redesign/batch-9-1-1-evidence/screenshots/after/{slug}-{vp}-{state}.png
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT  = 'docs/redesign/batch-9-1-1-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
]

const PAIRED = [
  { id: 'home',            path: '/' },
  { id: 'events',          path: '/events' },
  { id: 'community-african', path: '/community/african' },
  { id: 'city-sydney',     path: '/city/sydney' },
  { id: 'legal-terms',     path: '/legal/terms' },
  { id: 'communities',        path: '/communities' },
  { id: 'cities',          path: '/cities' },
]

// /account anonymous redirects to /login; capture top state at all viewports.
const SINGLE_STATE = [
  { id: 'account', path: '/account' },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsBatch9-1-1Screenshot/1.0)',
})

let captured = 0, low = 0, fails = 0

async function captureRoute(route, vp, state) {
  const file = `${OUT}/${route.id}-${vp.name}-${state}.png`
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.w, height: vp.h })
  try {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(700)
    if (state === 'scrolled') {
      await page.evaluate(() => window.scrollTo(0, 600))
      await page.waitForTimeout(450)
    }
    await page.screenshot({ path: file, fullPage: false })
    const size = statSync(file).size
    captured++
    if (size < 30_000) {
      low++
      console.log(`  WARN under 30KB ${file} (${size} bytes)`)
    } else {
      console.log(`  ok ${file} (${(size / 1024).toFixed(1)}KB)`)
    }
  } catch (e) {
    fails++
    console.log(`  FAIL ${file}: ${String(e.message ?? e).slice(0, 140)}`)
  }
  await page.close()
}

for (const route of PAIRED) {
  for (const vp of VIEWPORTS) {
    for (const state of ['top', 'scrolled']) {
      console.log(`→ ${route.path} @ ${vp.name} ${state}`)
      await captureRoute(route, vp, state)
    }
  }
}

for (const route of SINGLE_STATE) {
  for (const vp of VIEWPORTS) {
    console.log(`→ ${route.path} @ ${vp.name} top`)
    await captureRoute(route, vp, 'top')
  }
}

// Authenticated state captures: skipped without test-user cookie.
const cookieRaw = process.env.ELINQS_TEST_USER_COOKIE
let authCaptured = 0
if (cookieRaw) {
  const authCtx = await browser.newContext({
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (compatible; EventLinqsBatch9-1-1Screenshot/1.0)',
  })
  await authCtx.addCookies(JSON.parse(cookieRaw))
  for (const vp of VIEWPORTS) {
    const file = `${OUT}/home-auth-${vp.name}-top.png`
    const page = await authCtx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(900)
      await page.screenshot({ path: file, fullPage: false })
      authCaptured++
      console.log(`  AUTH ok ${file} (${(statSync(file).size / 1024).toFixed(1)}KB)`)
    } catch (e) {
      console.log(`  AUTH FAIL ${file}: ${String(e.message ?? e).slice(0, 140)}`)
    }
    await page.close()
  }
}

await browser.close()
console.log(`\nDone. anon=${captured} auth=${authCaptured} fails=${fails} under-30KB=${low}`)
