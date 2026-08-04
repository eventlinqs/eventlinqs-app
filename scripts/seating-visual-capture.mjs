/**
 * Seating designer visual capture (TEST only). Captures the organiser seat-map
 * builder and the buyer seat map at 1440x900 and 390x844 for the before/after
 * evidence pairs of the seating designer elevation.
 *
 * Usage: node scripts/seating-visual-capture.mjs <baseUrl> <outDir>
 *   e.g. node scripts/seating-visual-capture.mjs http://localhost:3000 docs/seating/evidence-elevation/before
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2]
const OUT = process.argv[3]
if (!BASE || !OUT) throw new Error('usage: node scripts/seating-visual-capture.mjs <baseUrl> <outDir>')
fs.mkdirSync(OUT, { recursive: true })

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')
const svcH = { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }

const TEST_EMAIL = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const TEST_USER_ID = '57101100-eec8-4e72-a464-97e11e66bea1'
const PAID_SLUG = 'cellar-comedy-night-seated-season-opener'

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}

// The venue whose chart the previous drive built through the organiser UI.
const org = (await q(`organisations?owner_id=eq.${TEST_USER_ID}&select=id&limit=1`))[0]
const venues = await q(`venues?organisation_id=eq.${org.id}&select=id,name&order=created_at.desc`)
let builderVenue = null
for (const v of venues) {
  const maps = await q(`seat_maps?venue_id=eq.${v.id}&select=id&limit=1`)
  if (maps.length > 0) { builderVenue = v; break }
}
if (!builderVenue) throw new Error('no venue with a saved seat map found for the test org')
console.log('[capture] builder venue:', builderVenue.name, builderVenue.id)

const browser = await chromium.launch()
const VIEWPORTS = [
  ['1440x900', { width: 1440, height: 900 }],
  ['390x844', { width: 390, height: 844 }],
]

async function shot(page, name) {
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[capture] ${name}`)
}

// Login once, reuse the session.
const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
{
  const page = await loginCtx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 120000 })
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
  await page.close()
}
const storageState = await loginCtx.storageState()
await loginCtx.close()
console.log('[capture] login ok')

for (const [label, viewport] of VIEWPORTS) {
  // Organiser builder, editing the saved chart (full density).
  const ctx = await browser.newContext({ viewport, storageState, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/venues/${builderVenue.id}/seat-maps`, { waitUntil: 'load', timeout: 120000 })
  await page.getByRole('button', { name: 'Edit chart' }).first().click()
  await page.waitForSelector('svg[aria-label="Seating chart canvas"]', { timeout: 30000 })
  await shot(page, `builder-${label}`)
  await page.close()

  // Buyer seat map on the seeded paid seated event.
  const page2 = await ctx.newPage()
  await page2.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 120000 })
  await page2.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  const tickets = page2.locator('#tickets')
  if (await tickets.count()) await tickets.scrollIntoViewIfNeeded()
  // Select up to two seats so the selected state is part of the evidence.
  const clickable = page2.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
  const n = await clickable.count()
  for (let i = 0; i < Math.min(2, n); i++) await clickable.nth(i).click()
  await shot(page2, `buyer-map-${label}`)
  await page2.close()
  await ctx.close()
}

await browser.close()
console.log('[capture] COMPLETE ->', OUT)
