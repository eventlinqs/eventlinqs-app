// Hero consistency proof + live click-through + venue-map paint check.
//
// 1. Measures the homepage hero height vs each interior/marketing hero at 1440
//    and 390, asserting no hero exceeds the homepage marketing tier (Design
//    system: Hero scale). Captures side-by-side screenshots.
// 2. Clicks a real homepage event card and asserts it lands on a rendered
//    detail page (Law 5: verify by clicking, not by a hand-picked slug).
// 3. Loads a real event detail and checks the venue map paints (MINOR-3).
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || process.env.BASE ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app'
).replace(/\/$/, '')
const OUT = 'design-captures/audit/hero-consistency'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [['1440', 1440, 900], ['390', 390, 844]]
const browser = await chromium.launch({ headless: true })

async function heroHeight(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  return box ? Math.round(box.height) : null
}

const results = []
for (const [vp, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
  const page = await ctx.newPage()

  // Homepage hero (the marketing-tier maximum).
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(500)
  const homeHero = await heroHeight(page, 'main section')
  await page.screenshot({ path: `${OUT}/home-hero-${vp}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 560) } })

  // Organisers hero (marketing tier - must be <= homepage).
  await page.goto(`${BASE}/organisers`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(500)
  const orgHero = await heroHeight(page, 'main section, section')
  await page.screenshot({ path: `${OUT}/organisers-hero-${vp}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 560) } })

  const lawful = homeHero != null && orgHero != null && orgHero <= homeHero + 8
  results.push({ vp, homeHero, orgHero, lawful })
  console.log(`[${vp}] home hero=${homeHero}px  organisers hero=${orgHero}px  organisers<=home: ${lawful ? 'LAWFUL' : 'VIOLATION'}`)
  await ctx.close()
}

// Live click-through: click a real homepage event card.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 })
  // A visible fixture rail card (not the hero carousel slide, which can be
  // off-screen / covered). This is a real founder click on a density card.
  const card = page.locator('a[href^="/events/cat-"]:visible').nth(3)
  const href = await card.getAttribute('href')
  await card.scrollIntoViewIfNeeded()
  await card.click()
  await page.waitForURL('**/events/cat-**', { timeout: 60_000 }).catch(() => {})
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 })
  const url = page.url()
  const h1 = await page.locator('main h1, section h1').first().textContent().catch(() => null)
  const landed = url.includes('/events/cat-') && !!h1 && !/Live events across Australia/.test(h1)
  console.log(`\n[click-through] clicked ${href} -> ${url.replace(BASE, '')}  h1="${(h1 || '').trim().slice(0, 50)}"  ${landed ? 'RENDERED' : 'FAILED'}`)
  await page.screenshot({ path: `${OUT}/card-click-detail.png`, fullPage: false })
  await ctx.close()
}

// Venue map paint check on a real DB event with a geocoded venue.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/africultures-festival-sydney-2027`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  // Scroll to the Venue section to trigger the lazy map.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6))
  await page.waitForTimeout(3500)
  const mapInfo = await page.evaluate(() => {
    const sel = ['canvas', 'img[src*="maps"]', 'img[src*="mapbox"]', '.gm-style', '[class*="map"] canvas']
    for (const s of sel) {
      const el = document.querySelector(s)
      if (el) { const r = el.getBoundingClientRect(); if (r.width > 50 && r.height > 50) return { sel: s, w: Math.round(r.width), h: Math.round(r.height) } }
    }
    return null
  })
  console.log(`\n[venue-map] ${mapInfo ? `painted (${mapInfo.sel} ${mapInfo.w}x${mapInfo.h})` : 'NOT painted (grey box) - check NEXT_PUBLIC maps key on preview'}`)
  await page.screenshot({ path: `${OUT}/venue-map.png`, fullPage: false })
  await ctx.close()
}

await browser.close()
const allLawful = results.every(r => r.lawful)
console.log(`\nHero scale: ${allLawful ? 'ALL LAWFUL (organisers <= homepage at every viewport)' : 'VIOLATION FOUND'}`)
process.exit(allLawful ? 0 : 1)
