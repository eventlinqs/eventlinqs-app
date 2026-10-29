/**
 * THE HOME HERO'S DOTS KEEP CLEAR OF ITS BUTTON (the project manager's 18:38 of 29 October 2026, read by eye on
 * production: at 390 two of the four carousel dots sat ON 'View event details').
 *
 *   node scripts/verify/hero-dots-fit.mjs <base url> [out dir]
 *
 * At 390, 768 and 1440 it loads the home page, waits for the hero, and measures in the browser the visible hero
 * slide's button against every dot's 44 px target: the gap between their boxes must be 44 px or more, every target
 * must be at least 44 by 44, and nothing may overlap. GET only, under a user agent that names a crawler, so a run
 * against production is never counted as a person. It changes nothing.
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: node scripts/verify/hero-dots-fit.mjs <base url> [out dir]')
  process.exit(2)
}
const out = resolve(process.argv[3] ?? 'evidence-hero-dots')
mkdirSync(out, { recursive: true })
const UA = 'Mozilla/5.0 (compatible; EventLinqs-QA-crawler/1.0; hero dots fit)'
const CLEAR = 44

let fails = 0
const browser = await chromium.launch()
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, userAgent: UA, extraHTTPHeaders: { 'user-agent': UA } })
    const page = await context.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 300000 })
    await page.locator('[role="tablist"][aria-label="Choose featured event"]').waitFor({ timeout: 60000 }).catch(() => {})
    const seen = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Choose featured event"] [role="tab"]')]
      // The button of the slide a person sees: the one whose box is on screen and not hidden.
      const buttons = [...document.querySelectorAll('section.hero-marketing a.plausible-event-name\\=hero_get_tickets_click, .hero-marketing a[href^="/events/"]')]
      const visible = buttons.filter((b) => {
        const r = b.getBoundingClientRect()
        const s = getComputedStyle(b.closest('[aria-hidden="true"]') ?? b)
        return r.width > 0 && r.height > 0 && !b.closest('[aria-hidden="true"]') && s.visibility !== 'hidden'
      })
      const box = (e) => {
        const r = e.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }
      return { tabs: tabs.map(box), button: visible[0] ? box(visible[0]) : null, buttons: visible.length }
    })
    await page.screenshot({ path: join(out, `hero-${width}.png`) })
    if (seen.tabs.length < 2) {
      console.log(`SKIP at ${width}: ${seen.tabs.length} dot(s), a single slide draws no dots`)
      await context.close()
      continue
    }
    if (!seen.button) {
      fails += 1
      console.log(`FAIL at ${width}: no visible hero button found`)
      await context.close()
      continue
    }
    const b = seen.button
    const gap = (t) => {
      const dx = Math.max(0, t.x - (b.x + b.w), b.x - (t.x + t.w))
      const dy = Math.max(0, t.y - (b.y + b.h), b.y - (t.y + t.h))
      return Math.hypot(dx, dy)
    }
    const gaps = seen.tabs.map(gap)
    const nearest = Math.min(...gaps)
    const small = seen.tabs.filter((t) => t.w < 43.5 || t.h < 43.5).length
    const ok = nearest >= CLEAR - 0.5 && small === 0
    if (!ok) fails += 1
    console.log(
      `${ok ? 'PASS' : 'FAIL'} at ${width}: ${seen.tabs.length} dots, the nearest dot target is ${nearest.toFixed(1)} px from the button (needs ${CLEAR}), ${small} target(s) under 44 px; button ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`,
    )
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(fails === 0 ? 'FIT PASSED' : `FIT FAILED, ${fails} width(s)`)
process.exit(fails === 0 ? 0 : 1)
