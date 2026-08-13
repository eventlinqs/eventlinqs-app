/**
 * Prove the retired category slug still resolves, in a real browser.
 *
 * WHY IN A BROWSER AND NOT BY READING THE CODE. `CATEGORY_SLUG_ALIASES` maps
 * `arts-culture` to `arts-community`, and reading that mapping proves only that
 * somebody wrote it down. What matters is whether a shared link or a printed QR
 * carrying the OLD slug still lands on results after the taxonomy migration has
 * renamed the row underneath it. Those artefacts cannot be recalled, so the
 * question has to be answered against a deployment where the migration has
 * actually run. The preview points at TEST, where it has.
 *
 * Usage: node scripts/verify/category-alias-proof.mjs <baseUrl>
 */
import { chromium } from 'playwright'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/verify/category-alias-proof.mjs <baseUrl>')
  process.exit(1)
}

const CASES = [
  { label: 'RETIRED slug (the one the migration renames)', url: `${BASE}/events?category=arts-culture` },
  { label: 'LIVE slug (what it should behave like)', url: `${BASE}/events?category=arts-community` },
  { label: 'ADDED category (new row, no alias needed)', url: `${BASE}/events?category=comedy` },
  { label: 'NONSENSE slug (must NOT look like a success)', url: `${BASE}/events?category=not-a-real-category` },
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

for (const c of CASES) {
  const res = await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForTimeout(2500)

  // Count rendered event cards. A card links to /events/<slug>, so anchors to
  // that shape are the honest measure of "this page shows results".
  const cards = await page.$$eval('a[href*="/events/"]', (as) => {
    const slugs = as
      .map((a) => a.getAttribute('href') || '')
      .filter((h) => /\/events\/[a-z0-9-]+$/.test(h))
    return [...new Set(slugs)].length
  })
  const heading = (await page.$eval('h1', (el) => el.textContent?.trim() ?? '').catch(() => '(no h1)'))

  console.log(`\n${c.label}`)
  console.log(`  url      ${c.url}`)
  console.log(`  status   ${res?.status()}`)
  console.log(`  landed   ${page.url()}`)
  console.log(`  h1       ${heading}`)
  console.log(`  events   ${cards}`)
}

await browser.close()
