// Batch 5.6 closing screenshot run.
// - 14 community pages x 2 viewports = 28 captures into
//   docs/redesign/batch-5-evidence/after/ (overwriting Batch 5.5 files).
// - 3 rail-flow captures of the cities rail on /community/african into
//   docs/redesign/batch-5.6-evidence/rail-flow/.
// Requires the dev server on http://localhost:3002.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const AFTER_DIR = 'docs/redesign/batch-5-evidence/after'
const RAIL_DIR = 'docs/redesign/batch-5.6-evidence/rail-flow'

if (!existsSync(AFTER_DIR)) mkdirSync(AFTER_DIR, { recursive: true })
if (!existsSync(RAIL_DIR)) mkdirSync(RAIL_DIR, { recursive: true })

const communities = [
  'african', 'south-asian', 'caribbean', 'latin', 'east-asian',
  'filipino', 'mediterranean', 'middle-eastern', 'european', 'pacific',
  'gospel', 'comedy', 'wellness', 'pride',
]

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

// Trigger lazy-loaded images by scrolling top -> bottom -> back to top
// and waiting for any intersection-observer image fetches to settle.
async function primeLazyImages(page) {
  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 200))
    const total = document.body.scrollHeight
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 400))
  })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(600)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
  })

  // 1) Community pages: 14 x 2 = 28
  for (const vp of viewports) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })

    for (const slug of communities) {
      const url = `${BASE}/community/${slug}`
      console.log(`[${vp.name}] capture ${slug}`)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await primeLazyImages(page)
        await page.screenshot({
          path: `${AFTER_DIR}/community-${slug}-${vp.name}.png`,
          fullPage: true,
        })
      } catch (e) {
        console.log(`  (non-fatal: ${e.message?.slice(0, 160)})`)
      }
    }
    await page.close()
  }

  // 2) Rail-flow: cities rail arrow-click sequence on /community/african @ 1440.
  // The SnapRailScroller renders a right-arrow control that scrolls the rail
  // by ~one card-pair per click. Capture initial state, then after 1 click,
  // then after 2 clicks. The rail is below the fold so we scroll to it first.
  {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    try {
      await page.goto(`${BASE}/community/african`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await primeLazyImages(page)

      // Locate the cities rail by its ContentSection containing the
      // "Where it lives" eyebrow. Scroll it into view.
      const rail = page.locator('section', { hasText: 'in cities everywhere' }).first()
      await rail.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600)

      // Capture initial state.
      await rail.screenshot({ path: `${RAIL_DIR}/cities-rail-african-1440-state-1-initial.png` })

      // Click the right-arrow inside the rail. SnapRailScroller renders
      // arrow buttons with aria-label containing "Scroll" + direction.
      const next = rail.locator('button[aria-label*="Scroll" i][aria-label*="right" i], button[aria-label*="next" i]').first()
      const hasArrow = await next.count()
      if (hasArrow > 0) {
        await next.click({ force: true })
        await page.waitForTimeout(700)
        await rail.screenshot({ path: `${RAIL_DIR}/cities-rail-african-1440-state-2-after-click-1.png` })

        await next.click({ force: true })
        await page.waitForTimeout(700)
        await rail.screenshot({ path: `${RAIL_DIR}/cities-rail-african-1440-state-3-after-click-2.png` })
      } else {
        console.log('  (rail-flow: no right-arrow button found, skipping click states)')
      }
      console.log('rail-flow captured')
    } catch (e) {
      console.log(`  rail-flow (non-fatal: ${e.message?.slice(0, 200)})`)
    }
    await page.close()
  }

  await ctx.close()
  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
