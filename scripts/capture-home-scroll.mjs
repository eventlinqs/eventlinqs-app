// Capture the deployed homepage as scroll SEGMENTS (viewport-by-viewport) at
// 1440x900 and 390x844, real UA, for a rail-by-rail audit. Each segment is a
// clean viewport-height shot so rails stay readable (no giant clamped full-page).
// Output -> docs/benchmark/system-pass/community-moat/<label>/.
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const LABEL = process.argv[3] || 'before'
const OUT = `docs/benchmark/system-pass/community-moat/${LABEL}`
mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function clamp(p) {
  const m = await sharp(p).metadata()
  if (Math.max(m.width, m.height) > 1800) {
    const buf = await sharp(p).resize({ width: m.width >= m.height ? 1800 : null, height: m.height > m.width ? 1800 : null }).png().toBuffer()
    writeFileSync(p, buf)
  }
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
for (const [vn, w, h] of [['1440', 1440, 900], ['390', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: vn === '390' ? 2 : 1.5, userAgent: UA })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(1000)
  const total = await p.evaluate(() => document.body.scrollHeight)
  const segs = Math.min(10, Math.ceil(total / h))
  for (let i = 0; i < segs; i++) {
    await p.evaluate(y => window.scrollTo(0, y), i * h)
    await p.waitForTimeout(500)
    const file = `${OUT}/home-${vn}-seg${String(i).padStart(2, '0')}.png`
    await p.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } })
    await clamp(file)
  }
  console.log(`${vn}: ${segs} segments (scrollHeight ${total})`)
  await ctx.close()
}
await b.close()
console.log('wrote ' + OUT)
