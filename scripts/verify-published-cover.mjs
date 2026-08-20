/**
 * VERIFY A PUBLISHED EVENT'S COVER on the public surface, at both viewports.
 *
 * The claim being checked is not "the row has a cover_image_url" but "a stranger
 * browsing /events sees this event with a picture on it", so it searches the
 * public browse surface as a stranger, with no session, and measures the
 * rendered image rather than the markup: natural dimensions greater than zero is
 * the difference between an <img> that is present and an <img> that is broken.
 *
 * Usage: node scripts/verify-published-cover.mjs <baseUrl> "<event title>" --out <dir>
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const TITLE = process.argv[3] || ''
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx === -1 ? 'cover-verify' : process.argv[outIdx + 1]
if (!BASE || !TITLE) {
  console.error('usage: node scripts/verify-published-cover.mjs <baseUrl> "<title>" --out <dir>')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
let failures = 0

for (const width of [390, 1440]) {
  // A FRESH context with no storage state: this is the stranger's view.
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/events?q=${encodeURIComponent(TITLE)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(3000)

  const found = await page.evaluate(title => {
    const card = [...document.querySelectorAll('a[href^="/events/"]')].find(a =>
      (a.innerText || '').includes(title),
    )
    if (!card) return { measuredWidth: window.innerWidth, found: false }
    const img = card.querySelector('img')
    const rect = card.getBoundingClientRect()
    return {
      measuredWidth: window.innerWidth,
      found: true,
      href: card.getAttribute('href'),
      cardWidth: Math.round(rect.width),
      imgFound: Boolean(img),
      // The whole point: a present <img> with zero natural size is a BROKEN
      // image, and it looks identical to a loading one in a screenshot.
      naturalWidth: img ? img.naturalWidth : 0,
      naturalHeight: img ? img.naturalHeight : 0,
      complete: img ? img.complete : false,
      src: img ? (img.currentSrc || img.src).slice(0, 120) : null,
      renderedW: img ? Math.round(img.getBoundingClientRect().width) : 0,
      renderedH: img ? Math.round(img.getBoundingClientRect().height) : 0,
    }
  }, TITLE)

  console.log(`\n=== ${width}px (measured ${found.measuredWidth}) ===`)
  console.log(JSON.stringify(found, null, 1))
  if (!found.found || !found.imgFound || found.naturalWidth === 0) failures += 1

  await page.screenshot({ path: join(OUT, `events-${width}.png`), fullPage: false })

  if (found.href) {
    await page.goto(`${BASE}${found.href}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(OUT, `event-page-${width}.png`), fullPage: false })
    const hero = await page.evaluate(() => {
      const img = document.querySelector('main img')
      return img
        ? { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, src: (img.currentSrc || img.src).slice(0, 120) }
        : null
    })
    console.log('event page hero image:', JSON.stringify(hero))
    if (!hero || hero.naturalWidth === 0) failures += 1
  }

  await context.close()
}

await browser.close()
console.log(`\n[verify] failures: ${failures}`)
process.exitCode = failures > 0 ? 1 : 0
