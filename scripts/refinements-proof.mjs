// Variant-B refinements proof against the deployed feat/home-rebuild preview:
//   (a) brighter hover - same card idle vs hovered, side data (hover must read
//       brighter), captured with a REAL UA so data-motion=1 is live;
//   (b) clean unfaded contained rail edges;
//   (c) two rails in view at 1440x900 and 1280x800 (and 390);
//   + axe (audit profile) at desktop + mobile.
// Output -> docs/benchmark/rail-controls/refinements/. Captures clamped <=1800px.
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const OUT = 'docs/benchmark/rail-controls/refinements'
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
const summary = { base: BASE, captures: [], axe: {}, motion: null }

// ---- (c) two rails in view, contained edges: viewport scrolled past hero ----
for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w <= 420 ? 2 : 1.5, userAgent: UA })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(900)
  // Scroll so the first stacked rail (This week) sits at the top of the viewport.
  try {
    await p.locator('section[aria-label="This week"]').first().scrollIntoViewIfNeeded({ timeout: 5000 })
    await p.evaluate(() => window.scrollBy(0, -8))
    await p.waitForTimeout(500)
  } catch {}
  const name = `tworails-${w}x${h}`
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: w, height: h } })
  await clamp(`${OUT}/${name}.png`)
  summary.captures.push(name)
  await ctx.close()
}

// ---- (a) brighter hover: same card idle vs hovered, REAL UA (data-motion=1) ----
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: UA })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(900)
  summary.motion = await p.evaluate(() => document.documentElement.getAttribute('data-motion'))
  // First card image in the This week rail.
  let card = p.locator('section[aria-label="This week"] a').first()
  try { await card.scrollIntoViewIfNeeded({ timeout: 5000 }) } catch {}
  await p.waitForTimeout(400)
  const box = await card.boundingBox()
  if (box) {
    const clip = { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: Math.min(1440, box.width + 12), height: Math.min(900, box.height + 12) }
    // idle
    await p.mouse.move(5, 5)
    await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/hover-idle.png`, clip })
    // hovered
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
    await p.waitForTimeout(600)
    await p.screenshot({ path: `${OUT}/hover-active.png`, clip })
    await clamp(`${OUT}/hover-idle.png`); await clamp(`${OUT}/hover-active.png`)
    summary.captures.push('hover-idle', 'hover-active')
    // Measure mean luminance of the card image region idle vs hover for an
    // objective brighter check (computed via canvas on the hovered <img>).
    const lum = await p.evaluate(async (sel) => {
      const a = document.querySelector(sel)
      const img = a?.querySelector('img')
      if (!img) return null
      const read = () => {
        const c = document.createElement('canvas'); c.width = 40; c.height = 40
        const ctx = c.getContext('2d'); if (!ctx) return null
        try { ctx.filter = getComputedStyle(img).filter || 'none'; ctx.drawImage(img, 0, 0, 40, 40) } catch { return null }
        const d = ctx.getImageData(0, 0, 40, 40).data
        let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        return s / (d.length / 4)
      }
      return read()
    }, 'section[aria-label="This week"] a')
    summary.hoverFilter = box ? await p.evaluate((sel) => { const img = document.querySelector(sel)?.querySelector('img'); return img ? getComputedStyle(img).filter : null }, 'section[aria-label="This week"] a:hover') : null
    summary.luminanceSample = lum
  }
  await ctx.close()
}

// ---- axe (audit profile) ----
for (const [vp, w, h] of [['desktop', 1440, 900], ['mobile', 412, 823]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  await ctx.addCookies([{ name: 'el-audit', value: '1', domain: new URL(BASE).hostname, path: '/' }])
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(800)
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  summary.axe[vp] = { violations: r.violations.length, ids: r.violations.map(v => v.id) }
  console.log(`axe ${vp}: ${r.violations.length}`)
  await ctx.close()
}

await b.close()
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
console.log('motion=' + summary.motion + ' captures=' + summary.captures.join(','))
console.log('axe desktop=' + summary.axe.desktop?.violations + ' mobile=' + summary.axe.mobile?.violations)
