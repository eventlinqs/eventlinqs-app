/**
 * HOME-PAGE GATE: hero slide integrity (docs/verification/HOME-GATES.md).
 *
 * Loads the deployed homepage and asserts, for the full carousel:
 *   1. Every slide renders its own image: N slides -> N DISTINCT image
 *      sources (the 2026-07-12 defect was five slides sharing one raster).
 *   2. Image and text travel together: each slide's image also fronts that
 *      slide's own event detail page (same underlying source), so a slide
 *      can never wear another event's photo.
 *
 * Usage: node scripts/verify/hero-slide-integrity.mjs [baseUrl]
 * Exits non-zero on any violation. Run beside the link-integrity crawler on
 * every homepage-touching pass.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'https://eventlinqs-staging.vercel.app').replace(/\/+$/, '')

function decodeNextImage(src) {
  const m = src.match(/[?&]url=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : src
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2000)

const slides = await page.evaluate(() => {
  const stacks = [...document.querySelectorAll('.hero-slide-content')]
  const section = stacks[0]?.closest('section')
  const imgs = section ? [...section.querySelectorAll('img')] : []
  return stacks.map((s, i) => ({
    title: s.querySelector('h2')?.textContent?.trim() ?? null,
    href: s.querySelector('a[href^="/events/"]')?.getAttribute('href') ?? null,
    img: imgs[i] ? (imgs[i].currentSrc || imgs[i].src) : null,
  }))
})
await browser.close()

if (slides.length === 0) {
  console.error('[hero-gate] FAIL: no hero slides found')
  process.exit(1)
}
const sources = slides.map(s => decodeNextImage(s.img ?? ''))
const distinct = new Set(sources)
console.log(`[hero-gate] ${slides.length} slides, ${distinct.size} distinct images`)
slides.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} -> ${sources[i].slice(0, 90)}`))

let failed = false
if (distinct.size !== slides.length) {
  console.error('[hero-gate] FAIL: slides share images - every slide must carry its own event photo')
  failed = true
}

// Cross-check each slide image against its own event page.
for (let i = 0; i < slides.length; i++) {
  const s = slides[i]
  if (!s.href) { console.error(`[hero-gate] FAIL: slide ${i + 1} has no event link`); failed = true; continue }
  const res = await fetch(BASE + s.href)
  const html = await res.text()
  const bare = sources[i].split('?')[0]
  const ok = res.ok && (html.includes(encodeURIComponent(bare)) || html.includes(bare))
  if (!ok) {
    console.error(`[hero-gate] FAIL: slide ${i + 1} image does not front its own event page (${s.href})`)
    failed = true
  }
}

console.log(failed ? '[hero-gate] RED' : '[hero-gate] GREEN: image and text travel together on every slide')
process.exit(failed ? 1 : 0)
