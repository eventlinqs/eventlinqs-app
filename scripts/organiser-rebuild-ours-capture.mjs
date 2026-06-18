// Organiser rebuild - capture OUR rebuilt /organisers at 1440/768/390.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const URL = process.env.ORG_URL || 'http://localhost:3000/organisers'
const OUT = process.env.ORG_OUT || 'docs/benchmark/system-pass/surface-6/rebuild-2026-06-07/after'

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  for (const vp of VIEWPORTS) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 })
    await page.waitForTimeout(1200)
    // Scroll through to trigger any lazy images, then back to top.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0
        const step = () => {
          window.scrollTo(0, y)
          y += window.innerHeight
          if (y < document.body.scrollHeight) setTimeout(step, 100)
          else { window.scrollTo(0, 0); setTimeout(resolve, 400) }
        }
        step()
      })
    })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/organisers-${vp.name}-full.png`, fullPage: true })
    await page.screenshot({ path: `${OUT}/organisers-${vp.name}-fold.png`, fullPage: false })
    console.log(`[${vp.name}] ok`)
    await page.close()
  }
  await ctx.close()
  await browser.close()
  console.log('done')
}

main().catch((e) => { console.error(e); process.exit(1) })
