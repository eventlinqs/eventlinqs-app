// WI1 competitor capture: how the leaders present a FREE event a person just
// walks into, at 1440 and 390, on 21 October 2026 or after.
//
// Law 2 and the competitor-benchmark skill: the 2026 mirror was captured on
// 8 June 2026 and went stale on 6 September, and it never covered a free,
// unticketed event detail page, which is the page type WI1 builds. So this is a
// re-capture for a new page type, not a refresh.
//
// What it records for each page, beside the screenshots: the final URL, the
// title, the h1, and every visible call to action naming tickets, registration
// or RSVP, because the Law 7 reading found Eventbrite's own "No RSVP. No
// tickets." listing still showing a "Get tickets" button
// (docs/walk-in/LAW7-READING-2026-10-21.md).
//
// NO EVENTBRITE. Eventbrite's terms forbid automated reading of its pages, so
// it is not captured by this or any script (project manager, 22 October 2026,
// 11:15). What Eventbrite does is read by a person, in a browser, and recorded
// in the Law 7 reading with its URL.
//
// Usage: node scripts/wi1-competitor-capture.mjs [outDir]
// Default out: C:/dev/EVIDENCE/WI1/competitors. Screenshots are clamped to
// 1800px on the longest side (the skill's capture rule); a fold capture and a
// full-page capture are taken for each width.
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/WI1/competitors'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const VPS = [
  { label: '1440', viewport: { width: 1440, height: 900 }, ua: UA, mobile: false },
  { label: '390', viewport: { width: 390, height: 844 }, ua: MOBILE_UA, mobile: true },
]

/*
 * The pages, each found the way a person finds it, by opening the listing page
 * and following its first event, so the capture is of whatever is live that day
 * rather than of a URL that may have gone.
 */
const TARGETS = [
  {
    name: 'tm-au-festival-first-event',
    from: 'https://www.ticketmaster.com.au/search?q=festival',
    follow: 'a[href*="/event/"]',
  },
  {
    name: 'humanitix-melbourne-free-first-event',
    from: 'https://humanitix.com/au/search?query=free&location=Melbourne',
    follow: 'a[href*="events.humanitix.com/"]',
  },
]

const SAY = /\b(get tickets?|tickets?|register|registration|rsvp|reserve a spot|book now|free)\b/i

async function acceptCookies(page) {
  for (const name of [/accept all/i, /accept/i, /agree/i, /got it/i, /allow all/i]) {
    const button = page.getByRole('button', { name }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {})
      return
    }
  }
}

async function clamp(src, dest) {
  const meta = await sharp(src).metadata()
  const longest = Math.max(meta.width, meta.height)
  const img = sharp(src)
  if (longest > 1800) {
    if (meta.height >= meta.width) img.resize({ height: 1800 })
    else img.resize({ width: 1800 })
  }
  await img.png().toFile(dest)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const index = { captured: new Date().toISOString(), pages: [] }
try {
  for (const target of TARGETS) {
    for (const vp of VPS) {
      const context = await browser.newContext({ viewport: vp.viewport, userAgent: vp.ua, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'en-AU', timezoneId: 'Australia/Melbourne' })
      const page = await context.newPage()
      const record = { name: target.name, width: vp.label, requested: target.url ?? target.from }
      try {
        let url = target.url
        if (!url) {
          await page.goto(target.from, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await acceptCookies(page)
          await page.waitForSelector(target.follow, { timeout: 30000 })
          url = await page.locator(target.follow).first().getAttribute('href')
          if (url && url.startsWith('/')) url = new URL(url, target.from).toString()
          record.foundOn = target.from
        }
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await acceptCookies(page)
        await page.waitForTimeout(4000)
        record.status = res?.status() ?? null
        record.url = page.url()
        record.title = await page.title()
        record.h1 = (await page.locator('h1').first().textContent().catch(() => null))?.trim() ?? null
        record.calls = await page.evaluate((source) => {
          const re = new RegExp(source, 'i')
          const out = []
          for (const el of document.querySelectorAll('a, button')) {
            const r = el.getBoundingClientRect()
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
            if (!text || text.length > 60 || r.width === 0 || r.height === 0) continue
            if (re.test(text)) out.push(text)
          }
          return [...new Set(out)].slice(0, 20)
        }, SAY.source)
        const fold = join(OUT, `${target.name}-${vp.label}-fold.raw.png`)
        const full = join(OUT, `${target.name}-${vp.label}-full.raw.png`)
        await page.screenshot({ path: fold, fullPage: false })
        await page.screenshot({ path: full, fullPage: true })
        await clamp(fold, join(OUT, `${target.name}-${vp.label}-fold.png`))
        await clamp(full, join(OUT, `${target.name}-${vp.label}-full.png`))
        // A refused page is not a capture: Ticketmaster answered 401 with its
        // "Your Browsing Activity Has Been Paused" wall, no title and no h1, on
        // 22 October, and this line used to call that CAPTURED. The screenshots
        // stay, as evidence of the refusal, and the record says INVALID.
        record.ok = typeof record.status === 'number' && record.status < 400 && Boolean(record.h1)
        if (!record.ok) record.error = `INVALID: HTTP ${record.status}, h1 ${record.h1 === null ? 'missing' : JSON.stringify(record.h1)}`
      } catch (error) {
        record.ok = false
        record.error = error.message.split('\n')[0]
      }
      index.pages.push(record)
      console.log(`${record.ok ? 'CAPTURED' : 'FAILED  '} ${target.name} @${vp.label} ${record.url ?? ''} ${record.error ?? ''}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2))
}
process.exitCode = index.pages.every((p) => p.ok) ? 0 : 1
