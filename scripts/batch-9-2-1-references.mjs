// Batch 9.2.1 - 3 desktop reference captures of competitor headers (anonymous).
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-2-1-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { slug: 'airbnb',      url: 'https://www.airbnb.com.au',         label: 'header-anon' },
  { slug: 'dice',        url: 'https://dice.fm',                   label: 'header-anon' },
  { slug: 'eventbrite',  url: 'https://www.eventbrite.com.au',     label: 'header-anon' },
]

async function capture(target) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  const out = `${OUT}/${target.slug}-1440-${target.label}.png`
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 18_000 }).catch(() => {})
    await page.waitForTimeout(900)
    await page.screenshot({ path: out, fullPage: false })
    const size = statSync(out).size
    console.log(`  ${size >= 80_000 ? 'OK   ' : 'WARN '} ${out} ${(size / 1024).toFixed(1)}KB`)
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
  const size = await capture(t)
  total++
  if (size === 0) fails++
  else if (size < 80_000) low++
}
console.log(`\nDone. total=${total} fails=${fails} under-80KB=${low}`)
