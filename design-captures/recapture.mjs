// Re-capture the two slots that failed QA: TM city-page (404 on guessed URL) and
// EB checkout (modal did not open). Updates entries in manifest.json.
import { chromium, devices } from 'playwright'
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const EB_EVENT = 'https://www.eventbrite.com.au/e/barunga-festival-2026-indigenous-culture-music-sport-tickets-1983843627694?aff=ebdssbdestsearch'

function upsert(rec) {
  const i = manifest.findIndex(m => m.competitor === rec.competitor && m.pageType === rec.pageType && m.viewport === rec.viewport)
  if (i >= 0) manifest[i] = rec; else manifest.push(rec)
}
async function dismiss(page) {
  for (const s of ['#onetrust-accept-btn-handler','button:has-text("Accept All")','button:has-text("Accept")']) {
    try { const e = page.locator(s).first(); if (await e.isVisible({ timeout: 800 })) { await e.click({ timeout: 1500 }); await page.waitForTimeout(300); break } } catch {}
  }
}

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })

for (const viewport of ['desktop','mobile']) {
  const w = viewport === 'desktop' ? 1440 : 390
  const ctxOpts = viewport === 'desktop'
    ? { viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
    : { ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })

  // ── TM city: extract a real city link from the TM homepage ──
  {
    const page = await ctx.newPage()
    const rec = { competitor: 'ticketmaster', pageType: 'city-page', viewport }
    try {
      await page.goto('https://www.ticketmaster.com.au/', { waitUntil: 'domcontentloaded', timeout: 35000 })
      await dismiss(page); await page.waitForTimeout(1500)
      const href = await page.evaluate(() => {
        const as = Array.from(document.querySelectorAll('a[href]'))
        const byPath = as.find(a => /\/city\//i.test(a.getAttribute('href')||''))
        if (byPath) return new URL(byPath.getAttribute('href'), location.origin).href
        const byText = as.find(a => /^(sydney|melbourne|brisbane|perth)$/i.test((a.textContent||'').trim()))
        return byText ? new URL(byText.getAttribute('href'), location.origin).href : null
      })
      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 35000 })
        await dismiss(page); await page.waitForTimeout(2500)
        const title = await page.title().catch(()=> '')
        const textLen = await page.evaluate(()=> (document.body?.innerText||'').length).catch(()=>0)
        const is404 = /could not be found|not found/i.test(await page.evaluate(()=> document.body?.innerText?.slice(0,400) || ''))
        const sh = await page.evaluate(()=> document.body?document.body.scrollHeight:0).catch(()=>0)
        const file = join(ROOT, 'ticketmaster', `city-page-${viewport}.png`)
        mkdirSync(dirname(file), { recursive: true })
        await page.screenshot({ path: file, clip: { x:0, y:0, width: w, height: Math.max(600, Math.min(sh, viewport==='desktop'?7000:9000)) } })
        Object.assign(rec, { url: href, finalUrl: page.url(), title, textLen, bytes: statSync(file).size, blocked: is404 || textLen < 250, note: is404 ? 'resolved city link still 404' : 'real TM city link from homepage', file: `design-captures/ticketmaster/city-page-${viewport}.png` })
      } else {
        rec.note = 'NO city-page equivalent: no /city/ link on TM AU homepage (city is a search/location facet, not a landing page)'
      }
    } catch (e) { rec.error = String(e?.message ?? e).slice(0,200) }
    upsert(rec); console.log('TM city', viewport, rec.note || rec.error, rec.bytes ? (rec.bytes/1024).toFixed(0)+'KB' : '')
    await page.close().catch(()=>{})
  }

  // ── EB checkout: open the real checkout modal/iframe ──
  {
    const page = await ctx.newPage()
    const rec = { competitor: 'eventbrite', pageType: 'checkout', viewport, url: EB_EVENT }
    try {
      await page.goto(EB_EVENT, { waitUntil: 'domcontentloaded', timeout: 35000 })
      await dismiss(page); await page.waitForTimeout(2000)
      const cta = page.locator('button:has-text("Get tickets"), a:has-text("Get tickets"), button:has-text("Reserve a spot"), button:has-text("Register")').first()
      await cta.click({ timeout: 8000 })
      // wait for the checkout modal/iframe to mount
      await page.waitForSelector('iframe[src*="checkout"], iframe[id*="checkout"], [class*="eds-modal"], [data-testid*="modal"]', { timeout: 12000 }).catch(()=>{})
      await page.waitForTimeout(4000)
      const file = join(ROOT, 'eventbrite', `checkout-${viewport}.png`)
      mkdirSync(dirname(file), { recursive: true })
      await page.screenshot({ path: file }) // viewport shot captures the overlay
      const hasModal = await page.evaluate(()=> !!document.querySelector('iframe[src*="checkout"], iframe[id*="checkout"], [class*="eds-modal"]'))
      Object.assign(rec, { finalUrl: page.url(), title: await page.title().catch(()=> ''), bytes: statSync(file).size, file: `design-captures/eventbrite/checkout-${viewport}.png`, note: hasModal ? 'checkout modal/iframe opened via Get tickets' : 'CTA clicked; modal selector not confirmed (viewport shot)', blocked: false })
    } catch (e) { rec.error = String(e?.message ?? e).slice(0,200); rec.note = 'checkout not capturable (gated/no modal)' }
    upsert(rec); console.log('EB checkout', viewport, rec.note || rec.error, rec.bytes ? (rec.bytes/1024).toFixed(0)+'KB' : '')
    await page.close().catch(()=>{})
  }

  await ctx.close()
}
await browser.close()
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('recapture done')
