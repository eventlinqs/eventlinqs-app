// Batch 8.3 GATE 1 - reference captures of competitor venue profile pages.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/references/venue-profile'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  {
    platform: 'ticketmaster',
    candidates: [
      'https://www.ticketmaster.com.au/icc-sydney-tickets-darling-harbour/venue/237030',
      'https://www.ticketmaster.com.au/qudos-bank-arena-tickets-sydney-olympic-park/venue/485229',
      'https://www.ticketmaster.com.au/the-forum-tickets-melbourne/venue/484999',
      'https://www.ticketmaster.com.au/discover/concerts',
    ],
  },
  {
    platform: 'dice',
    candidates: [
      'https://dice.fm/venue/the-forum-melbourne',
      'https://dice.fm/venue/o2-academy-brixton',
      'https://dice.fm/browse/sydney',
    ],
  },
  {
    platform: 'eventbrite',
    candidates: [
      'https://www.eventbrite.com.au/d/australia--sydney/all-events/',
      'https://www.eventbrite.com.au/o/melbourne-international-comedy-festival-12030498793',
      'https://www.eventbrite.com.au',
    ],
  },
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
    let captured = false
    for (const url of target.candidates) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.width, height: vp.height })
      try {
        console.log(`[${vp.name}] try ${target.platform} -> ${url}`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000 })
        await page.waitForTimeout(2500)
        await page.screenshot({ path: file, fullPage: true })
        const size = statSync(file).size
        console.log(`  saved ${size} bytes`)
        if (size >= 100_000) {
          captured = true
          await page.close()
          break
        }
      } catch (e) {
        console.log(`  fail: ${e.message?.slice(0, 120)}`)
      }
      await page.close()
    }
    if (!captured) console.log(`  WARN: ${target.platform} ${vp.name} could not be captured at >=100KB`)
  }
}

await ctx.close()
await browser.close()
console.log('done')
