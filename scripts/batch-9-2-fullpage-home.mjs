// Capture a full-page homepage screenshot to verify section ordering.
import { chromium } from 'playwright'
import { statSync } from 'node:fs'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto('http://localhost:3007/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})

// Prime lazy content by scrolling top-to-bottom.
await page.evaluate(async () => {
  const total = document.body.scrollHeight
  for (let y = 0; y < total; y += 600) {
    window.scrollTo(0, y)
    await new Promise(r => setTimeout(r, 200))
  }
  window.scrollTo(0, 0)
  await new Promise(r => setTimeout(r, 400))
})
await page.waitForTimeout(1200)

const file = 'docs/redesign/batch-9-2-evidence/sections/home-fullpage-1440.png'
await page.screenshot({ path: file, fullPage: true })
console.log(`fullpage ${file}  ${(statSync(file).size / 1024).toFixed(1)}KB`)

// Locate the cultural moments + email panel sections specifically by their headings
const momentsBox = await page.locator('#moments-bento-heading').boundingBox()
const emailBox   = await page.locator('#email-signup-heading').boundingBox()
console.log('moments heading box:', momentsBox)
console.log('email heading box:',   emailBox)

if (momentsBox) {
  await page.evaluate(y => window.scrollTo(0, y), Math.max(0, momentsBox.y - 60))
  await page.waitForTimeout(450)
  await page.screenshot({ path: 'docs/redesign/batch-9-2-evidence/sections/home-section-moments.png', fullPage: false })
  console.log('updated moments section capture')
}
if (emailBox) {
  await page.evaluate(y => window.scrollTo(0, y), Math.max(0, emailBox.y - 60))
  await page.waitForTimeout(450)
  await page.screenshot({ path: 'docs/redesign/batch-9-2-evidence/sections/home-section-email.png', fullPage: false })
  console.log('updated email section capture')
}

const trendingBox = await page.locator('#trending-bento-heading').boundingBox()
if (trendingBox) {
  await page.evaluate(y => window.scrollTo(0, y), Math.max(0, trendingBox.y - 60))
  await page.waitForTimeout(450)
  await page.screenshot({ path: 'docs/redesign/batch-9-2-evidence/sections/home-section-trending.png', fullPage: false })
  console.log('updated trending section capture')
}

await browser.close()
