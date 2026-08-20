/**
 * VERIFY THE GET TICKETS RULING at both viewports, by pressing it and measuring
 * what happened rather than by reading the handler.
 *
 * The rule: at 390 it scrolls, because the panel is thousands of pixels away and
 * scrolling is the whole job. At 1440, where the panel is already on screen, it
 * moves FOCUS into the panel, so the control always does something meaningful
 * and a keyboard user lands where they were trying to get.
 *
 * Usage: node scripts/verify-get-tickets.mjs <baseUrl> [/events/slug]
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: node scripts/verify-get-tickets.mjs <baseUrl> [/events/slug]')
  process.exit(2)
}

const browser = await chromium.launch()
let path = process.argv[3]
if (!path) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await c.newPage()
  await p.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(1800)
  path = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="/events/"]')].find(
      x => (x.getAttribute('href') || '').split('/').length === 3,
    )
    return a ? a.getAttribute('href') : null
  })
  await c.close()
}
if (!path) {
  console.error('[get-tickets] no event page found. The check is INCOMPLETE, not a pass.')
  await browser.close()
  process.exit(1)
}

let failures = 0
for (const width of [390, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  })
  const page = await context.newPage()
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  const before = await page.evaluate(() => {
    const panel = document.getElementById('tickets')
    return {
      measuredWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null,
      panelOnScreen: panel
        ? panel.getBoundingClientRect().top < window.innerHeight
        : null,
      activeTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    }
  })

  const cta = page.locator('a[href="#tickets"]').first()
  const ctaCount = await page.locator('a[href="#tickets"]').count()
  if (ctaCount === 0) {
    console.log(`\n=== ${width}px === NO Get tickets anchor on this page (cancelled or past event?)`)
    await context.close()
    continue
  }
  await cta.click()
  await page.waitForTimeout(1200)

  const after = await page.evaluate(() => {
    const panel = document.getElementById('tickets')
    const active = document.activeElement
    return {
      scrollY: Math.round(window.scrollY),
      panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null,
      activeTag: active ? active.tagName.toLowerCase() : null,
      activeText: active ? (active.getAttribute('aria-label') || active.innerText || active.getAttribute('name') || '').trim().slice(0, 40) : null,
      activeInsidePanel: Boolean(panel && active && panel.contains(active)),
      hash: location.hash,
    }
  })

  const scrolled = after.scrollY - before.scrollY
  console.log(`\n=== ${width}px (measured ${before.measuredWidth}), viewport height ${before.viewportHeight} ===`)
  console.log(`panel top before: ${before.panelTop}px  (already on screen: ${before.panelOnScreen})`)
  console.log(`scroll moved: ${scrolled}px`)
  console.log(`focus after: <${after.activeTag}> "${after.activeText}"  inside #tickets: ${after.activeInsidePanel}`)
  console.log(`location.hash: "${after.hash}"`)

  if (width === 390) {
    // Mobile must still scroll, and by a lot.
    if (scrolled < 500) {
      console.log('FAIL: at 390 the press must still scroll to the panel.')
      failures += 1
    }
  } else {
    // Desktop must put the caret in the panel.
    if (!after.activeInsidePanel) {
      console.log('FAIL: at 1440 the press must move focus into the ticket panel.')
      failures += 1
    }
  }
  await context.close()
}

await browser.close()
console.log(`\n[get-tickets] failures: ${failures}`)
process.exitCode = failures > 0 ? 1 : 0
