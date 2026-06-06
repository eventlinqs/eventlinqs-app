// Re-capture a TM-NATIVE event page (ticketmaster.com.au/event/...), not a
// federated Moshtix link. Gathers candidate links across TM surfaces.
import { chromium, devices } from 'playwright'
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SOURCES = [
  'https://www.ticketmaster.com.au/',
  'https://www.ticketmaster.com.au/discover/sports',
  'https://www.ticketmaster.com.au/search?q=arena',
]
function upsert(rec) {
  const i = manifest.findIndex(m => m.competitor === rec.competitor && m.pageType === rec.pageType && m.viewport === rec.viewport)
  if (i >= 0) manifest[i] = rec; else manifest.push(rec)
}
async function dismiss(page) {
  for (const s of ['#onetrust-accept-btn-handler','button:has-text("Accept All")','button:has-text("Accept")']) {
    try { const e = page.locator(s).first(); if (await e.isVisible({ timeout: 800 })) { await e.click({ timeout: 1500 }); break } } catch {}
  }
}
async function findNativeEvent(ctx) {
  for (const src of SOURCES) {
    const page = await ctx.newPage()
    try {
      await page.goto(src, { waitUntil: 'domcontentloaded', timeout: 35000 })
      await dismiss(page); await page.waitForTimeout(1800)
      const href = await page.evaluate(() => {
        const as = Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        return as.find(h => /ticketmaster\.com\.au\/event\//i.test(h)) || null
      })
      await page.close().catch(()=>{})
      if (href) return href
    } catch { await page.close().catch(()=>{}) }
  }
  return null
}

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
for (const viewport of ['desktop','mobile']) {
  const w = viewport === 'desktop' ? 1440 : 390
  const ctxOpts = viewport === 'desktop'
    ? { viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
    : { ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'en-AU', timezoneId: 'Australia/Sydney' }
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
  const href = await findNativeEvent(ctx)
  const rec = { competitor: 'ticketmaster', pageType: 'event-detail', viewport }
  if (!href) {
    rec.note = 'NO native ticketmaster.com.au/event/ link found across homepage/sports/search; TM AU federates much discovery to Moshtix (TM-owned). Kept Moshtix capture as the TM-family event page.'
    console.log('TM native event', viewport, 'not found - keeping moshtix')
    // do not overwrite the existing moshtix capture
  } else {
    const page = await ctx.newPage()
    try {
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 35000 })
      await dismiss(page); await page.waitForTimeout(3000)
      const title = await page.title().catch(()=> '')
      const textLen = await page.evaluate(()=> (document.body?.innerText||'').length).catch(()=>0)
      const sh = await page.evaluate(()=> document.body?document.body.scrollHeight:0).catch(()=>0)
      const file = join(ROOT, 'ticketmaster', `event-detail-${viewport}.png`)
      mkdirSync(dirname(file), { recursive: true })
      await page.screenshot({ path: file, clip: { x:0, y:0, width: w, height: Math.max(600, Math.min(sh, viewport==='desktop'?7000:9000)) } })
      Object.assign(rec, { url: href, finalUrl: page.url(), title, textLen, bytes: statSync(file).size, blocked: textLen < 250, note: 'native ticketmaster.com.au event page', file: `design-captures/ticketmaster/event-detail-${viewport}.png` })
      upsert(rec)
      console.log('TM native event', viewport, (rec.bytes/1024).toFixed(0)+'KB', title.slice(0,50))
    } catch (e) { console.log('TM native event', viewport, 'ERROR', String(e?.message??e).slice(0,120)) }
    await page.close().catch(()=>{})
  }
  await ctx.close()
}
await browser.close()
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('tm-event recapture done')
