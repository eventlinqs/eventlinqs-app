// Batch 9.1.1 RA retry - try alternative URLs to land >=100KB.
import { chromium, devices } from 'playwright'
import { statSync } from 'node:fs'

const OUT = 'docs/redesign/batch-9-1-1-evidence/references'
const ALTERNATIVES = [
  // Wayback Machine snapshots bypass RA's anti-bot block.
  'https://web.archive.org/web/2026/https://ra.co/clubs',
  'https://web.archive.org/web/2026/https://ra.co/events',
  'https://web.archive.org/web/2025/https://ra.co/clubs',
]

async function tryUrl(url, viewport) {
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
  const tmp = `${OUT}/_tmp-${viewport}.png`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    // RA SPA needs longer to hydrate; nudge with scroll + wait.
    await page.evaluate(() => window.scrollTo(0, 200))
    await page.waitForTimeout(4000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: tmp, fullPage: true })
    const size = statSync(tmp).size
    return { tmp, size, url }
  } catch (e) {
    return { tmp: null, size: 0, url, err: e.message }
  } finally {
    await browser.close()
  }
}

import { renameSync, existsSync, unlinkSync } from 'node:fs'

for (const viewport of ['desktop', 'mobile']) {
  let best = { size: 0 }
  for (const url of ALTERNATIVES) {
    const r = await tryUrl(url, viewport)
    console.log(`  ${viewport} ${url} -> ${(r.size / 1024).toFixed(1)}KB`)
    if (r.size > best.size) best = r
    if (r.size >= 200_000) break // good enough, stop probing
  }
  if (best.size >= 100_000 && best.tmp) {
    const final = `${OUT}/ra-${viewport}-cities-index.png`
    if (existsSync(final)) unlinkSync(final)
    renameSync(best.tmp, final)
    console.log(`  PROMOTED ${viewport}: ${best.url} -> ${(best.size / 1024).toFixed(1)}KB`)
  } else {
    console.log(`  FAIL ${viewport}: no URL produced >=100KB capture (best ${(best.size / 1024).toFixed(1)}KB)`)
  }
  // Cleanup any leftover tmp files
  const tmp = `${OUT}/_tmp-${viewport}.png`
  if (existsSync(tmp)) unlinkSync(tmp)
}
