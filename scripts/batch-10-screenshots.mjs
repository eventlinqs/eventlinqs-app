// Batch 10 - visual regression captures across 11 page types.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT = 'docs/redesign/batch-10-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
]

const ROUTES = [
  { id: 'home',                  path: '/' },
  { id: 'cultures',              path: '/cultures' },
  { id: 'cities',                path: '/cities' },
  { id: 'culture-african',       path: '/culture/african' },
  { id: 'city-sydney',           path: '/city/sydney' },
  { id: 'culture-african-sydney',path: '/culture/african/sydney' },
  { id: 'events',                path: '/events' },
  { id: 'pricing',               path: '/pricing' },
  { id: 'organisers',            path: '/organisers' },
  { id: 'legal-terms',           path: '/legal/terms' },
  { id: 'login',                 path: '/login' },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })

let captured = 0, fails = 0, low = 0

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const file = `${OUT}/${route.id}-${vp.name}.png`
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(700)
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
}

await browser.close()
console.log(`\nDone. captured=${captured}/${ROUTES.length * VIEWPORTS.length} fails=${fails} under-30KB=${low}`)
