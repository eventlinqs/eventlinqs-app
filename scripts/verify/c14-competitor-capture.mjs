/**
 * C14.13 BENCHMARK CAPTURE: Ticketmaster AU, Eventbrite AU, DICE, Humanitix and
 * TryBooking, on their own live pages, today, measured with the SAME in-page
 * rubric code as our screens (scripts/verify/lib/rubric-in-page.mjs), at 1440
 * and 390. Law 7: the competitor's own page, never a guide about it.
 *
 * Per competitor: the homepage, the browse/discovery page, and the first event
 * reached by CLICKING a card on browse (never a guessed URL), then the ticket
 * step where a public control opens it. Checkout and organiser dashboards sit
 * behind a purchase or a login and are NOT captured; the study records that.
 *
 * Output per cell: a fold PNG (viewport only), a full-page JPEG (quality 60,
 * clamped by Playwright to the page), and the rubric metrics, into
 * <out>/<competitor>/<page>-<width>.{png,jpg} and <out>/benchmark.json.
 *
 * Usage: node scripts/verify/c14-competitor-capture.mjs --out C:/dev/EVIDENCE/C14/benchmark [--only dice,humanitix]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { measureInPage } from './lib/rubric-in-page.mjs'

const args = process.argv.slice(2)
let out = null
let only = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--only') only = args[++i].split(',')
}
if (!out) {
  console.error('FAIL: --out is required')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true },
]

/* Each competitor: the public entry pages, and how to reach an event from browse by clicking. */
const COMPETITORS = {
  ticketmaster: {
    home: 'https://www.ticketmaster.com.au/',
    browse: ['https://www.ticketmaster.com.au/discover/concerts'],
    cardSelector: 'a[href*="/event/"]',
    ticketSelector: 'a:has-text("Find tickets"), a:has-text("Buy tickets"), button:has-text("Find tickets")',
  },
  eventbrite: {
    home: 'https://www.eventbrite.com.au/',
    browse: ['https://www.eventbrite.com.au/d/australia--melbourne/all-events/'],
    cardSelector: 'a[href*="/e/"]',
    ticketSelector: 'button:has-text("Get tickets"), button:has-text("Register"), button:has-text("Reserve a spot")',
  },
  dice: {
    home: 'https://dice.fm/',
    browse: ['https://dice.fm/browse/melbourne', 'https://dice.fm/melbourne', 'https://dice.fm/browse'],
    cardSelector: 'a[href*="/event/"]',
    ticketSelector: 'button:has-text("Get tickets"), a:has-text("Get tickets"), button:has-text("Buy now")',
  },
  humanitix: {
    home: 'https://humanitix.com/au',
    // No guessable browse address answered (three candidates 404ed on the
    // first two passes), so browse is reached the way a visitor reaches it:
    // the Explore control on the homepage search rig.
    browse: [],
    // The control reads "Explore Nearby" once the page has a location.
    browseVia: { from: 'https://humanitix.com/au', click: /^explore/i },
    cardSelector: 'a[href*="events.humanitix.com/"], a[href*="humanitix.com/au/"][href*="/event"], a[href*="/events/"]',
    ticketSelector: 'a:has-text("Get tickets"), button:has-text("Get tickets"), a:has-text("Buy tickets")',
  },
  trybooking: {
    home: 'https://www.trybooking.com/',
    browse: [],
    browseVia: { from: 'https://www.trybooking.com/', click: /^explore events$/i },
    cardSelector: 'a[href*="/events/landing"], a[href*="/book-events"], a[href*="trybooking.com/"][href*="/events/"]',
    ticketSelector: 'a:has-text("Book now"), button:has-text("Book now"), a:has-text("Buy tickets")',
  },
}

const browser = await chromium.launch({ headless: true })
const results = []

async function acceptCookies(page) {
  const labels = [/accept all/i, /accept cookies/i, /^accept$/i, /agree/i, /got it/i, /allow all/i, /^ok$/i]
  for (const el of await page.$$('button, a[role="button"]')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (labels.some((rx) => rx.test(t)) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      await page.waitForTimeout(600)
      return t
    }
  }
  return null
}

async function capture(page, dir, name, width) {
  await page.waitForTimeout(1200)
  const fold = join(dir, `${name}-${width}.png`)
  await page.screenshot({ path: fold, type: 'png' }).catch(() => {})
  // settle lazy content
  await page
    .evaluate(async () => {
      const h = Math.min(document.documentElement.scrollHeight, 9000)
      for (let y = 0; y < h; y += 700) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 80))
      }
      window.scrollTo(0, 0)
    })
    .catch(() => {})
  await page.waitForTimeout(800)
  const full = join(dir, `${name}-${width}.jpg`)
  await page.screenshot({ path: full, type: 'jpeg', quality: 60, fullPage: true }).catch(() => {})
  const metrics = await page.evaluate(measureInPage).catch((e) => ({ error: String(e).slice(0, 200) }))
  const title = await page.title().catch(() => '')
  return { name, width, url: page.url(), title, fold, full, metrics }
}

function line(r) {
  const m = r.metrics
  if (!m || m.error) return `[${r.name} ${r.width}] ${r.url} metrics failed: ${m?.error ?? 'none'}`
  const sizes = Object.keys(m.fontSizes).map(parseFloat).sort((a, b) => a - b)
  return `[${r.name} ${r.width}] ${r.url.slice(0, 80)} sizes=${sizes.length} (${sizes.join('/')}) families=${Object.keys(m.families).slice(0, 4).join('|')} radii=${Object.keys(m.radii).length} shadows=${Object.keys(m.shadows).length} maxLine=${m.lineLengths.max} over75=${m.lineLengths.over75.length} orphans=${m.orphanCount} small=${m.smallTargetCount}/${m.interactiveCount} darkRules=${m.darkRules}`
}

for (const [key, c] of Object.entries(COMPETITORS)) {
  if (only && !only.includes(key)) continue
  const dir = join(out, key)
  mkdirSync(dir, { recursive: true })
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      userAgent: vp.mobile ? UA.replace('Windows NT 10.0; Win64; x64', 'Linux; Android 14; Pixel 8') : UA,
      locale: 'en-AU',
      timezoneId: 'Australia/Melbourne',
    })
    const page = await context.newPage()
    const log = []
    const step = async (name, fn) => {
      try {
        const r = await fn()
        if (r) {
          results.push({ competitor: key, ...r })
          console.log(key, line(r))
        }
      } catch (e) {
        log.push(`${name}: ${String(e).slice(0, 200)}`)
        console.log(`${key} [${name} ${vp.width}] FAILED: ${String(e).slice(0, 160)}`)
      }
    }

    await step('home', async () => {
      await page.goto(c.home, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      const accepted = await acceptCookies(page)
      if (accepted) log.push(`home: accepted cookies via "${accepted}"`)
      return capture(page, dir, 'home', vp.width)
    })

    let eventUrl = null
    await step('browse', async () => {
      let r = null
      if (c.browseVia) {
        await page.goto(c.browseVia.from, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await acceptCookies(page)
        let clicked = null
        for (const el of await page.$$('a, button')) {
          const t = ((await el.innerText().catch(() => '')) || '').trim()
          if (c.browseVia.click.test(t) && (await el.isVisible().catch(() => false))) {
            const href = await el.getAttribute('href').catch(() => null)
            if (href) await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
            else await el.click({ timeout: 10_000 })
            clicked = t
            break
          }
        }
        if (!clicked) throw new Error(`no "${c.browseVia.click}" control on ${c.browseVia.from}`)
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(3000)
        log.push(`browse: reached ${page.url()} via "${clicked}"`)
        const card = await page.$(c.cardSelector)
        if (card) eventUrl = await card.getAttribute('href')
        else log.push('browse: no event card matched the selector')
        return capture(page, dir, 'browse', vp.width)
      }
      for (const url of c.browse) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(2500)
        await acceptCookies(page)
        const card = await page.$(c.cardSelector)
        if (card) {
          eventUrl = await card.getAttribute('href')
          r = await capture(page, dir, 'browse', vp.width)
          log.push(`browse: ${url} showed cards`)
          break
        }
        log.push(`browse: ${url} showed no event card`)
      }
      if (!r) r = await capture(page, dir, 'browse', vp.width)
      return r
    })

    await step('event', async () => {
      if (!eventUrl) throw new Error('no event card found on browse')
      // the card's own address, followed directly: several of these sites open cards in a new tab
      const abs = new URL(eventUrl, page.url()).toString()
      await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await acceptCookies(page)
      const r = await capture(page, dir, 'event', vp.width)
      const ticket = await page.$(c.ticketSelector)
      if (ticket) {
        await ticket.click({ timeout: 10_000 }).catch(() => {})
        await page.waitForTimeout(4000)
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        const t = await capture(page, dir, 'tickets', vp.width)
        results.push({ competitor: key, ...t })
        console.log(key, line(t))
      } else {
        log.push('event: no public ticket control found')
      }
      return r
    })

    results.push({ competitor: key, width: vp.width, log })
    await context.close()
  }
}
await browser.close()
writeFileSync(join(out, 'benchmark.json'), JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2))
console.log(`wrote ${join(out, 'benchmark.json')}`)
