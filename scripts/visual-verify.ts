import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const PREVIEW_URL = process.env.PREVIEW_URL ?? 'http://localhost:3000'
const OUT_DIR = 'visual-verify'

mkdirSync(OUT_DIR, { recursive: true })

async function run() {
  const browser = await chromium.launch()

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const mobile  = await browser.newContext({ viewport: { width: 375,  height: 667 } })

  const dp = await desktop.newPage()
  await dp.goto(PREVIEW_URL, { waitUntil: 'networkidle' })
  await dp.screenshot({ path: `${OUT_DIR}/desktop-full.png`, fullPage: true })

  const mp = await mobile.newPage()
  await mp.goto(PREVIEW_URL, { waitUntil: 'networkidle' })
  await mp.screenshot({ path: `${OUT_DIR}/mobile-full.png`, fullPage: true })

  await browser.close()
  console.log('Screenshots saved to', OUT_DIR)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
