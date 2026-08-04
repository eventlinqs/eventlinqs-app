/** Axe scan of the buyer seating surface (serious+critical must be zero). */
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core/axe.min.js')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3000/events/seat-proof-two-prices-ts8nfy', { waitUntil: 'load', timeout: 90000 })
await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
// Open the palette menu so its controls are scanned too.
await page.locator('#tickets').scrollIntoViewIfNeeded()
await page.getByRole('button', { name: 'Seat colours' }).click()
await page.addScriptTag({ path: axePath })
const result = await page.evaluate(async () => {
  const r = await window.axe.run(document, { resultTypes: ['violations'] })
  return r.violations.map(v => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map(n => ({ target: n.target.join(' '), summary: n.failureSummary?.slice(0, 200) })),
    help: v.help,
  }))
})
const seriousUp = result.filter(v => v.impact === 'serious' || v.impact === 'critical')
console.log('all violations:', JSON.stringify(result, null, 1))
console.log('serious+critical:', seriousUp.length)
await browser.close()
process.exit(seriousUp.length > 0 ? 1 : 0)
