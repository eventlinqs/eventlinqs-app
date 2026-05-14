// Batch 9.1.1 - Competitor reference captures.
//
// 9 sites x 2 viewports = 18 captures. Mobile uses iPhone 13 device profile
// to bypass anti-bot signatures observed in 9.1 references.
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-1-1-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { slug: 'ticketmaster',   url: 'https://www.ticketmaster.com.au', label: 'home' },
  { slug: 'dice',           url: 'https://dice.fm',                 label: 'home' },
  { slug: 'eventbrite',     url: 'https://www.eventbrite.com.au',   label: 'home' },
  { slug: 'ra',             url: 'https://ra.co/clubs',             label: 'cities-index' },
  { slug: 'airbnb-exp',     url: 'https://www.airbnb.com.au/s/experiences', label: 'experiences' },
  { slug: 'dice-anon',      url: 'https://dice.fm',                 label: 'header-anon' },
  { slug: 'airbnb-anon',    url: 'https://www.airbnb.com.au',       label: 'header-anon' },
  { slug: 'dice-search',    url: 'https://dice.fm',                 label: 'search-overlay', openSearch: 'dice' },
  { slug: 'airbnb-search',  url: 'https://www.airbnb.com.au',       label: 'search-overlay', openSearch: 'airbnb' },
]

async function capture(target, viewport, useDevice) {
  const browser = await chromium.launch({ headless: true })
  let ctx
  if (useDevice && viewport === 'mobile') {
    ctx = await browser.newContext({ ...devices['iPhone 13'] })
  } else {
    const w = viewport === 'desktop' ? 1440 : 375
    const h = viewport === 'desktop' ? 900 : 812
    ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
  }
  const page = await ctx.newPage()
  const out = `${OUT}/${target.slug}-${viewport}-${target.label}.png`
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 18_000 }).catch(() => {})
    await page.waitForTimeout(900)

    if (target.openSearch === 'dice') {
      const t = page.locator('[data-testid*="search"], button[aria-label*="earch" i], a[href*="search"]').first()
      await t.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(900)
    } else if (target.openSearch === 'airbnb') {
      const t = page.locator('button[aria-label*="earch" i], [data-testid*="search-input"]').first()
      await t.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(900)
    }

    await page.screenshot({ path: out, fullPage: false })
    const size = statSync(out).size
    console.log(`  ${size >= 100_000 ? 'OK   ' : 'WARN '} ${out} ${(size / 1024).toFixed(1)}KB`)
    return size
  } catch (e) {
    console.log(`  FAIL ${out}: ${String(e.message ?? e).slice(0, 120)}`)
    return 0
  } finally {
    await browser.close()
  }
}

let total = 0, fails = 0, low = 0
for (const t of TARGETS) {
  for (const vp of ['desktop', 'mobile']) {
    const size = await capture(t, vp, true)
    total++
    if (size === 0) fails++
    else if (size < 100_000) low++
  }
}
console.log(`\nDone. total=${total} fails=${fails} under-100KB=${low}`)
