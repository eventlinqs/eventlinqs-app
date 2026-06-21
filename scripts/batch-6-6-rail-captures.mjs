// Batch 6.6 - rail-arrow-position verification + key page recaptures.
// 1) Section close-up captures showing arrows at top-right per rail type.
// 2) Recapture city/community/home key pages so the new layout is baseline.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-6.6-evidence'
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
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 300))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(500)
}

async function capture(url, sections, prefix) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await primeLazy(page)
    for (const [text, slug] of sections) {
      const sec = page.locator('section', { hasText: text }).first()
      const found = await sec.count()
      if (found === 0) {
        console.log(`  miss: ${prefix} ${slug} (no section with "${text}")`)
        continue
      }
      try {
        await sec.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        await sec.screenshot({ path: `${OUT}/${prefix}-${slug}.png` })
        console.log(`  ok: ${prefix} ${slug}`)
      } catch (e) {
        console.log(`  fail: ${prefix} ${slug} (${e.message?.slice(0, 100)})`)
      }
    }
  } catch (e) {
    console.log(`  page-fail ${url}: ${e.message?.slice(0, 120)}`)
  }
  await page.close()
}

// 1) City page rails close-ups (Sydney 1440)
console.log('## City rails - Sydney')
await capture(`${BASE}/city/sydney`, [
  ['This weekend', 'this-weekend-rail'],
  ['This week', 'this-week-rail'],
  ['By community', 'by-community-rail'],
  ['By format', 'event-types-rail'],
  ['Popular this month', 'popular-rail'],
  ['By suburb', 'by-suburb-rail'],
  ['Around the country', 'related-cities-rail'],
], 'city-sydney')

// 2) Community page rails close-ups (African 1440)
console.log('## Community rails - African')
await capture(`${BASE}/community/african`, [
  ['Where it lives', 'cities-rail'],
], 'community-african')

// 3) Suburb page rails (Sydney/Inner West 1440)
console.log('## Suburb rails - Sydney/Inner West')
await capture(`${BASE}/city/sydney/inner-west`, [
  ['This week and weekend', 'this-week-weekend-rail'],
  ['Across Sydney', 'related-suburbs-rail'],
], 'suburb-sydney-inner-west')

// 4) Homepage rails close-ups (1440)
console.log('## Home rails')
await capture(`${BASE}/`, [
  ['This week', 'this-week-rail'],
  ['This weekend', 'this-weekend-rail'],
], 'home')

// 5) Full-page captures of key pages 1440 + 375 to refresh baselines.
const fullPages = [
  ['/city/sydney',           'city-sydney'],
  ['/city/melbourne',        'city-melbourne'],
  ['/community/african',       'community-african'],
  ['/',                      'home'],
]
console.log('## Full-page recaptures')
for (const vp of [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]) {
  for (const [path, slug] of fullPages) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await primeLazy(page)
      await page.screenshot({ path: `${OUT}/full-${slug}-${vp.name}.png`, fullPage: true })
      console.log(`  ok ${slug} ${vp.name}`)
    } catch (e) {
      console.log(`  fail ${slug} ${vp.name}: ${e.message?.slice(0, 100)}`)
    }
    await page.close()
  }
}

await ctx.close()
await browser.close()
console.log('done')
