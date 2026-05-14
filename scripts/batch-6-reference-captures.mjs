// Batch 6 - reference captures of competitor city-guide layouts.
// Captures Ticketmaster AU/UK + Airbnb + DICE city pages at desktop +
// mobile so we can compose side-by-side comparisons. External sites
// often block headless automation; non-fatal failures are logged so
// the build can continue.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const TARGETS = [
  // Ticketmaster
  { dir: 'ticketmaster', name: 'tm-au-sydney',  url: 'https://www.ticketmaster.com.au/discover/sydney' },
  { dir: 'ticketmaster', name: 'tm-uk-london',  url: 'https://guides.ticketmaster.co.uk/city-guides/london' },
  // Airbnb things-to-do
  { dir: 'airbnb',       name: 'airbnb-sydney', url: 'https://www.airbnb.com.au/s/Sydney--Australia/experiences' },
  // DICE city
  { dir: 'dice',         name: 'dice-london',   url: 'https://dice.fm/browse/london' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

const ROOT = 'docs/redesign/references'

async function main() {
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

  for (const t of TARGETS) {
    const dir = `${ROOT}/${t.dir}`
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    for (const vp of VIEWPORTS) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.width, height: vp.height })
      try {
        console.log(`[${vp.name}] capture ${t.name}`)
        await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await page.waitForTimeout(2500)
        await page.screenshot({
          path: `${dir}/${t.name}-${vp.name}.png`,
          fullPage: true,
        })
        console.log(`  ok`)
      } catch (e) {
        console.log(`  (non-fatal: ${e.message?.slice(0, 160)})`)
      }
      await page.close()
    }
  }

  await ctx.close()
  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
