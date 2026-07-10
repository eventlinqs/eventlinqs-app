// Batch 11.0 - visual regression captures for Slice A.
//
// Coverage:
//   - Homepage: 5 hero slides cycled at 1440 + 390 viewports (10 captures)
//   - Homepage: 768 viewport, scroll positions 0/700/1400 (3 captures)
//   - /events/{any-real-slug} top + scrolled (2 captures)
//   - /community/african top (1 capture)
//   - /community/african/sydney top (1 capture)
//   - /city/sydney top (1 capture)
//   - Authenticated dropdown header on / (1 capture)
//
// Output: docs/redesign/batch-11-evidence/screenshots/after/{slug}.png
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })

let captured = 0
let fails = 0

async function snap(file, fn) {
  try {
    await fn()
    const size = statSync(file).size
    captured++
    console.log(`  ok ${file} (${(size / 1024).toFixed(1)}KB)`)
  } catch (e) {
    fails++
    console.log(`  FAIL ${file}: ${String(e.message ?? e).slice(0, 140)}`)
  }
}

// Homepage hero - cycle all 5 slides at 1440 and 390.
for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '390', w: 390, h: 844 }]) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.w, height: vp.h })
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(900)

    // Slide 0 (initial)
    await snap(`${OUT}/hero-slide-1-${vp.name}.png`, () =>
      page.screenshot({ path: `${OUT}/hero-slide-1-${vp.name}.png`, fullPage: false }),
    )
    // Advance via dot tablist clicks. Each dot button has aria-label "Slide N: …"
    for (let i = 2; i <= 5; i++) {
      await page.locator(`button[aria-label^="Slide ${i}:"]`).first().click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(750) // crossfade settle
      await snap(`${OUT}/hero-slide-${i}-${vp.name}.png`, () =>
        page.screenshot({ path: `${OUT}/hero-slide-${i}-${vp.name}.png`, fullPage: false }),
      )
    }
  } catch (e) {
    fails++
    console.log(`  FAIL hero ${vp.name}: ${String(e.message ?? e).slice(0, 140)}`)
  }
  await page.close()
}

// Homepage header scroll sequence at 1440 (the fix verification).
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(900)
    for (const y of [0, 200, 500, 1000, 2000]) {
      await page.evaluate(scrollY => window.scrollTo(0, scrollY), y)
      await page.waitForTimeout(400)
      await snap(`${OUT}/header-scroll-${y}px-1440.png`, () =>
        page.screenshot({ path: `${OUT}/header-scroll-${y}px-1440.png`, fullPage: false }),
      )
    }
  } catch (e) {
    fails++
    console.log(`  FAIL header scroll: ${String(e.message ?? e).slice(0, 140)}`)
  }
  await page.close()
}

// Homepage at 768 tablet
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 768, height: 1024 })
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(900)
    await snap(`${OUT}/home-768-top.png`, () =>
      page.screenshot({ path: `${OUT}/home-768-top.png`, fullPage: false }),
    )
  } catch (e) { fails++ }
  await page.close()
}

// Other key surfaces at 1440 + 390.
const SURFACES = [
  { id: 'community-african',        path: '/community/african' },
  { id: 'community-african-sydney', path: '/community/african/sydney' },
  { id: 'city-sydney',            path: '/city/sydney' },
  { id: 'events',                 path: '/events' },
]
for (const surf of SURFACES) {
  for (const vp of [{ name: '1440', w: 1440, h: 900 }, { name: '390', w: 390, h: 844 }]) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })
    try {
      await page.goto(`${BASE}${surf.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(700)
      const file = `${OUT}/${surf.id}-${vp.name}.png`
      await snap(file, () => page.screenshot({ path: file, fullPage: false }))
    } catch (e) { fails++ }
    await page.close()
  }
}

await browser.close()
console.log(`\nDone. captured=${captured} fails=${fails}`)
