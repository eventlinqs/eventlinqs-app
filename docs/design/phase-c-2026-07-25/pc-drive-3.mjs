/**
 * Phase C capture drive, part 3: bind two tier names on the curved chart,
 * publish a two-priced seated event, capture the price filter (S4) at 1440
 * and 390. TEST database only.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE =
  'https://eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/design/phase-c-2026-07-25'
const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'
const COVER = 'public/images/hero/comedy.jpg'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const results = {}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await Promise.all([
  page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])
log('login ok')

// ── 1. Bind tiers on "Proof 500 Curved": block 1 -> A Reserve, new block -> B Reserve ──
await page.goto(`${BASE}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
await page.locator('a[href*="seat-maps"]').first().click()
await page.waitForURL(/seat-maps/, { timeout: 30000 })
await page.waitForTimeout(1200)
const chartRow = page.locator('div:has(> div > p:text-is("Proof 500 Curved"))').last()
await chartRow.getByRole('button', { name: /edit chart/i }).click()
await page.waitForTimeout(2000)

// The single existing block is selected on open (initial selectedId).
await page.getByLabel(/Ticket tier/).fill('A Reserve')
await page.getByLabel('Section name').fill('A Reserve')
await page.waitForTimeout(600)

// Second block: 10 rows of 25, bound to B Reserve.
await page.getByRole('button', { name: /\+ Rows/ }).click()
await page.waitForTimeout(800)
await page.getByLabel('Rows', { exact: true }).fill('10')
await page.getByLabel(/Seats per row/).fill('25')
await page.getByLabel(/Ticket tier/).fill('B Reserve')
await page.getByLabel('Section name').fill('B Reserve')
await page.waitForTimeout(900)
await page.getByRole('button', { name: /save seating chart/i }).click()
await page.waitForTimeout(2500)
log('chart re-bound with two tiers')
await page.getByRole('button', { name: /^close$/i }).click().catch(() => {})

// ── 2. The paid two-priced event ────────────────────────────────────────────
await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
const titleInput = page.locator('input[placeholder*="Summer Music Festival"]')
await titleInput.waitFor({ timeout: 60000 })
await titleInput.fill('Seat Proof Price Bands')
const categoryValue = await page.evaluate(() => {
  const sel = document.querySelector('select')
  const opts = [...(sel?.options ?? [])]
  const pick = opts.find(o => /music/i.test(o.text)) ?? opts[1]
  return pick ? pick.value : null
})
if (categoryValue) await page.locator('select').first().selectOption(categoryValue)
const cont = () => page.getByRole('button', { name: /^Continue$/ }).click()
await cont()
await page.waitForTimeout(700)
await cont()
await page.waitForTimeout(700)
await page.getByPlaceholder('e.g. Melbourne Convention Centre').fill('The Wool Store')
await page.locator('div:has(> label:text-is("City")) input').fill('Geelong')
await cont()
await page.waitForTimeout(700)
await page.locator('input[type="file"]').first().setInputFiles(COVER)
await page.waitForFunction(
  () => [...document.querySelectorAll('img')].some(i => /event-images|supabase/i.test(i.src)),
  { timeout: 90000 },
).catch(() => {})
await page.waitForTimeout(2500)
await cont()
await page.waitForTimeout(700)
if (await page.getByText(/still uploading/i).count()) {
  await page.waitForTimeout(6000)
  await cont()
  await page.waitForTimeout(700)
}
// Tier 1: A Reserve 59. Tier 2: B Reserve 39.
await page.getByPlaceholder('e.g. General Admission').nth(0).fill('A Reserve')
await page.locator('div:has(> label:text-is("Price")) input[type="number"]').nth(0).fill('59')
await page.getByRole('button', { name: /add/i }).filter({ hasText: /tier/i }).first().click()
await page.waitForTimeout(500)
await page.getByPlaceholder('e.g. General Admission').nth(1).fill('B Reserve')
await page.locator('div:has(> label:text-is("Price")) input[type="number"]').nth(1).fill('39')
await cont()
await page.waitForTimeout(700)
await page.getByRole('switch').click()
await page.waitForTimeout(700)
const selects = page.locator('select')
await selects.first().selectOption({ label: 'The Wool Store' })
await page.waitForTimeout(900)
const chartValue = await page.evaluate(() => {
  const sels = [...document.querySelectorAll('select')]
  const sel = sels[1]
  const opt = [...(sel?.options ?? [])].find(o => o.text.includes('Proof 500 Curved'))
  return opt ? opt.value : null
})
if (chartValue) await selects.nth(1).selectOption(chartValue)
await page.waitForTimeout(900)
await cont()
await page.waitForTimeout(1200)
const publish = page.getByRole('button', { name: /publish and get your launch kit|^publish now$/i })
await publish.waitFor({ timeout: 30000 })
await publish.click()
try {
  await page.waitForURL(/launch-kit/, { timeout: 120000 })
} catch {
  const body = await page.textContent('body')
  results.publishBlocked = (body ?? '').match(/stripe|identity|connect[^.]{0,80}/i)?.[0] ?? 'unknown'
  log('publish blocked:', results.publishBlocked)
  fs.writeFileSync(`${OUT}/drive-3-results.json`, JSON.stringify(results, null, 2))
  await browser.close()
  process.exit(0)
}
const liveHref = await page.locator('a:has-text("Open your live page")').getAttribute('href')
results.liveHref = liveHref
log('published:', liveHref)

// ── 3. The filter captures ──────────────────────────────────────────────────
await page.goto(liveHref, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(3000)
const priceGroup = page.getByRole('group', { name: /filter seats by price/i })
results.filterPresent = (await priceGroup.count()) > 0
log('filter present:', results.filterPresent)
if (results.filterPresent) {
  const map = page.locator('div.relative:has(> div > svg[aria-label="Seat map"])').first()
  await map.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/buyer-price-filter-all-1440.png`, fullPage: true })
  await priceGroup.getByRole('button').nth(1).click()
  await page.waitForTimeout(1500)
  await map.screenshot({ path: `${OUT}/buyer-price-filter-active-1440.png` })
  log('filter captures done')

  const state = await ctx.storageState()
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
  const mp = await mctx.newPage()
  await mp.goto(liveHref, { waitUntil: 'load', timeout: 90000 })
  await mp.waitForTimeout(2500)
  const mGroup = mp.getByRole('group', { name: /filter seats by price/i })
  if ((await mGroup.count()) > 0) {
    await mGroup.getByRole('button').nth(2).click().catch(() => {})
    await mp.waitForTimeout(1200)
    const mMap = mp.locator('div.relative:has(> div > svg[aria-label="Seat map"])').first()
    await mMap.scrollIntoViewIfNeeded()
    await mp.waitForTimeout(1000)
    await mp.screenshot({ path: `${OUT}/buyer-price-filter-390.png`, fullPage: false })
    log('mobile filter capture done')
  }
  await mctx.close()
}

fs.writeFileSync(`${OUT}/drive-3-results.json`, JSON.stringify(results, null, 2))
log('DONE', JSON.stringify(results))
await browser.close()
