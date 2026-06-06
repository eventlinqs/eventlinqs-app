// Competitor design-intelligence capture. Playwright, desktop 1440 + mobile 390.
// Writes screenshots + manifest.json into design-captures/. No source code touched.
// Disk-guarded: aborts remaining captures if free space drops below MIN_FREE_MB.
import { chromium, devices } from 'playwright'
import { statfsSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MIN_FREE_MB = 400
const NAV_TIMEOUT = 35000
const DESKTOP_MAX_H = 7000
const MOBILE_MAX_H = 9000

function freeMB() {
  try { const s = statfsSync(ROOT); return Math.floor((s.bavail * s.bsize) / (1024 * 1024)) } catch { return 99999 }
}

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

// Competitor equivalents of each EventLinqs page. nav: 'goto' | 'firstEvent' | 'ticketsModal'
const PLAN = {
  ticketmaster: {
    label: 'Ticketmaster.com.au',
    pages: [
      { type: 'homepage',        nav: 'goto', url: 'https://www.ticketmaster.com.au/' },
      { type: 'browse-discovery',nav: 'goto', url: 'https://www.ticketmaster.com.au/discover/concerts' },
      { type: 'search-results',  nav: 'goto', url: 'https://www.ticketmaster.com.au/search?q=music' },
      { type: 'event-detail',    nav: 'firstEvent', from: 'https://www.ticketmaster.com.au/discover/concerts', linkRe: '/event/' },
      { type: 'city-page',       nav: 'goto', url: 'https://www.ticketmaster.com.au/city/sydney/199' },
      { type: 'for-organisers',  nav: 'goto', url: 'https://business.ticketmaster.com.au/' },
    ],
  },
  eventbrite: {
    label: 'Eventbrite.com.au',
    pages: [
      { type: 'homepage',        nav: 'goto', url: 'https://www.eventbrite.com.au/' },
      { type: 'browse-discovery',nav: 'goto', url: 'https://www.eventbrite.com.au/d/australia/all-events/' },
      { type: 'search-results',  nav: 'goto', url: 'https://www.eventbrite.com.au/d/online/all-events/?q=music' },
      { type: 'event-detail',    nav: 'firstEvent', from: 'https://www.eventbrite.com.au/d/australia/all-events/', linkRe: '/e/' },
      { type: 'checkout',        nav: 'ticketsModal', from: 'https://www.eventbrite.com.au/d/australia/all-events/', linkRe: '/e/' },
      { type: 'city-page',       nav: 'goto', url: 'https://www.eventbrite.com.au/d/australia--sydney/all-events/' },
      { type: 'for-organisers',  nav: 'goto', url: 'https://www.eventbrite.com.au/organizer/overview/' },
    ],
  },
}

const manifest = []

function blockedHeuristic(title, textLen) {
  if (/just a moment|pardon the interruption|access denied|are you a robot|attention required|forbidden|blocked|enable javascript|verifying you are human/i.test(title)) return true
  if (textLen < 250) return true
  return false
}

async function dismissBanners(page) {
  const sels = ['#onetrust-accept-btn-handler', 'button#accept', '[aria-label="Accept"]',
    'button:has-text("Accept All")', 'button:has-text("Accept all")', 'button:has-text("Accept")',
    'button:has-text("I Accept")', 'button:has-text("Got it")']
  for (const s of sels) {
    try { const el = page.locator(s).first(); if (await el.isVisible({ timeout: 800 })) { await el.click({ timeout: 1500 }); await page.waitForTimeout(400); break } } catch {}
  }
}

async function settle(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
  await page.waitForTimeout(1200)
  // nudge a couple of lazy sections into view
  try { await page.evaluate(() => window.scrollTo(0, 1400)); await page.waitForTimeout(700); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400) } catch {}
}

async function capture(context, viewport, maxH, competitor, pageType, url) {
  if (freeMB() < MIN_FREE_MB) { manifest.push({ competitor, pageType, viewport, url, skipped: 'disk-guard', freeMB: freeMB() }); return null }
  const page = await context.newPage()
  const rec = { competitor, pageType, viewport, url }
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    await dismissBanners(page)
    await settle(page)
    const title = await page.title().catch(() => '')
    const textLen = await page.evaluate(() => (document.body?.innerText || '').length).catch(() => 0)
    const sh = await page.evaluate(() => document.body ? document.body.scrollHeight : 0).catch(() => 0)
    const h = Math.max(600, Math.min(sh || maxH, maxH))
    const w = viewport === 'desktop' ? 1440 : 390
    const file = join(ROOT, competitor, `${pageType}-${viewport}.png`)
    mkdirSync(dirname(file), { recursive: true })
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } })
    const bytes = statSync(file).size
    rec.finalUrl = page.url(); rec.title = title; rec.bytes = bytes
    rec.blocked = blockedHeuristic(title, textLen); rec.textLen = textLen
    rec.file = `design-captures/${competitor}/${pageType}-${viewport}.png`
    console.log(`  ${competitor}/${pageType}-${viewport}  ${(bytes/1024).toFixed(0)}KB  blocked=${rec.blocked}  free=${freeMB()}MB`)
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 200)
    console.log(`  ${competitor}/${pageType}-${viewport}  ERROR ${rec.error}`)
  } finally {
    manifest.push(rec)
    await page.close().catch(() => {})
  }
  return rec
}

async function firstEventUrl(context, from, linkRe) {
  const page = await context.newPage()
  let href = null
  try {
    await page.goto(from, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    await dismissBanners(page); await settle(page)
    href = await page.evaluate((re) => {
      const rx = new RegExp(re)
      const a = Array.from(document.querySelectorAll('a[href]')).map(x => x.href).filter(h => rx.test(h))
      return a[0] || null
    }, linkRe)
  } catch {}
  await page.close().catch(() => {})
  return href
}

async function captureTicketsModal(context, viewport, maxH, competitor, eventUrl) {
  if (!eventUrl) { manifest.push({ competitor, pageType: 'checkout', viewport, note: 'no event url resolved' }); return }
  if (freeMB() < MIN_FREE_MB) { manifest.push({ competitor, pageType: 'checkout', viewport, skipped: 'disk-guard' }); return }
  const page = await context.newPage()
  const rec = { competitor, pageType: 'checkout', viewport, url: eventUrl }
  try {
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    await dismissBanners(page); await settle(page)
    const cta = page.locator('button:has-text("Get tickets"), a:has-text("Get tickets"), button:has-text("Reserve"), button:has-text("Register"), button:has-text("Tickets")').first()
    await cta.click({ timeout: 6000 })
    await page.waitForTimeout(3500)
    const w = viewport === 'desktop' ? 1440 : 390
    const file = join(ROOT, competitor, `checkout-${viewport}.png`)
    mkdirSync(dirname(file), { recursive: true })
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: Math.min(maxH, 2200) } })
    rec.bytes = statSync(file).size; rec.finalUrl = page.url(); rec.title = await page.title().catch(()=> '')
    rec.file = `design-captures/${competitor}/checkout-${viewport}.png`; rec.note = 'tickets/checkout panel via CTA click'
    console.log(`  ${competitor}/checkout-${viewport}  ${(rec.bytes/1024).toFixed(0)}KB`)
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 200); rec.note = 'checkout CTA not capturable (gated)'
    console.log(`  ${competitor}/checkout-${viewport}  ERROR ${rec.error}`)
  } finally { manifest.push(rec); await page.close().catch(()=>{}) }
}

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })

for (const viewport of ['desktop', 'mobile']) {
  const maxH = viewport === 'desktop' ? DESKTOP_MAX_H : MOBILE_MAX_H
  const ctxOpts = viewport === 'desktop'
    ? { viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
    : { ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
  const context = await browser.newContext(ctxOpts)
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
  context.setDefaultTimeout(NAV_TIMEOUT)

  for (const key of Object.keys(PLAN)) {
    const comp = PLAN[key]
    console.log(`\n[${viewport}] ${comp.label}`)
    let resolvedEventUrl = null
    for (const p of comp.pages) {
      if (freeMB() < MIN_FREE_MB) { console.log(`  DISK GUARD: ${freeMB()}MB free, stopping ${key}`); manifest.push({ competitor: key, pageType: p.type, viewport, skipped: 'disk-guard' }); continue }
      if (p.nav === 'goto') { await capture(context, viewport, maxH, key, p.type, p.url) }
      else if (p.nav === 'firstEvent') {
        resolvedEventUrl = resolvedEventUrl || await firstEventUrl(context, p.from, p.linkRe)
        if (resolvedEventUrl) await capture(context, viewport, maxH, key, p.type, resolvedEventUrl)
        else manifest.push({ competitor: key, pageType: p.type, viewport, note: 'could not resolve a first-event link (likely bot-blocked listing)' })
      } else if (p.nav === 'ticketsModal') {
        resolvedEventUrl = resolvedEventUrl || await firstEventUrl(context, p.from, p.linkRe)
        await captureTicketsModal(context, viewport, maxH, key, resolvedEventUrl)
      }
    }
  }
  await context.close()
}

await browser.close()
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\nDONE. ${manifest.length} entries. free=${freeMB()}MB. manifest at design-captures/manifest.json`)
