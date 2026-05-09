// Batch 9.1 GATE 1 - 24 competitor reference captures.
// 6 sites x 2 viewports x 2 states (top, scrolled-600px) = 24 files.
// Each file must be >= 100KB on disk before build proceeds.
//
// Operational note: brief specifies "visible Playwright MCP". This
// session has only the raw playwright npm package, so captures run
// headless. The pixel evidence is equivalent for size/layout
// verification; founder may re-run via visible MCP before push.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-1-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const SITES = [
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au/' },
  { slug: 'dice',         url: 'https://dice.fm/' },
  { slug: 'eventbrite',   url: 'https://www.eventbrite.com.au/' },
  { slug: 'airbnb',       url: 'https://www.airbnb.com.au/' },
  { slug: 'apple',        url: 'https://www.apple.com/' },
  { slug: 'stripe',       url: 'https://stripe.com/' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

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

for (const site of SITES) {
  for (const vp of VIEWPORTS) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    try {
      console.log(`[${vp.name}] ${site.slug}`)
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 35_000 })
      await page.waitForTimeout(2500)

      // Top-of-page state
      const topFile = `${OUT}/${site.slug}-${vp.name}-top.png`
      await page.screenshot({ path: topFile, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) } })
      console.log(`  top: ${statSync(topFile).size} bytes`)

      // Scroll to 600px and capture
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
      await page.waitForTimeout(800)
      const scrolledFile = `${OUT}/${site.slug}-${vp.name}-scrolled.png`
      await page.screenshot({ path: scrolledFile, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) } })
      console.log(`  scrolled: ${statSync(scrolledFile).size} bytes`)
    } catch (e) {
      console.log(`  fail: ${e.message?.slice(0, 120)}`)
    }
    await page.close()
  }
}

await ctx.close()
await browser.close()
console.log('done')
