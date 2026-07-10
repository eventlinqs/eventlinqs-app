// Rail-control evidence capture: Ticketmaster, Eventbrite, Airbnb homepages +
// Humanitix homepage hero carousel, at 1440 / 1180 (intermediate) / 390.
// Catalogues arrow geometry (placement, size, shape, states) and progress
// indication, and screenshots the fold + a hovered state. Output ->
// docs/benchmark/rail-controls/.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ROOT = 'docs/benchmark/rail-controls'
const WIDTHS = [['1440', 1440, 900], ['1180', 1180, 850], ['390', 390, 844]]
const SITES = [
  ['ticketmaster', 'https://www.ticketmaster.com.au/'],
  ['eventbrite', 'https://www.eventbrite.com.au/'],
  ['airbnb', 'https://www.airbnb.com.au/'],
  ['humanitix', 'https://www.humanitix.com/'],
]

// In-page: catalogue likely rail scroll-control buttons. Heuristic: buttons /
// [role=button] in the top 1400px whose aria-label or class hints at carousel
// nav, or that contain an svg and sit at a horizontal extreme of a scroller.
const CATALOGUE = () => {
  const hits = []
  const labelRe = /next|prev|previous|forward|back|scroll|slide|carousel|arrow/i
  const cands = Array.from(document.querySelectorAll('button,[role="button"],a'))
  for (const el of cands) {
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.top > 1400 || r.width < 24 || r.width > 90 || r.height < 24 || r.height > 90) continue
    const al = (el.getAttribute('aria-label') || '') + ' ' + (el.className?.toString?.() || '')
    const hasSvg = !!el.querySelector('svg,img')
    if (!labelRe.test(al) && !hasSvg) continue
    const cs = getComputedStyle(el)
    hits.push({
      label: (el.getAttribute('aria-label') || '').slice(0, 40),
      tag: el.tagName.toLowerCase(),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.borderWidth + ' ' + cs.borderColor,
      boxShadow: cs.boxShadow.slice(0, 40), opacity: cs.opacity,
    })
  }
  // de-dup very close hits
  return hits.slice(0, 24)
}

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })
mkdirSync(ROOT, { recursive: true })
const out = {}
for (const [site, url] of SITES) {
  out[site] = {}
  for (const [wn, w, h] of WIDTHS) {
    try {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, userAgent: UA, locale: 'en-AU' })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 })
      await page.waitForTimeout(5000)
      for (const t of ['Accept all', 'Accept All', 'Accept', 'I agree', 'OK', 'Got it', 'Allow all', 'Agree']) {
        try { await page.getByRole('button', { name: t, exact: false }).first().click({ timeout: 1000 }); break } catch {}
      }
      await page.waitForTimeout(800)
      const idle = await page.evaluate(CATALOGUE)
      await page.screenshot({ path: `${ROOT}/${site}-${wn}-idle.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 1000) } })
      // hover a likely rail band to reveal hover-only controls (desktop widths)
      if (wn !== '390') {
        try { await page.mouse.move(w / 2, 430); await page.waitForTimeout(600) } catch {}
        await page.screenshot({ path: `${ROOT}/${site}-${wn}-hover.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 1000) } })
      }
      const hover = wn !== '390' ? await page.evaluate(CATALOGUE) : null
      out[site][wn] = { idle, hover }
      console.log(`OK ${site} ${wn}: idleCtrls=${idle.length}${hover ? ' hoverCtrls=' + hover.length : ''}`)
      await ctx.close()
    } catch (e) { out[site][wn] = { error: e.message.slice(0, 90) }; console.log(`ERR ${site} ${wn}: ${e.message.slice(0, 80)}`) }
  }
}
await b.close()
writeFileSync(`${ROOT}/rail-controls-measurements.json`, JSON.stringify(out, null, 2))
console.log('\nwrote ' + ROOT + '/rail-controls-measurements.json')
