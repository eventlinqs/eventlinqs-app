// Verify interior reveals: motion ON (scroll-through, content must end visible,
// sticky column intact) + reduced-motion (everything visible from first paint,
// nothing stuck hidden). Outputs gitignored.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const OUT = 'docs/benchmark/system-pass/phase-b/reveals'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const PAGES = process.argv.slice(2)
const browser = await chromium.launch()

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise(res => {
      let y = 0
      const t = setInterval(() => {
        y += 700
        window.scrollTo(0, y)
        if (y >= document.body.scrollHeight) { clearInterval(t); res() }
      }, 70)
    })
  })
  await page.waitForTimeout(500)
}

for (const path of PAGES) {
  const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
  // Motion ON
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: REAL_UA })
  const page = await ctx.newPage()
  try {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(700)
    await scrollThrough(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    // Count any element still hidden by the reveal (failure mode).
    const stuck = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.reveal, .reveal-stagger'))
        .filter(el => !el.classList.contains('is-visible')).length,
    )
    await page.screenshot({ path: `${OUT}/${slug}-motion-full.png`, fullPage: true })
    console.log(`${slug} motion: stuck-hidden reveals after scroll = ${stuck}`)
  } catch (e) {
    console.log(`${slug} motion FAIL: ${String(e.message ?? e).slice(0, 100)}`)
  }
  await ctx.close()

  // Reduced motion: everything visible from first paint.
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: REAL_UA, reducedMotion: 'reduce' })
  const rpage = await rctx.newPage()
  try {
    await rpage.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 60000 })
    await rpage.waitForTimeout(500)
    const hiddenOpacity = await rpage.evaluate(() =>
      Array.from(document.querySelectorAll('.reveal, .reveal-stagger'))
        .filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
    )
    await rpage.screenshot({ path: `${OUT}/${slug}-reduced-full.png`, fullPage: true })
    console.log(`${slug} reduced: reveal blocks with opacity<1 = ${hiddenOpacity} (must be 0)`)
  } catch (e) {
    console.log(`${slug} reduced FAIL: ${String(e.message ?? e).slice(0, 100)}`)
  }
  await rctx.close()
}
await browser.close()
console.log('done')
