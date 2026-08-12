// Live walk of the public composer. Real Chromium, real clicks.
// Run against a built server: node walk-launch.mjs http://localhost:3157
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3157'
const OUT = 'docs/roast/launch-walk-2026-08-09'
mkdirSync(`${OUT}/shots`, { recursive: true })

const ARRIVALS = [
  ['dj', 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale'],
  ['comedian', 'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door'],
  ['market', 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park'],
  ['workshop', 'Pottery workshop, 6 places, $85, Saturday 27th September 10am, my studio in Newtown'],
  ['charity', 'Trivia night for Geelong Animal Rescue, Sat 12th September, $30 a head, tables of 8, at the RSL'],
  ['birthday', "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont, about 40 kids, no charge"],
]

const results = []

const browser = await chromium.launch()

for (const [name, text] of ARRIVALS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  await page.goto(`${BASE}/launch`, { waitUntil: 'networkidle' })
  await page.fill('#launch-description', text)
  await page.click('button:has-text("Build my kit")')

  // The reveal replaces the composer.
  await page.waitForSelector('#kit-reveal-heading', { timeout: 20000 })
  const body = await page.innerText('main')

  const row = {
    arrival: name,
    revealed: true,
    heading: await page.textContent('#kit-reveal-heading'),
    // The visibility sentence the organiser is shown.
    saysStaysOff: /stays off the public listings/i.test(body),
    saysGoesOn: /goes on the public listings/i.test(body),
    addressHeldBack: /street address stays private/i.test(body),
    recurringNote: /repeats/i.test(body),
    ticketsFraming: /tickets it sells/i.test(body),
    attendanceFraming: /who turns up|who is coming/i.test(body),
    hasBillField: (await page.locator('#bill-name').count()) > 0,
    hasKitLink: /launch\/k\//.test(body),
    consoleErrors: consoleErrors.length,
  }
  results.push(row)

  await page.screenshot({ path: `${OUT}/shots/${name}-1440.png`, fullPage: false })

  // Mobile, same arrival, checking for sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  row.overflow390 = overflow
  await page.screenshot({ path: `${OUT}/shots/${name}-390.png`, fullPage: false })

  await ctx.close()
}

await browser.close()

writeFileSync(`${OUT}/walk.json`, JSON.stringify({ base: BASE, results }, null, 2))
console.log(JSON.stringify(results, null, 2))
