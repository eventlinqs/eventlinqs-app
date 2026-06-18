import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/legacy-purge/before'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const VPS = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '390', mobile: true },
]
for (const vp of VPS) {
  const b = await chromium.launch({ headless: true })
  const ctx = vp.mobile ? await b.newContext({ ...devices['iPhone 13'] })
                        : await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/home-${vp.tag}.png`, fullPage: true })
  console.log(`ok ${OUT}/home-${vp.tag}.png`)
  await b.close()
}
console.log('done')
