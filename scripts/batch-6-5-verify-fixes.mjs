// Verify all 4 fixes via fresh captures.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-6.5-evidence'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})

async function primeLazy(page) {
  await page.evaluate(async () => {
    const total = document.body.scrollHeight
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 150))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 600))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 400))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(800)
}

// F1 Mapbox: capture map section on Sydney/Melbourne/Brisbane/Perth at 1440.
for (const city of ['sydney', 'melbourne', 'brisbane', 'perth']) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(`${BASE}/city/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    const map = page.locator('section', { hasText: `Where ${city.charAt(0).toUpperCase() + city.slice(1).replace('-', ' ')} is happening` }).first()
    await map.scrollIntoViewIfNeeded()
    // Mapbox needs a beat to recolor + render markers in headless WebGL.
    await page.waitForTimeout(4500)
    await map.screenshot({ path: `${OUT}/${city}-mapbox-fixed-1440.png` })
    console.log(`F1 mapbox ${city} ok`)
  } catch (e) {
    console.log(`F1 mapbox ${city} (non-fatal: ${e.message?.slice(0, 160)})`)
  }
  await page.close()
}

// F2 Suburb tiles: capture suburb rail section on Tier 1 cities.
for (const city of ['sydney', 'melbourne', 'brisbane', 'perth', 'gold-coast', 'canberra', 'hobart']) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(`${BASE}/city/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    const rail = page.locator('section', { hasText: 'Pick your part of' }).first()
    const found = await rail.count()
    if (found > 0) {
      await rail.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      await rail.screenshot({ path: `${OUT}/${city}-suburbs-fixed-1440.png` })
      console.log(`F2 suburbs ${city} ok`)
    } else {
      console.log(`F2 suburbs ${city}: no By Suburb section (Tier 2 or no suburbs)`)
    }
  } catch (e) {
    console.log(`F2 suburbs ${city} (non-fatal: ${e.message?.slice(0, 160)})`)
  }
  await page.close()
}

// F2.b Browse-by-Culture rail: confirm 14 culture tiles render with photos.
for (const city of ['sydney', 'melbourne', 'brisbane', 'perth']) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(`${BASE}/city/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    const rail = page.locator('section', { hasText: ' by culture' }).first()
    const found = await rail.count()
    if (found > 0) {
      await rail.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      await rail.screenshot({ path: `${OUT}/${city}-culture-rail-fixed-1440.png` })
      console.log(`F2b culture rail ${city} ok`)
    }
  } catch (e) {
    console.log(`F2b culture rail ${city} (non-fatal: ${e.message?.slice(0, 160)})`)
  }
  await page.close()
}

// F3 Mobile overflow: capture full-page mobile - should now be exactly 375 wide.
for (const city of ['sydney', 'melbourne', 'toowoomba']) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  try {
    await page.goto(`${BASE}/city/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    const dim = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      bodyW: document.body.scrollWidth,
    }))
    console.log(`F3 ${city} dims: docW=${dim.docW} bodyW=${dim.bodyW}`)
    await page.screenshot({ path: `${OUT}/${city}-mobile-fixed-375.png`, fullPage: true })
  } catch (e) {
    console.log(`F3 mobile ${city} (non-fatal: ${e.message?.slice(0, 160)})`)
  }
  await page.close()
}

// F4 Mobile sticky bar visibility post-scroll on Sydney 375.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  try {
    await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/sydney-mobile-sticky-bar-375.png`, fullPage: false })
    console.log('F4 sticky bar captured')
  } catch (e) {
    console.log(`F4 sticky bar (non-fatal: ${e.message?.slice(0, 160)})`)
  }
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
