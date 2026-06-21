// Batch 9.1 - Glassmorphism Nav Refactor visual regression captures.
//
// Captures 12 representative routes × 3 viewports × 2 states (top, scrolled)
// = 72 screenshots evidencing the dual-state header end-to-end.
//
// Output paths (spec'd structure):
//   - AFTER  (default): docs/redesign/batch-9-1-evidence/screenshots/after/
//   - BEFORE (override via ELINQS_OUT): docs/redesign/batch-9-1-evidence/screenshots/before/
//
// To capture BEFORE state during a remediation pass, stash 9.1 work
// then invoke with ELINQS_OUT pointed at the before/ subdirectory.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT  = process.env.ELINQS_OUT  ?? 'docs/redesign/batch-9-1-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const ROUTES = [
  { id: 'home',                 path: '/' },
  { id: 'events',               path: '/events' },
  { id: 'events-browse-sydney', path: '/events/browse/sydney' },
  { id: 'community-african',      path: '/community/african' },
  { id: 'community-african-melb', path: '/community/african/melbourne' },
  { id: 'city-sydney',          path: '/city/sydney' },
  { id: 'city-sydney-iw',       path: '/city/sydney/inner-west' },
  { id: 'category-afrobeats',   path: '/categories/afrobeats' },
  { id: 'event-detail',         path: '/events/afrobeats-melbourne-summer-sessions' },
  { id: 'organisers',           path: '/organisers' },
  { id: 'pricing',              path: '/pricing' },
  { id: 'login',                path: '/login' },
]

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsBatch9-1Screenshot/1.0)',
})

async function captureState(page, route, vp, state) {
  const file = `${OUT}/${route.id}-${vp.name}-${state}.png`
  if (state === 'scrolled') {
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(450) // settle 300ms transition + buffer
  }
  await page.screenshot({ path: file, fullPage: false })
  const size = statSync(file).size
  return { file, size }
}

let captured = 0
let underWeight = 0

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      console.log(`→ ${route.path} @ ${vp.name}`)
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      // Hero rasters can lazy-paint after networkidle; small settle buffer.
      await page.waitForTimeout(700)

      const top = await captureState(page, route, vp, 'top')
      const scr = await captureState(page, route, vp, 'scrolled')
      captured += 2
      for (const r of [top, scr]) {
        if (r.size < 30_000) {
          underWeight += 1
          console.log(`  WARN under 30KB: ${r.file} (${r.size} bytes)`)
        } else {
          console.log(`  ok ${r.file} (${(r.size / 1024).toFixed(1)}KB)`)
        }
      }
    } catch (e) {
      console.log(`  FAIL ${route.path} @ ${vp.name}: ${String(e.message ?? e).slice(0, 140)}`)
    }
    await page.close()
  }
}

await browser.close()
console.log(`\nDone. captured=${captured}/72 underWeight=${underWeight}`)
