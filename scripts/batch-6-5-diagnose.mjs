// Diagnostic capture for batch 6.5 failures.
import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-6.5-evidence'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})

// 1) /city/sydney 375 mobile, focus on yellow-strip diagnosis.
//    Set body { overflow-x: visible } via DOM eval to expose the
//    overflowing element if any.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/diagnose-sydney-375-as-is.png`, fullPage: true })

  // Inspect: find all elements wider than 375px on the page.
  const overflow = await page.evaluate(() => {
    const out = []
    const all = document.querySelectorAll('*')
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.right > 375 && r.left >= 0) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 120),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          id: el.id || '',
        })
      }
    }
    return out.slice(0, 60)
  })
  console.log('OVERFLOWING ELEMENTS:')
  for (const o of overflow) console.log(JSON.stringify(o))

  await page.close()
}

// 2) /city/sydney 1440 - inspect the map section render state.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  page.on('console', msg => console.log('[browser]', msg.type(), msg.text().slice(0, 200)))
  page.on('pageerror', err => console.log('[pageerror]', err.message?.slice(0, 200)))
  await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})

  // Scroll to map section, wait for mapbox to render.
  const map = page.locator('section', { hasText: 'Where Sydney is happening' }).first()
  await map.scrollIntoViewIfNeeded()
  await page.waitForTimeout(4000)

  const mapInfo = await page.evaluate(() => {
    const containers = document.querySelectorAll('[role="application"]')
    const mb = document.querySelectorAll('.mapboxgl-map, .mapboxgl-canvas, .mapboxgl-canvas-container')
    return {
      containerCount: containers.length,
      mapboxgl: window.mapboxgl ? 'loaded' : 'not loaded',
      mapboxClasses: Array.from(mb).map(e => ({
        cls: e.className.toString().slice(0, 80),
        h: Math.round(e.getBoundingClientRect().height),
        w: Math.round(e.getBoundingClientRect().width),
      })),
    }
  })
  console.log('MAP STATE:', JSON.stringify(mapInfo, null, 2))

  await map.screenshot({ path: `${OUT}/diagnose-sydney-mapbox-1440.png` })
  await page.close()
}

// 3) Suburb rail tile state on /city/sydney 1440.
{
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})

  const railInfo = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('section, h2'))
    const rail = sections.find(s => s.textContent && s.textContent.includes('in cities everywhere'))
    if (!rail) return { found: false }
    const tiles = rail.querySelectorAll('a img')
    return {
      found: true,
      tileCount: tiles.length,
      images: Array.from(tiles).slice(0, 6).map(img => ({
        src: (img.getAttribute('src') || '').slice(0, 80),
        natW: img.naturalWidth,
        natH: img.naturalHeight,
      })),
    }
  })
  console.log('SUBURB RAIL STATE:', JSON.stringify(railInfo, null, 2))
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
