// Native-resolution close-ups to verify spine crops (no chop/distortion/letterbox).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/image-spine/closeups'
mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const b = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, userAgent: UA })
await ctx.addInitScript(() => document.documentElement.setAttribute('data-headless', '1'))
const p = await ctx.newPage()

// Hero clips (top band) for the spine hero/landing surfaces.
for (const [label, path] of [
  ['hero-city-sydney', '/city/sydney'],
  ['hero-community-indian', '/community/indian'],
  ['hero-community-first-nations', '/community/aboriginal-torres-strait-islander'],
  ['hero-community-chinese', '/community/chinese'],
  ['hero-organisers', '/organisers'],
]) {
  await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 0, y: 0, width: 1440, height: 520 } })
  console.log(label, 'OK')
}

// Homepage rails: scroll each spine rail into view and clip a readable band.
await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(900)
for (const [label, heading] of [
  ['rail-categories', 'Browse by category'],
  ['rail-sounds', 'Sounds'],
  ['rail-community', 'your people'],
  ['rail-cities', 'Browse by city'],
]) {
  const found = await p.evaluate((h) => {
    const els = Array.from(document.querySelectorAll('h2, h3, [class*="rail"] *'))
    const el = els.find(e => (e.textContent || '').toLowerCase().includes(h.toLowerCase()))
    if (!el) return false
    el.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -90)
    return true
  }, heading)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 0, y: 0, width: 1440, height: 560 } })
  console.log(label, found ? 'OK' : 'heading-not-found(captured anyway)')
}
await ctx.close()
await b.close()
console.log('done ->', OUT)
