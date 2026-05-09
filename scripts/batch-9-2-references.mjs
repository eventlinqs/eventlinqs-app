// Batch 9.2 - Competitor reference captures.
// 9 sites × 2 viewports = 18 captures. iPhone 13 device profile on mobile.
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-2-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { slug: 'airbnb-experiences', url: 'https://www.airbnb.com.au/experiences', label: 'split-hero' },
  { slug: 'stripe',             url: 'https://stripe.com',                    label: 'split-hero' },
  { slug: 'linear',             url: 'https://linear.app',                    label: 'split-hero' },
  { slug: 'ticketmaster',       url: 'https://www.ticketmaster.com.au',       label: 'home' },
  { slug: 'apple',              url: 'https://www.apple.com',                 label: 'bento' },
  { slug: 'spotify',            url: 'https://www.spotify.com',               label: 'bento' },
  { slug: 'airbnb-home',        url: 'https://www.airbnb.com.au',             label: 'chip-strip' },
  { slug: 'stripe-pricing',     url: 'https://stripe.com/au/pricing',         label: 'editorial-signup' },
  { slug: 'plausible',          url: 'https://plausible.io',                  label: 'analytics' },
]

async function capture(target, viewport) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  let ctx
  if (viewport === 'mobile') {
    ctx = await browser.newContext({ ...devices['iPhone 13'] })
  } else {
    ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
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
    const size = await capture(t, vp)
    total++
    if (size === 0) fails++
    else if (size < 100_000) low++
  }
}
console.log(`\nDone. total=${total} fails=${fails} under-100KB=${low}`)
