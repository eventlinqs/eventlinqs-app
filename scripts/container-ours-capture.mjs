// Captures + measures OUR container width across key surfaces at 1440/1920/768/390.
// Pass a phase label (before|after) as argv[2]. Server must run with
// HOMEPAGE_SEED_FIXTURE=1 for full density. Outputs gitignored per convention.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const phase = process.argv[2] || 'before'
const OUT = `docs/benchmark/system-pass/phase-b/container-width/ours-${phase}`
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const SURFACES = [
  { slug: 'home', path: '/' },
  { slug: 'events', path: '/events' },
]
const WIDTHS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '1920', w: 1920, h: 1000 },
  { name: '768', w: 768, h: 1024 },
  { name: '390', w: 390, h: 844 },
]

function measure() {
  const vw = window.innerWidth
  const all = Array.from(document.querySelectorAll('body *'))
  const blocks = []
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width < 400 || r.width > vw || r.height < 80) continue
    const left = Math.round(r.left)
    const right = Math.round(vw - r.right)
    if (left < 0 || right < 0) continue
    blocks.push({ left, right, width: Math.round(r.width) })
  }
  const gutterCounts = {}
  for (const b of blocks) {
    if (Math.abs(b.left - b.right) <= 8 && b.left >= 0 && b.left < vw / 2) {
      const g = Math.round((b.left + b.right) / 2 / 2) * 2
      gutterCounts[g] = (gutterCounts[g] || 0) + 1
    }
  }
  const gutters = Object.entries(gutterCounts)
    .map(([g, n]) => ({ gutter: +g, count: n, containerWidth: vw - 2 * +g }))
    .sort((a, b) => b.count - a.count)
  let widest = null
  for (const b of blocks) {
    if (Math.abs(b.left - b.right) <= 12 && b.width < vw - 8) {
      if (!widest || b.width > widest.width) widest = b
    }
  }
  return { vw, topGutters: gutters.slice(0, 4), widestCentredBlock: widest }
}

const browser = await chromium.launch()
const results = []
for (const s of SURFACES) {
  for (const v of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: v.w, height: v.h },
      userAgent: REAL_UA,
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    const file = `${OUT}/${s.slug}-${v.name}.png`
    try {
      await page.goto(`http://localhost:3000${s.path}`, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(900)
      const m = await page.evaluate(measure)
      await page.screenshot({ path: file, fullPage: false })
      results.push({ surface: s.slug, ...v, ...m })
      const g = m.topGutters[0]
      console.log(`${s.slug} @${v.name}: container~${g ? g.containerWidth : '?'} (gutter ${g ? g.gutter : '?'}, n=${g ? g.count : 0}) widest=${m.widestCentredBlock ? m.widestCentredBlock.width : '?'}`)
    } catch (e) {
      console.log(`FAIL ${s.slug}@${v.name}: ${String(e.message ?? e).slice(0, 100)}`)
      results.push({ surface: s.slug, ...v, error: String(e.message ?? e).slice(0, 160) })
    } finally {
      await ctx.close()
    }
  }
}
await browser.close()
writeFileSync(`${OUT}/measurements.json`, JSON.stringify(results, null, 2))
console.log(`\nWrote ${OUT}/measurements.json`)
