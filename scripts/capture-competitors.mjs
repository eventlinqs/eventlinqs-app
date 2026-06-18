// Fresh competitor mirror captures: Ticketmaster.com.au + Eventbrite.com.au at
// 1440 + 390, today. Stores above-fold screenshots and a heuristic hero-height
// measurement (largest top banner image/bg + first h1 offset) under
// docs/benchmark/competitor-2026/. Screenshots are the primary evidence; the
// measured numbers are an automated heuristic, confirmed visually in the report.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ROOT = 'docs/benchmark/competitor-2026'
const VPS = [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]

// Heuristic hero measurement: in the top 1300px, find the tallest image /
// picture / element with a background-image; also the first h1 top. Returns the
// "hero band" as max(banner bottom, h1 area) - a defensible "vertical space
// before content" proxy. Confirmed against the screenshot in the report.
const MEASURE = () => {
  const vh = window.innerHeight
  let bannerBottom = 0, bannerH = 0, kind = 'none'
  const els = Array.from(document.querySelectorAll('img,picture,section,div,header'))
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.top > 1300 || r.width < window.innerWidth * 0.6) continue
    const cs = getComputedStyle(el)
    const hasBg = cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage)
    const isImg = el.tagName === 'IMG' || el.tagName === 'PICTURE'
    if ((hasBg || isImg) && r.height > bannerH && r.height < vh * 1.4) {
      bannerH = Math.round(r.height); bannerBottom = Math.round(r.bottom); kind = isImg ? 'img' : 'bg'
    }
  }
  const h1 = document.querySelector('h1')
  const h1top = h1 ? Math.round(h1.getBoundingClientRect().top) : null
  const h1bottom = h1 ? Math.round(h1.getBoundingClientRect().bottom) : null
  return { vh, bannerH, bannerBottom, bannerKind: kind, h1top, h1bottom }
}

async function shoot(b, label, url, discover) {
  const out = {}
  for (const [vn, vp] of VPS) {
    try {
      const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, userAgent: UA, locale: 'en-AU' })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 })
      await page.waitForTimeout(5000)
      // dismiss common cookie banners that inflate the fold
      for (const t of ['Accept all', 'Accept All', 'Accept', 'I agree', 'Got it', 'Allow all']) {
        try { await page.getByRole('button', { name: t, exact: false }).first().click({ timeout: 1200 }); break } catch {}
      }
      await page.waitForTimeout(800)
      const m = await page.evaluate(MEASURE)
      const dir = `${ROOT}/${label.split('/')[0]}`
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${ROOT}/${label.replace('/', '__')}-${vn}.png`, clip: { x: 0, y: 0, width: vp.width, height: vp.height } })
      out[vn] = { url, ...m }
      console.log(`OK ${label} ${vn}  banner=${m.bannerH}px(${m.bannerKind}) bannerBottom=${m.bannerBottom} h1top=${m.h1top}`)
      if (discover && vn === '1440') {
        try { out._discovered = await page.evaluate(discover) } catch {}
      }
      await ctx.close()
    } catch (e) { console.log(`ERR ${label} ${vn}: ${e.message.slice(0, 80)}`); out[vn] = { url, error: e.message.slice(0, 80) } }
  }
  return out
}

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })
mkdirSync(ROOT, { recursive: true })
const results = {}

// ---- Eventbrite (primary comparator) ----
results['eventbrite/home'] = await shoot(b, 'eventbrite/home', 'https://www.eventbrite.com.au/')
const ebBrowse = await shoot(b, 'eventbrite/browse', 'https://www.eventbrite.com.au/d/australia--sydney/all-events/',
  () => { const a = document.querySelector('a[href*="/e/"]'); return a ? a.href : null })
results['eventbrite/browse'] = ebBrowse
results['eventbrite/category-music'] = await shoot(b, 'eventbrite/category-music', 'https://www.eventbrite.com.au/d/australia--sydney/music--events/')
const ebEvent = ebBrowse._discovered
if (ebEvent) results['eventbrite/event-detail'] = await shoot(b, 'eventbrite/event-detail', ebEvent)
results['eventbrite/pricing'] = await shoot(b, 'eventbrite/pricing', 'https://www.eventbrite.com/organizer/pricing/')
results['eventbrite/help'] = await shoot(b, 'eventbrite/help', 'https://www.eventbrite.com.au/help/')
results['eventbrite/signup'] = await shoot(b, 'eventbrite/signup', 'https://www.eventbrite.com.au/signup/')

// ---- Ticketmaster.com.au ----
results['ticketmaster/home'] = await shoot(b, 'ticketmaster/home', 'https://www.ticketmaster.com.au/')
const tmDisc = await shoot(b, 'ticketmaster/discover', 'https://www.ticketmaster.com.au/discover/concerts',
  () => { const a = document.querySelector('a[href*="/event/"]'); return a ? a.href : null })
results['ticketmaster/discover'] = tmDisc
const tmEvent = tmDisc._discovered
if (tmEvent) results['ticketmaster/event-detail'] = await shoot(b, 'ticketmaster/event-detail', tmEvent)
results['ticketmaster/help'] = await shoot(b, 'ticketmaster/help', 'https://help.ticketmaster.com.au/hc/en-au')
results['ticketmaster/signin'] = await shoot(b, 'ticketmaster/signin', 'https://auth.ticketmaster.com.au/as/authorization.oauth2?client_id=35a8b81e-7edb-4e8b-9a4a-3a1e1d7d2c9e')

await b.close()
writeFileSync(`${ROOT}/measurements.json`, JSON.stringify(results, null, 2), 'utf8')
console.log('\nwrote ' + ROOT + '/measurements.json')
