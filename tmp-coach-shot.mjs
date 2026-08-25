// Confirm the guidance coach still lands where it did after being taken out of
// flow: same bottom-right stack, coach above the launcher, nothing clipped.
import { chromium } from 'playwright'
const [, , url, out] = process.argv
const browser = await chromium.launch({ args: ['--no-sandbox'] })
for (const [label, vp] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }]]) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: label === '390', hasTouch: label === '390' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(6000)
  const box = await page.evaluate(() => {
    const el = document.querySelector('.pointer-events-none.fixed.bottom-16')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const inner = [...el.querySelectorAll(':scope > div')].map((d) => { const b = d.getBoundingClientRect(); return { cls: d.className.slice(0, 40), top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) } })
    const btn = el.querySelector('button')?.getBoundingClientRect()
    return { container: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }, inner, launcher: btn ? { top: Math.round(btn.top), left: Math.round(btn.left), w: Math.round(btn.width), h: Math.round(btn.height) } : null, vh: window.innerHeight, vw: window.innerWidth }
  })
  console.log(`${label}: ${JSON.stringify(box)}`)
  await page.screenshot({ path: `${out}-${label}.png`, fullPage: false })
  await context.close()
}
await browser.close()
console.log('screenshots written')
