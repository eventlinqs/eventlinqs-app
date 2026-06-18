// Organiser rebuild - fresh Eventbrite "organizer overview" captures.
// Full-page desktop (1440) + mobile (390) for the Phase 0 forensic
// deconstruction. External sites can block headless automation; failures
// are logged non-fatally so the run completes either way.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const URL = 'https://www.eventbrite.com.au/organizer/overview/'
const OUT = 'docs/benchmark/system-pass/surface-6/rebuild-2026-06-07/competitor'

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  for (const vp of VIEWPORTS) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    try {
      console.log(`[${vp.name}] capture EB organizer overview`)
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(3500)
      // Scroll the full page to trigger lazy images, then return to top.
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let y = 0
          const step = () => {
            window.scrollTo(0, y)
            y += window.innerHeight
            if (y < document.body.scrollHeight) {
              setTimeout(step, 120)
            } else {
              window.scrollTo(0, 0)
              setTimeout(resolve, 400)
            }
          }
          step()
        })
      })
      await page.waitForTimeout(800)
      await page.screenshot({
        path: `${OUT}/eb-organiser-${vp.name}-full.png`,
        fullPage: true,
      })
      // Also a fold-only shot for clean above-the-fold reading.
      await page.screenshot({
        path: `${OUT}/eb-organiser-${vp.name}-fold.png`,
        fullPage: false,
      })
      console.log(`  ok`)
    } catch (e) {
      console.log(`  (non-fatal: ${e.message?.slice(0, 200)})`)
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
