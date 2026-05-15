// Open the homepage, intercept the React Server Component payload,
// and inspect the cities prop the LocationPicker actually receives.
// If Geelong is missing here, the bug is upstream in picker-cities.
// If Geelong is present, the bug is in the picker filter logic.
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const BASE = process.argv[2] || 'http://localhost:3007'
console.log('BASE:', BASE)
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

// Open the location picker.
await page.click('button[aria-label*="Change location"]')
await page.waitForTimeout(500)

// Read all rendered list items inside the picker dialog.
const auCities = await page.$$eval('[role="dialog"] li button', els =>
  els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
)
console.log('AU section (default view, no query):')
for (const c of auCities.slice(0, 50)) console.log(' ', c)

// Try searching Geelong.
await page.fill('input#location-search', 'Geelong')
await page.waitForTimeout(400)
const matches = await page.$$eval('[role="dialog"] li button', els =>
  els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
)
console.log('\nSearch "Geelong" → matches:')
for (const c of matches) console.log(' ', c)
const emptyMessage = await page.textContent('[role="dialog"] p:has-text("No cities match")').catch(() => null)
console.log('\nempty message:', emptyMessage)

// Test a battery of search queries.
const queries = ['Geelo', 'geelong', 'GEELONG', 'g', 'Sydney', 'sydn', 'Bris', 'Newcas', 'Hobart', 'Goldcoa', 'Gold Coast', 'gold-coast', 'london', 'manchester']
for (const q of queries) {
  await page.fill('input#location-search', q)
  await page.waitForTimeout(250)
  const m = await page.$$eval('[role="dialog"] li button', els =>
    els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
  )
  console.log('q="' + q + '"'.padEnd(18) + ' → matches:', m.length ? m.slice(0, 5) : '(empty)')
}

await browser.close()
