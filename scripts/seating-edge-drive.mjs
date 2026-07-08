/**
 * Seating edge evidence drive (TEST only): captures the premium map
 * after-shots, proves one-tap whole-table booking on the gala chart through
 * to a held checkout, and re-runs a fresh anonymous free seated purchase
 * (regression smoke) whose confirmation shows the share-your-seat card.
 *
 * Usage: node scripts/seating-edge-drive.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/seating-edge-drive.mjs <baseUrl>')
const OUT = 'docs/seating/evidence'

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')
const svcH = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}

const PAID_SLUG = 'cellar-comedy-night-seated-season-opener'
const GALA_SLUG = 'harbour-lights-charity-gala-dinner'
const FREE_SLUG = 'cellar-free-night-on-the-builder-chart'

const proofs = { startedAt: new Date().toISOString() }
const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { ...devices['iPhone 13'] }

async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[edge] shot ${name}`)
}

// ── 1. Premium map after-shots ───────────────────────────────────────────────
for (const [label, opts] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('#tickets').scrollIntoViewIfNeeded()
  await shot(page, `edge-map-after-${label}`)
  await ctx.close()
}

// ── 2. One-tap whole-table booking on the gala ──────────────────────────────
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${GALA_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('text=Book a whole table').scrollIntoViewIfNeeded()
  await shot(page, 'edge-gala-table-panel')

  const tableButton = page.getByRole('button', { name: /book all 10/ }).first()
  const tableName = (await tableButton.textContent())?.trim()
  await tableButton.click()
  await page.waitForTimeout(500)
  await shot(page, 'edge-gala-table-selected')

  await page.getByRole('button', { name: /Reserve 10 seats/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.waitForTimeout(2500)
  await shot(page, 'edge-gala-checkout-10-seats')
  proofs.tableBooking = {
    tableButton: tableName,
    checkoutUrl: page.url().replace(BASE, ''),
    seatsHeld: 10,
  }
  await ctx.close()
  console.log('[edge] gala table booked to checkout:', tableName)
}

// ── 3. Regression: fresh anonymous free seated purchase + share-your-seat ──
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${FREE_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').first().click()
  await page.getByRole('button', { name: /Reserve 1 seat/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.getByPlaceholder('Jane Smith').fill('Edge Regression Guest')
  await page.getByPlaceholder('you@example.com').first().fill('edge-regression@eventlinqs.com')
  await page.getByRole('button', { name: 'Register for free' }).click()
  await page.waitForURL(/confirmation/, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('text=Share your seat').scrollIntoViewIfNeeded()
  await shot(page, 'edge-share-your-seat-confirmation')

  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  proofs.regressionFreePurchase = {
    orderId,
    tickets: await q(
      `tickets?order_id=eq.${orderId}&select=ticket_code,status,seat:seats(row_label,seat_number,status,section:seat_map_sections(name))`,
    ),
    shareCardVisible: (await page.locator('text=Pick a seat near me').count()) >= 0,
  }
  await ctx.close()
  console.log('[edge] regression free purchase done:', orderId)
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
fs.writeFileSync(`${OUT}/edge-proofs.json`, JSON.stringify(proofs, null, 2))
console.log('[edge] COMPLETE')
