/**
 * PROOF: quality-80 WebP is still legible evidence, and far smaller.
 *
 * THE CLAIM. Switching every harness from lossless PNG to WebP q80 stops the
 * evidence archive growing (2790 files, 2.44 GB in this worktree, 10.68 GB
 * replicated, single captures to 26 MB). "It is a tenth the size" is only half
 * an argument: lossy compression on EVIDENCE has to be shown not to destroy the
 * thing the evidence is for.
 *
 * SO THIS MEASURES BOTH. For a rendered CARD (small, dense, text-heavy, the
 * hardest case for lossy compression) and a full PAGE capture (large, the one
 * that produces the 26 MB files), it writes PNG and WebP q80 side by side and
 * reports:
 *
 *   - the byte size of each and the saving;
 *   - the MEAN PIXEL DIFFERENCE between them, which is the objective answer to
 *     "does it still look the same";
 *   - both files, so a human can open them and disagree.
 *
 * A mean difference under about 2/255 is invisible at review zoom. The numbers
 * are printed rather than asserted into a pass, because "legible" is a judgement
 * and the point of this file is to put the evidence in front of somebody.
 *
 * Usage: node scripts/verify/webp-legibility-proof.mjs [baseUrl]
 */
import fs from 'node:fs'
import sharp from 'sharp'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const OUT = 'docs/roast/webp-legibility'
fs.mkdirSync(OUT, { recursive: true })

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/** Mean absolute pixel difference across RGB, 0 to 255. */
async function meanDiff(bufA, bufB) {
  const a = await sharp(bufA).raw().toBuffer({ resolveWithObject: true })
  const b = await sharp(bufB).resize(a.info.width, a.info.height).raw().toBuffer()
  let sum = 0
  const n = Math.min(a.data.length, b.length)
  for (let i = 0; i < n; i++) sum += Math.abs(a.data[i] - b[i])
  return sum / n
}

const rows = []

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // the setting that makes captures large in the first place
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
})
const page = await ctx.newPage()

try {
  await page.goto(`${BASE}/events`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2500)

  const cases = []

  // 1. A RENDERED CARD. The hardest case: small, text-dense, fine borders.
  const card = page.locator('a[href^="/events/"]').first()
  if (await card.count()) {
    cases.push({ name: 'event-card', shot: () => card.screenshot({ type: 'png' }) })
  }

  // 2. THE FILTER BAR. Small text and iconography at 2x.
  const bar = page.locator('header').first()
  if (await bar.count()) {
    cases.push({ name: 'header-chrome', shot: () => bar.screenshot({ type: 'png' }) })
  }

  // 3. A FULL PAGE capture. The kind that produces the 26 MB files.
  cases.push({
    name: 'events-fullpage-1440',
    shot: () => page.screenshot({ type: 'png', fullPage: true }),
  })

  // 4. A viewport capture, the sane alternative to full page.
  cases.push({ name: 'events-viewport-1440', shot: () => page.screenshot({ type: 'png' }) })

  console.log('WEBP LEGIBILITY PROOF')
  console.log(`base: ${BASE}, deviceScaleFactor 2\n`)

  for (const c of cases) {
    const png = await c.shot()
    const pngPath = `${OUT}/${c.name}.png`
    fs.writeFileSync(pngPath, png)

    const webpPath = `${OUT}/${c.name}.webp`
    await sharp(png).webp({ quality: 80, effort: 4 }).toFile(webpPath)
    const webp = fs.readFileSync(webpPath)

    const diff = await meanDiff(png, webp)
    const saving = (1 - webp.length / png.length) * 100
    rows.push({ name: c.name, png: png.length, webp: webp.length, saving, diff })

    console.log(`  ${c.name}`)
    console.log(`    PNG  ${kb(png.length).padStart(9)}    WebP q80 ${kb(webp.length).padStart(9)}    ${saving.toFixed(0)} percent smaller`)
    console.log(`    mean pixel difference: ${diff.toFixed(2)} of 255`)
    console.log('')
  }
} finally {
  await browser.close()
}

const totalPng = rows.reduce((s, r) => s + r.png, 0)
const totalWebp = rows.reduce((s, r) => s + r.webp, 0)
const worstDiff = Math.max(...rows.map((r) => r.diff))

console.log('---')
console.log(`total: ${kb(totalPng)} PNG -> ${kb(totalWebp)} WebP, ${((1 - totalWebp / totalPng) * 100).toFixed(0)} percent smaller`)
console.log(`worst mean pixel difference: ${worstDiff.toFixed(2)} of 255`)
console.log('')
console.log('Both files are written for every case, so this can be disagreed with by')
console.log(`opening them: ${OUT}/`)
console.log('')
console.log('A mean difference under about 2 of 255 is invisible at the zoom anybody')
console.log('reviews evidence at. Judge the pairs, not this sentence.')

fs.writeFileSync(`${OUT}/measurements.json`, JSON.stringify({ base: BASE, rows }, null, 2))
