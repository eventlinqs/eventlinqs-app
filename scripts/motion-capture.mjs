// Phase-B motion feel capture. Real-Chrome UA so the pre-paint head bootstrap
// sets html[data-motion=1] and the choreography actually runs; plus a
// reduced-motion pass that must show every block fully visible (no stuck-hidden
// reveal). Run against a server started with HOMEPAGE_SEED_FIXTURE=1 for full
// density. Outputs are gitignored (docs/benchmark convention).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'docs/benchmark/system-pass/phase-b/motion'
mkdirSync(OUT, { recursive: true })

const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

const browser = await chromium.launch()

async function shoot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}` })
}

for (const v of viewports) {
  // Motion ON (real user)
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    userAgent: REAL_UA,
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(900) // let the hero entrance settle
  await shoot(page, `home-top-${v.name}.png`)

  // Scroll into the rail band and let reveals fire/settle.
  await page.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }))
  await page.waitForTimeout(700)
  await shoot(page, `home-rails-${v.name}.png`)

  await page.evaluate(() => window.scrollTo({ top: 2600, behavior: 'instant' }))
  await page.waitForTimeout(700)
  await shoot(page, `home-rails2-${v.name}.png`)

  // Full page: every reveal should have fired by the time we walk the page.
  await page.evaluate(async () => {
    await new Promise(res => {
      let y = 0
      const t = setInterval(() => {
        y += 600
        window.scrollTo(0, y)
        if (y >= document.body.scrollHeight) { clearInterval(t); res() }
      }, 60)
    })
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/home-full-${v.name}.png`, fullPage: true })
  await ctx.close()

  // Reduced motion: content MUST be fully visible (reveal no-ops).
  const rctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    userAgent: REAL_UA,
    reducedMotion: 'reduce',
  })
  const rpage = await rctx.newPage()
  await rpage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 })
  await rpage.waitForTimeout(400)
  await rpage.screenshot({ path: `${OUT}/home-reducedmotion-${v.name}.png`, fullPage: true })
  await rctx.close()
}

await browser.close()
console.log('motion captures written to', OUT)
