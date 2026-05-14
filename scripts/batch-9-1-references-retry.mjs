// Batch 9.1 GATE 1 retry - re-capture under-100KB files using iPhone UA
// + full-page mode for the mobile failures.
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-1-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const RETRIES = [
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au/' },
  { slug: 'dice',         url: 'https://dice.fm/' },
  { slug: 'apple',        url: 'https://www.apple.com/' },
  { slug: 'stripe',       url: 'https://stripe.com/' },
]

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
})

// Use the iPhone 13 device descriptor for a realistic mobile UA + viewport.
const iphone = devices['iPhone 13']
const ctx = await browser.newContext({
  ...iphone,
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
})
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false })
})

for (const site of RETRIES) {
  const page = await ctx.newPage()
  try {
    console.log(`retry ${site.slug} 375`)
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 35_000 })
    await page.waitForTimeout(3500)

    const topFile = `${OUT}/${site.slug}-375-top.png`
    await page.screenshot({ path: topFile, fullPage: true })
    console.log(`  top: ${statSync(topFile).size} bytes`)

    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
    await page.waitForTimeout(1000)
    const scrolledFile = `${OUT}/${site.slug}-375-scrolled.png`
    await page.screenshot({ path: scrolledFile, fullPage: false, clip: { x: 0, y: 0, width: 375, height: 700 } })
    console.log(`  scrolled: ${statSync(scrolledFile).size} bytes`)
  } catch (e) {
    console.log(`  fail: ${e.message?.slice(0, 140)}`)
  }
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
