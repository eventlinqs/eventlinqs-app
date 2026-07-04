// Batch 9.2 - 24 AFTER full-page captures + 5 section captures.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT = 'docs/redesign/batch-9-2-evidence/screenshots/after'
const SECTIONS_OUT = 'docs/redesign/batch-9-2-evidence/sections'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
if (!existsSync(SECTIONS_OUT)) mkdirSync(SECTIONS_OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
]

const PAIRED = [
  { id: 'home',            path: '/' },
  { id: 'communities',        path: '/communities' },
  { id: 'cities',          path: '/cities' },
  { id: 'community-african', path: '/community/african' },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })

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
      await page.evaluate(() => window.scrollTo(0, 1200))
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

// Section-level captures at 1440. Use full-page screenshots, then we crop
// each section by scrolling to it. The 5 new sections plus a baseline:
const SECTIONS = [
  { id: 'hero',     scroll: 0,     description: 'split-state hero' },
  { id: 'chips',    scroll: 700,   description: 'category chip strip' },
  { id: 'trending', scroll: 900,   description: 'bento H8 Trending' },
  { id: 'moments',  scroll: 2400,  description: 'bento H10 Community Moments' },
  { id: 'email',    scroll: 5200,  description: 'email signup panel' },
]

const sectionPage = await ctx.newPage()
await sectionPage.setViewportSize({ width: 1440, height: 900 })
try {
  await sectionPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await sectionPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await sectionPage.waitForTimeout(900)
  for (const s of SECTIONS) {
    await sectionPage.evaluate(y => window.scrollTo(0, y), s.scroll)
    await sectionPage.waitForTimeout(450)
    const file = `${SECTIONS_OUT}/home-section-${s.id}.png`
    await sectionPage.screenshot({ path: file, fullPage: false })
    console.log(`  section ok ${file} (${(statSync(file).size / 1024).toFixed(1)}KB)`)
  }
} catch (e) {
  console.log(`section captures FAIL: ${String(e.message ?? e).slice(0, 140)}`)
}
await sectionPage.close()

await browser.close()
console.log(`\nDone. paired=${captured}/24 fails=${fails} under-30KB=${low}`)
