// Container-width evidence (#11). Measures the content-container width of
// Ticketmaster AU + Eventbrite AU at 1440 and 1920 by finding the modal
// symmetric side-gutter across large centred content blocks, and the widest
// centred block. Saves screenshots + a JSON report to the system-pass folder.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'docs/benchmark/system-pass/phase-b/container-width'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const TARGETS = [
  { slug: 'tm-home', url: 'https://www.ticketmaster.com.au' },
  { slug: 'tm-browse', url: 'https://www.ticketmaster.com.au/discover/concerts' },
  { slug: 'eb-home', url: 'https://www.eventbrite.com.au' },
  { slug: 'eb-browse', url: 'https://www.eventbrite.com.au/d/australia--sydney/all-events/' },
]

const WIDTHS = [1440, 1920]

// Runs in the page. Finds the dominant centred container width.
function measure() {
  const vw = window.innerWidth
  const all = Array.from(document.querySelectorAll('body *'))
  const blocks = []
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width < 600 || r.width > vw || r.height < 120) continue
    const left = Math.round(r.left)
    const right = Math.round(vw - r.right)
    if (left < 0 || right < 0) continue
    blocks.push({ left, right, width: Math.round(r.width) })
  }
  // Modal symmetric gutter: blocks where left ~= right (centred).
  const gutterCounts = {}
  for (const b of blocks) {
    if (Math.abs(b.left - b.right) <= 8 && b.left > 4 && b.left < vw / 2) {
      const g = Math.round((b.left + b.right) / 2 / 4) * 4 // bucket to 4px
      gutterCounts[g] = (gutterCounts[g] || 0) + 1
    }
  }
  const gutters = Object.entries(gutterCounts)
    .map(([g, n]) => ({ gutter: +g, count: n, containerWidth: vw - 2 * +g }))
    .sort((a, b) => b.count - a.count)
  // Widest centred block (symmetric within 12px) that is not full-bleed.
  let widest = null
  for (const b of blocks) {
    if (Math.abs(b.left - b.right) <= 12 && b.width < vw - 20) {
      if (!widest || b.width > widest.width) widest = b
    }
  }
  return { vw, topGutters: gutters.slice(0, 5), widestCentredBlock: widest }
}

const results = []
for (const t of TARGETS) {
  for (const width of WIDTHS) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    const ctx = await browser.newContext({
      viewport: { width, height: 960 },
      deviceScaleFactor: 1,
      userAgent: UA,
    })
    const page = await ctx.newPage()
    const file = `${OUT}/${t.slug}-${width}.png`
    try {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(1500)
      // dismiss obvious cookie/consent overlays that distort layout
      for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept")', 'button:has-text("Got it")']) {
        await page.click(sel, { timeout: 1200 }).catch(() => {})
      }
      await page.waitForTimeout(400)
      const m = await page.evaluate(measure)
      await page.screenshot({ path: file, fullPage: false })
      results.push({ target: t.slug, url: t.url, width, ...m })
      const g = m.topGutters[0]
      console.log(
        `${t.slug} @${width}: container~${g ? g.containerWidth : '?'} (gutter ${g ? g.gutter : '?'}, n=${g ? g.count : 0}) widest=${m.widestCentredBlock ? m.widestCentredBlock.width : '?'}`,
      )
    } catch (e) {
      console.log(`FAIL ${t.slug}@${width}: ${String(e.message ?? e).slice(0, 120)}`)
      results.push({ target: t.slug, url: t.url, width, error: String(e.message ?? e).slice(0, 200) })
    } finally {
      await browser.close()
    }
  }
}
writeFileSync(`${OUT}/measurements.json`, JSON.stringify(results, null, 2))
console.log(`\nWrote ${OUT}/measurements.json`)
