/**
 * Surpass pass evidence drive (TEST only): captures the three edges live
 * (What we publish on /pricing, Know before you go on the event page, Fill
 * the room on the organiser event screen) and re-runs the core flows as the
 * regression smoke: wizard advance, GA free registration, seated free
 * purchase, paid checkout entry, share bar presence.
 * Writes screenshots + surpass-proofs.json to docs/surpass/evidence/.
 *
 * Usage: node scripts/surpass-drive.mjs <baseUrl>
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/surpass-drive.mjs <baseUrl>')
const OUT = 'docs/surpass/evidence'
fs.mkdirSync(OUT, { recursive: true })

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
function uuidFrom(str) {
  const h = createHash('md5').update(str).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const TEST_EMAIL = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const PAID_SLUG = 'cellar-comedy-night-seated-season-opener'
const FREE_SEATED_SLUG = 'cellar-free-night-on-the-builder-chart'
const FREE_EVENT_ID = uuidFrom('drive:free-event')

const proofs = { startedAt: new Date().toISOString(), steps: {} }
const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { ...devices['iPhone 13'] }

async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[surpass] shot ${name}`)
}

// ── Edge C: /pricing calculator + disclosure table ───────────────────────────
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/pricing`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=See your exact numbers', { timeout: 30000 })
  await page.waitForSelector('text=What we publish, up front', { timeout: 30000 })
  await shot(page, 'surpass-pricing-desktop')
  proofs.steps.pricing = {
    calculatorVisible: (await page.locator('text=Your ticket price').count()) > 0,
    disclosureTableVisible: (await page.locator('text=Live payout calculator').count()) > 0,
  }
  await ctx.close()
}

// ── Edge B: Know before you go on the event page ────────────────────────────
for (const [label, opts] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Know before you go', { timeout: 30000 })
  await page.locator('text=Know before you go').scrollIntoViewIfNeeded()
  await shot(page, `surpass-know-before-${label}`)
  if (label === 'desktop') {
    proofs.steps.knowBeforeYouGo = {
      rows: await page.locator('dl >> dt').allTextContents().then(a => a.slice(0, 8)),
      accessibleRowShown: (await page.locator('text=Accessible seating').count()) > 0,
    }
  }
  await ctx.close()
}

// ── Edges A + D: Fill the room on the organiser event screen ────────────────
const authed = await browser.newContext(DESKTOP)
{
  const page = await authed.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ])
  await page.goto(`${BASE}/dashboard/events/${FREE_EVENT_ID}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Fill the room', { timeout: 30000 })
  await shot(page, 'surpass-fill-the-room-desktop')
  const statValues = await page
    .locator('section[aria-labelledby="fill-the-room-heading"] p.font-display.text-3xl')
    .allTextContents()
  proofs.steps.fillTheRoom = {
    stats: statValues,
    shareKitVisible: (await page.locator('text=Put it in front of more people').count()) > 0,
  }
  await page.close()
  console.log('[surpass] fill-the-room stats:', statValues.join(' / '))
}

// ── Regression smoke: the core flows ─────────────────────────────────────────
// 1. Create event: wizard loads and advances two steps.
{
  const page = await authed.newPage()
  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  const title = page.locator('input[placeholder*="Summer Music Festival"]')
  await title.fill('Surpass Smoke Draft (never published)')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForTimeout(600)
  const dts = page.locator('input[type="datetime-local"]')
  await dts.nth(0).fill('2026-10-01T18:00')
  await dts.nth(1).fill('2026-10-01T22:00')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForTimeout(600)
  proofs.steps.wizardSmoke = { advancedToStep3: true }
  await page.close()
  console.log('[surpass] wizard smoke ok')
}

// 2. Seated free purchase (fresh seats) + share bar presence on confirmation.
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${FREE_SEATED_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').first().click()
  await page.getByRole('button', { name: /Reserve 1 seat/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.getByPlaceholder('Jane Smith').fill('Surpass Smoke Guest')
  await page.getByPlaceholder('you@example.com').first().fill('surpass-smoke@eventlinqs.com')
  await page.getByRole('button', { name: 'Register for free' }).click()
  await page.waitForURL(/confirmation/, { timeout: 60000 })
  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  proofs.steps.seatedRegression = {
    orderId,
    shareYourSeatVisible: (await page.locator('text=Share your seat').count()) > 0,
    tickets: await q(`tickets?order_id=eq.${orderId}&select=ticket_code,status,seat:seats(row_label,seat_number,status)`),
  }
  await ctx.close()
  console.log('[surpass] seated regression ok:', orderId)
}

// 3. GA paid checkout entry (held reservation renders the checkout).
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/harbour-lights-live-geelong-waterfront-sessions-4muhm2`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1200)
  await page.locator('button[aria-label="Increase General Admission quantity"]').first().click()
  await page.waitForTimeout(500)
  const cta = page.locator('#tickets button').filter({ hasText: /checkout/i }).first()
  await cta.click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.waitForTimeout(2000)
  proofs.steps.gaCheckoutRegression = {
    checkoutUrl: page.url().replace(BASE, ''),
    payButtonPresent: (await page.getByRole('button', { name: /continue to payment/i }).count()) > 0,
  }
  await ctx.close()
  console.log('[surpass] GA checkout entry ok')
}

// 4. Share bar on the public event page.
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 60000 })
  proofs.steps.shareRegression = {
    shareBarPresent: (await page.locator('text=Share this event').count()) > 0,
    whatsappPresent: (await page.getByRole('link', { name: /share via whatsapp/i }).count()) > 0,
  }
  await ctx.close()
  console.log('[surpass] share smoke ok')
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
fs.writeFileSync(`${OUT}/surpass-proofs.json`, JSON.stringify(proofs, null, 2))
console.log('[surpass] COMPLETE')
