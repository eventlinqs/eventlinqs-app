// Batch 9 GATE 1 - homepage reference captures.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/references/homepage'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { platform: 'ticketmaster', url: 'https://www.ticketmaster.com.au/' },
  { platform: 'dice',         url: 'https://dice.fm/' },
  { platform: 'eventbrite',   url: 'https://www.eventbrite.com.au/' },
  { platform: 'airbnb',       url: 'https://www.airbnb.com.au/experiences' },
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

for (const target of TARGETS) {
  for (const vp of VIEWPORTS) {
    const file = `${OUT}/${target.platform}-${vp.name}.png`
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    try {
      console.log(`[${vp.name}] capture ${target.platform}`)
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 35_000 })
      await page.waitForTimeout(3000)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`  saved ${statSync(file).size} bytes`)
    } catch (e) {
      console.log(`  fail: ${e.message?.slice(0, 120)}`)
    }
    await page.close()
  }
}

await ctx.close()
await browser.close()
console.log('done')
