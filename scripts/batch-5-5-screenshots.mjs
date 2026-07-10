// Batch 5.5 closing screenshot run.
// - 14 community pages x 2 viewports (1440 desktop, 375 mobile) = 28 captures
//   into docs/redesign/batch-5-evidence/after/
// - Footer-after at 1440 + 375 (cropped to footer using y-offset of full
//   page height - 1200 / 600) into docs/redesign/batch-5-evidence/.
// Requires the dev server to be listening on http://localhost:3010.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3010'
const AFTER_DIR = 'docs/redesign/batch-5-evidence/after'
const FOOTER_DIR = 'docs/redesign/batch-5-evidence'

if (!existsSync(AFTER_DIR)) mkdirSync(AFTER_DIR, { recursive: true })

const communities = [
  'african', 'south-asian', 'caribbean', 'latin', 'east-asian',
  'filipino', 'mediterranean', 'middle-eastern', 'european', 'pacific',
  'gospel', 'comedy', 'wellness', 'pride',
]

const viewports = [
  { name: '1440', width: 1440, height: 900, isMobile: false },
  { name: '375',  width: 375,  height: 812, isMobile: true  },
]

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
  })

  // 1) Community pages: 14 x 2 = 28
  for (const vp of viewports) {
    await ctx.setExtraHTTPHeaders({})
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })

    for (const slug of communities) {
      const url = `${BASE}/community/${slug}`
      console.log(`[${vp.name}] capture ${slug}`)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(1000) // settle hero raster
        await page.screenshot({
          path: `${AFTER_DIR}/community-${slug}-${vp.name}.png`,
          fullPage: true,
        })
      } catch (e) {
        console.log(`  (non-fatal: ${e.message?.slice(0, 120)})`)
      }
    }
    await page.close()
  }

  // 2) Footer-after captures: navigate to homepage, scroll to bottom, viewport-screenshot
  for (const vp of viewports) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1000)
      await page.screenshot({
        path: `${FOOTER_DIR}/footer-after-${vp.name}.png`,
        fullPage: false, // footer-only viewport shot (after scroll)
      })
      console.log(`[${vp.name}] footer-after captured`)
    } catch (e) {
      console.log(`  footer-${vp.name} (non-fatal: ${e.message?.slice(0, 120)})`)
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
