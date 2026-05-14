// Batch 6 - city + suburb screenshot capture.
// 20 city pages x 2 viewports = 40
// 24 suburb pages x 2 viewports = 48
// Plus: Sydney mapbox capture, Sydney mobile sticky CTA, 4 city/competitor
//   side-by-side composites.
// Requires the dev server on http://localhost:3002 (or override BASE).
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const ROOT = 'docs/redesign/batch-6-evidence'
const PAGE_DIR = `${ROOT}/after`
const RAIL_DIR = `${ROOT}/map`
const COMP_DIR = `${ROOT}/comparisons`
const STICKY_PATH = `${ROOT}/mobile-sticky-cta.png`

for (const d of [ROOT, PAGE_DIR, RAIL_DIR, COMP_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

const cityRoutes = [
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
  'gold-coast', 'canberra', 'hobart',
  'newcastle', 'wollongong', 'geelong', 'townsville', 'cairns',
  'darwin', 'sunshine-coast', 'bendigo', 'ballarat', 'albury',
  'launceston', 'toowoomba',
]

const suburbRoutes = [
  ['sydney', 'inner-west'], ['sydney', 'north-shore'], ['sydney', 'eastern-suburbs'],
  ['sydney', 'western-sydney'], ['sydney', 'northern-beaches'], ['sydney', 'sutherland-shire'],
  ['melbourne', 'inner-melbourne'], ['melbourne', 'eastern-suburbs'], ['melbourne', 'western-suburbs'],
  ['melbourne', 'northern-suburbs'], ['melbourne', 'southern-suburbs'], ['melbourne', 'bayside'],
  ['brisbane', 'inner-city'], ['brisbane', 'north-side'], ['brisbane', 'south-side'],
  ['brisbane', 'west-end'],
  ['perth', 'inner-perth'], ['perth', 'northern-suburbs'], ['perth', 'southern-suburbs'],
  ['perth', 'coastal'],
  ['gold-coast', 'surfers-paradise'], ['gold-coast', 'broadbeach'],
  ['canberra', 'civic'],
  ['hobart', 'inner-city'],
]

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

async function primeLazy(page) {
  await page.evaluate(async () => {
    const total = document.body.scrollHeight
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 400))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
  })

  // 1) City pages: 20 x 2 = 40
  for (const vp of viewports) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const slug of cityRoutes) {
      const url = `${BASE}/city/${slug}`
      console.log(`[${vp.name}] city ${slug}`)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
        await primeLazy(page)
        await page.screenshot({ path: `${PAGE_DIR}/city-${slug}-${vp.name}.png`, fullPage: true })
      } catch (e) {
        console.log(`  (non-fatal: ${e.message?.slice(0, 160)})`)
      }
    }
    await page.close()
  }

  // 2) Suburb pages: 24 x 2 = 48
  for (const vp of viewports) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const [city, sub] of suburbRoutes) {
      const url = `${BASE}/city/${city}/${sub}`
      console.log(`[${vp.name}] suburb ${city}/${sub}`)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
        await primeLazy(page)
        await page.screenshot({ path: `${PAGE_DIR}/suburb-${city}-${sub}-${vp.name}.png`, fullPage: true })
      } catch (e) {
        console.log(`  (non-fatal: ${e.message?.slice(0, 160)})`)
      }
    }
    await page.close()
  }

  // 3) Mapbox capture: scroll Sydney @ 1440 to the map section, screenshot.
  {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    try {
      await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await primeLazy(page)
      const mapSection = page.locator('section', { hasText: 'Where Sydney is happening' }).first()
      await mapSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(2000) // mapbox needs a beat to recolor + render markers
      await mapSection.screenshot({ path: `${RAIL_DIR}/sydney-mapbox-1440.png` })
      console.log('mapbox sydney captured')
    } catch (e) {
      console.log(`  mapbox (non-fatal: ${e.message?.slice(0, 200)})`)
    }
    await page.close()
  }

  // 4) Mobile sticky CTA capture.
  {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 375, height: 812 })
    try {
      await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await page.evaluate(() => window.scrollTo(0, 700))
      await page.waitForTimeout(1200)
      await page.screenshot({ path: STICKY_PATH, fullPage: false })
      console.log('mobile sticky cta captured')
    } catch (e) {
      console.log(`  sticky (non-fatal: ${e.message?.slice(0, 200)})`)
    }
    await page.close()
  }

  // 5) Side-by-side composites (Sydney/Melbourne/Brisbane/Perth) with the
  //    Ticketmaster + Airbnb references already captured to /references/.
  //    We don't generate a literal image composite (would need a canvas
  //    library); instead we emit a markdown index per city pointing at
  //    the three side-by-side images so the PM review links are 1-click.
  for (const city of ['sydney', 'melbourne', 'brisbane', 'perth']) {
    const md = `# Batch 6 comparison - ${city.toUpperCase()} vs Ticketmaster + Airbnb

## EventLinqs /city/${city}
- Desktop 1440: \`../after/city-${city}-1440.png\`
- Mobile 375:   \`../after/city-${city}-375.png\`

## Ticketmaster (city guide pattern)
- AU desktop 1440: \`../../references/ticketmaster/tm-au-sydney-1440.png\`
- AU mobile 375:   \`../../references/ticketmaster/tm-au-sydney-375.png\`
- UK desktop 1440 (London city guide reference):
  \`../../references/ticketmaster/tm-uk-london-1440.png\`

## Airbnb experiences (Sydney destination)
- Desktop 1440: \`../../references/airbnb/airbnb-sydney-1440.png\`
- Mobile 375:   \`../../references/airbnb/airbnb-sydney-375.png\`

## Notes
- EventLinqs hero opens with photographic city image + 2 CTAs above the fold.
- DateFilterChips sit sticky below the hero (Tonight, Weekend, 7d, 30d, All).
- Mapbox map with brand-recoloured base + gold pins + suburb polygons (Tier 1).
- 8 event-type rail tiles routing to /events?city=&event_type=.
- Suburb rail (Tier 1) routing to /city/[slug]/[suburb].
- Mobile sticky CTA bar after hero scroll - documented in
  ../mobile-sticky-cta.png.
- Editorial section names 3+ cultural communities + 2+ suburbs per city.
`
    writeFileSync(`${COMP_DIR}/${city}-vs-tm-airbnb.md`, md)
  }

  await ctx.close()
  await browser.close()
  console.log('done')
}

main().catch(e => { console.error(e); process.exit(1) })
