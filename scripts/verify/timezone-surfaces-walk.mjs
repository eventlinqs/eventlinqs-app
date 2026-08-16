/**
 * The four timezone surfaces, walked in a real browser under TWO reader zones.
 *
 * WHY INVARIANCE RATHER THAN EYEBALLING ONE DATE. The property being proven is
 * "the date shown depends on the EVENT's zone, not the reader's". Reading one
 * page in one zone cannot show that: the number would look plausible either
 * way. Rendering the SAME page under two very different reader zones and
 * getting a byte-identical date string is the property itself.
 *
 * The zones are chosen to straddle a calendar day. The planted sale_start is
 * 15:30 UTC, which is 11:30 pm on 1 December in Perth and 4:30 am on 2 December
 * in Auckland, so a reader-zone bug changes the DAY and not merely the hour.
 *
 * Run against a built server (npm run build && next start), once per zone:
 *   TZ=Australia/Perth   node scripts/verify/timezone-surfaces-walk.mjs <base> perth
 *   TZ=Pacific/Auckland  node scripts/verify/timezone-surfaces-walk.mjs <base> auckland
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3200'
const LABEL = process.argv[3] ?? 'unknown'
/** The READER's IANA zone, applied to the browser context. */
const READER_ZONE = process.argv[4] ?? 'Australia/Melbourne'
const OUT = 'docs/roast/timezone-walk-2026-08-09'
mkdirSync(`${OUT}/shots`, { recursive: true })

/** The event whose ticket picker carries the planted near-midnight sale_start. */
const PERTH_EVENT = 'afrobeats-amapiano-live-at-the-rosemount-perth'
/** A Sydney event at 13:30 UTC, which is 11:30 pm Sydney and next-day in Auckland. */
const STRADDLE_EVENT = 'marketplace-regression-comedy-free-night-at-waterf-q5758z'

const SURFACES = [
  { name: 'ticket-selector', path: `/events/${PERTH_EVENT}`, needle: /Sale opens[^<]*/ },
  { name: 'trending-bento', path: '/', needle: null },
  { name: 'surprise-me', path: '/', needle: null },
  { name: 'artist-credits', path: '/artists', needle: null },
  { name: 'straddle-event', path: `/events/${STRADDLE_EVENT}`, needle: null },
]

const results = []
const browser = await chromium.launch()

for (const surface of SURFACES) {
  for (const width of [1440, 390]) {
    // THE READER'S ZONE, set on the browser context rather than the process.
    // This is the lever that actually matters: it changes what the hydrating
    // client sees, which is the half of the mismatch a server-side TZ cannot
    // reproduce. Setting process.env.TZ only moves the SERVER, so a walk that
    // varied that alone would have proven half the property and looked complete.
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      timezoneId: READER_ZONE,
      locale: 'en-AU',
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await page.goto(`${BASE}${surface.path}`, { waitUntil: 'networkidle', timeout: 45000 })

    // The surprise-me modal needs opening before it renders a date.
    if (surface.name === 'surprise-me') {
      const btn = page.locator('button', { hasText: /surprise/i }).first()
      if ((await btn.count()) > 0) {
        await btn.click().catch(() => {})
        await page.waitForTimeout(1500)
      }
    }

    const body = await page.innerText('body').catch(() => '')

    // Every date-shaped string on the page. Compared across zones verbatim.
    const dates = [...body.matchAll(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}\b/g)].map((m) => m[0])
    const shortDates = [...body.matchAll(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g)].map((m) => m[0])
    const saleOpens = surface.needle ? (body.match(surface.needle)?.[0] ?? null) : null

    results.push({
      surface: surface.name,
      width,
      readerZone: LABEL,
      readerZoneId: READER_ZONE,
      saleOpens,
      dates: dates.slice(0, 12),
      shortDates: shortDates.slice(0, 12),
      consoleErrors: errors.length,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    })

    await page.screenshot({ path: `${OUT}/shots/${surface.name}-${width}-${LABEL}.png` })
    await ctx.close()
  }
}

await browser.close()
writeFileSync(`${OUT}/walk-${LABEL}.json`, JSON.stringify({ base: BASE, label: LABEL, readerZone: READER_ZONE, results }, null, 2))
console.log(JSON.stringify(results.filter((r) => r.width === 1440), null, 2))
