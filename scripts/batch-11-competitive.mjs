// Batch 11.0 competitive benchmark - Ticketmaster.com.au + DICE.fm
// homepage hero + header at desktop 1440 and mobile 390. Saves to
// references/ for side-by-side comparison against the new hero.
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-11-evidence/references'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au' },
  { slug: 'dice',         url: 'https://dice.fm' },
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
  const file = `${OUT}/${target.slug}-${viewport === 'mobile' ? '390' : '1440'}-hero.png`
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 18_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    await page.screenshot({ path: file, fullPage: false })
    const size = statSync(file).size
    console.log(`  ${size >= 80_000 ? 'OK   ' : 'WARN '} ${file} ${(size / 1024).toFixed(1)}KB`)
  } catch (e) {
    console.log(`  FAIL ${file}: ${String(e.message ?? e).slice(0, 140)}`)
  } finally {
    await browser.close()
  }
}

for (const t of TARGETS) {
  for (const vp of ['desktop', 'mobile']) {
    await capture(t, vp)
  }
}
console.log('Done.')
