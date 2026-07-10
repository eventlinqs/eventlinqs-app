import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/system-pass/surface-0/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const VPS = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '768', width: 768, height: 1024, mobile: false },
  { tag: '390', mobile: true },
]
for (const vp of VPS) {
  const b = await chromium.launch({ headless: true })
  const ctx = vp.mobile ? await b.newContext({ ...devices['iPhone 13'] })
                        : await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/home-${vp.tag}.png`, fullPage: true })
  // measure our rail heading font-size now
  if (vp.tag !== '768') {
    const sizes = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('h2'))
      return els.slice(0,4).map(el => ({ fs: getComputedStyle(el).fontSize, txt: (el.textContent||'').trim().slice(0,20) }))
    })
    console.log(`our headings @ ${vp.tag}:`, JSON.stringify(sizes))
  }
  await b.close()
  console.log(`ok ${vp.tag}`)
}
