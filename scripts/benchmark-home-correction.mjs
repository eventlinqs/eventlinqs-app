// Benchmark capture: EventLinqs homepage (general-breadth correction, full
// density via HOMEPAGE_SEED_FIXTURE) against Ticketmaster, at 1440 and 390.
//
// Usage: node scripts/benchmark-home-correction.mjs
// Requires the local production server running with the fixture flag on :3210.

import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const OUT = 'docs/benchmark/home-rebuild-correction'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { slug: 'eventlinqs', url: 'http://localhost:3210/', wait: 'networkidle' },
  { slug: 'ticketmaster', url: 'https://www.ticketmaster.com.au/', wait: 'domcontentloaded' },
]

const VIEWPORTS = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '390', width: 390, height: 844, mobile: true },
]

async function capture(target, vp) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = vp.mobile
    ? await browser.newContext({ ...devices['iPhone 13'] })
    : await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const out = `${OUT}/${target.slug}-${vp.tag}.png`
  try {
    await page.goto(target.url, { waitUntil: target.wait, timeout: 45_000 })
    await page.waitForTimeout(target.slug === 'ticketmaster' ? 3500 : 1200)
    await page.screenshot({ path: out, fullPage: true })
    console.log(`  ok   ${out}`)
  } catch (err) {
    console.log(`  FAIL ${out}: ${err.message}`)
  } finally {
    await browser.close()
  }
}

for (const target of TARGETS) {
  for (const vp of VIEWPORTS) {
    await capture(target, vp)
  }
}
console.log('done')
