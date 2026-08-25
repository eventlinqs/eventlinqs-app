/**
 * Name the elements that actually shift. Lighthouse 12.1's `layout-shifts`
 * gatherer errors out on this build ("Cannot read properties of undefined
 * (reading 'frame_sequence')"), so it cannot name them - this reads the same
 * layout-shift PerformanceEntries the browser reports, with their sources.
 *
 * Mobile emulation matches Lighthouse's mobile form factor (Moto G Power:
 * 412x823 @ 1.75) so the shifts are the ones the gate is scoring.
 *
 * Usage: node tmp-cls-trace.mjs <absoluteUrl>
 */
import { chromium } from 'playwright'

const url = process.argv[2]
if (!url) { console.error('usage: node tmp-cls-trace.mjs <url>'); process.exit(1) }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  extraHTTPHeaders: { Cookie: 'el-audit=1' },
})
const page = await context.newPage()

await page.addInitScript(() => {
  window.__shifts = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      window.__shifts.push({
        value: e.value,
        startTime: e.startTime,
        sources: (e.sources || []).map((s) => ({
          tag: s.node ? s.node.tagName : null,
          cls: s.node && s.node.className ? String(s.node.className).slice(0, 160) : null,
          id: s.node ? s.node.id : null,
          html: s.node && s.node.outerHTML ? s.node.outerHTML.slice(0, 220) : null,
          prev: s.previousRect ? { x: s.previousRect.x, y: s.previousRect.y, w: s.previousRect.width, h: s.previousRect.height } : null,
          curr: s.currentRect ? { x: s.currentRect.x, y: s.currentRect.y, w: s.currentRect.width, h: s.currentRect.height } : null,
        })),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
})

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(6000)

// Lighthouse's full-page-screenshot gatherer scrolls the document during the
// gather window, which mounts anything that waits on an IntersectionObserver.
// Shifts it causes still count: a scroll is not "recent input" for CLS.
if (process.env.SCROLL !== '0') {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 400))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(4000)
}

const shifts = await page.evaluate(() => window.__shifts)
const total = shifts.reduce((s, e) => s + e.value, 0)
console.log(`${url}`)
console.log(`observed ${shifts.length} layout-shift entr(ies), summed value ${total.toFixed(4)}`)
for (const s of shifts) {
  console.log(`\n  value ${s.value.toFixed(4)} at ${Math.round(s.startTime)}ms  (${s.sources.length} source node(s))`)
  for (const n of s.sources) {
    console.log(`    <${n.tag}> id=${n.id || '-'} class="${n.cls || '-'}"`)
    if (n.prev && n.curr) console.log(`      moved y ${Math.round(n.prev.y)} -> ${Math.round(n.curr.y)}   h ${Math.round(n.prev.h)} -> ${Math.round(n.curr.h)}`)
    if (n.html) console.log(`      ${n.html.replace(/\s+/g, ' ')}`)
  }
}
await browser.close()
