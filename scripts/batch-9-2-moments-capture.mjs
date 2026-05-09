import { chromium } from 'playwright'
import { statSync } from 'node:fs'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.setViewportSize({ width: 1440, height: 1300 })
await page.goto('http://localhost:3007/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})

await page.evaluate(async () => {
  const total = document.body.scrollHeight
  for (let y = 0; y < total; y += 600) {
    window.scrollTo(0, y)
    await new Promise(r => setTimeout(r, 200))
  }
})
await page.waitForTimeout(800)

async function captureSectionByHeading(headingId, outFile) {
  await page.evaluate(id => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' })
  }, headingId)
  await page.evaluate(() => window.scrollBy(0, -60))
  await page.waitForTimeout(700)
  await page.screenshot({ path: outFile, fullPage: false })
  console.log(`${headingId} -> ${outFile}  ${(statSync(outFile).size / 1024).toFixed(1)}KB`)
}

await captureSectionByHeading('trending-bento-heading', 'docs/redesign/batch-9-2-evidence/sections/home-section-trending.png')
await captureSectionByHeading('moments-bento-heading',  'docs/redesign/batch-9-2-evidence/sections/home-section-moments.png')
await captureSectionByHeading('email-signup-heading',   'docs/redesign/batch-9-2-evidence/sections/home-section-email.png')

await browser.close()
