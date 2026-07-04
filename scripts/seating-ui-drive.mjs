/**
 * Reserved-seating UI evidence drive (TEST only). Against a local production
 * server it:
 *   1. Logs in as the seeded test user (real login form).
 *   2. Builds the irregular comedy chart THROUGH THE ORGANISER BUILDER UI
 *      (uneven rows 4,6,7,6,5 + curve + standing zone + two seats removed by
 *      click), saves it, and screenshots the builder.
 *   3. Creates a FREE seated event on that very chart (service insert +
 *      materialize_seats, the same call the event form makes) so the chart
 *      built by the organiser flow is the chart sold against.
 *   4. Captures the attendee seat map (desktop + mobile) and the 1,200-seat
 *      performance chart with a render-time measurement.
 *   5. FREE purchase, anonymous: picks two seats on the map, holds them,
 *      completes checkout to the confirmation, screenshots the seat on the
 *      confirmation and the bearer QR ticket page.
 *   6. PAID purchase, card 4242, on the Stripe-ready seeded event (webhook
 *      forwarded by stripe listen): confirmation + DB seat/ticket proof.
 *   7. Scans the free ticket at /scan (manual code+secret entry): the door
 *      result shows the seat.
 * Writes screenshots + ui-proofs.json to docs/seating/evidence/.
 *
 * Usage: node --experimental-strip-types scripts/seating-ui-drive.mjs <baseUrl>
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium, devices } from 'playwright'
import { generateLayout } from '../src/lib/seating/generate.ts'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node --experimental-strip-types scripts/seating-ui-drive.mjs <baseUrl>')
const OUT = 'docs/seating/evidence'
fs.mkdirSync(OUT, { recursive: true })

// Re-runnable: STEPS=perf,free,paid,scan,room re-drives only those stages
// (deterministic ids make the setup stages idempotent to skip).
const STEPS = new Set(
  (process.env.STEPS ?? 'builder,freeevent,maps,perf,free,paid,scan,room').split(','),
)

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
const ARENA_SLUG = 'arena-sessions-large-room-performance-test'

const proofs = { base: BASE, startedAt: new Date().toISOString(), steps: {} }

function uuidFrom(str) {
  const h = createHash('md5').update(str).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}
async function upsert(table, row, conflict = 'id') {
  const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { ...svcH, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${table} upsert: ${JSON.stringify(body).slice(0, 250)}`)
  return Array.isArray(body) ? body[0] : body
}
async function rpc(name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: svcH, body: JSON.stringify(args) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${name}: ${text.slice(0, 250)}`)
  return text
}
async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[drive] shot ${name}`)
}

// ── Setup: the test user's own org + a venue for the builder drive ──────────
const org = (await q(`organisations?owner_id=eq.${TEST_USER_ID}&select=id,name&limit=1`))[0]
if (!org) throw new Error('test-user has no organisation; run the baseline seed first')
const builderVenueId = uuidFrom('drive:builder-venue')
await upsert('venues', {
  id: builderVenueId, organisation_id: org.id, name: 'Drive Cellar (builder proof)',
  city: 'Geelong', state: 'VIC', country: 'Australia', capacity: 40, is_active: true,
})
proofs.steps.setup = { testOrg: org, builderVenueId }

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { ...devices['iPhone 13'] }

// ── 1. Login ──────────────────────────────────────────────────────────────
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
  await page.close()
}
const storageState = await authed.storageState()
console.log('[drive] login ok')

// ── 2. Build the comedy chart THROUGH THE BUILDER UI ────────────────────────
if (STEPS.has('builder')) {
  const page = await authed.newPage()
  await page.goto(`${BASE}/dashboard/venues/${builderVenueId}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: /New seating chart|Build your first chart/ }).first().click()
  await page.getByLabel('Seating chart name').fill('Cellar built by organiser flow')

  await page.getByRole('button', { name: '+ Rows' }).click()
  await page.getByLabel('Section name').fill('Main room')
  await page.getByLabel('Ticket tier (bound by name at event attach)').fill('Cellar seat')
  await page.getByLabel(/Seats per row/).fill('4, 6, 7, 6, 5')
  await page.getByLabel('Curve depth (px)').fill('14')

  await page.getByRole('button', { name: '+ Standing area' }).click()
  await page.getByLabel('Zone label').fill('Bar standing')
  await page.getByLabel(/Capacity/).fill('10')
  await page.getByLabel('Ticket tier (bound by name at event attach)').fill('Bar standing')

  // Remove two seats by click (the pillar), exactly as an organiser would.
  await page.getByRole('button', { name: 'Remove seat' }).click()
  const circles = page.locator('svg circle')
  await circles.nth(12).click()
  await circles.nth(13).click()
  await page.getByRole('button', { name: 'Select and move' }).click()

  await shot(page, 'builder-comedy-desktop')
  await page.getByRole('button', { name: 'Save seating chart' }).click()
  await page.waitForSelector('text=/Saved: \\d+ seats/', { timeout: 30000 })
  const savedText = await page.locator('text=/Saved: \\d+ seats/').textContent()
  await shot(page, 'builder-comedy-saved')
  proofs.steps.builder = { savedText }
  await page.close()
}

// The chart the UI saved (this run or a prior one):
const builtMap = (await q(`seat_maps?venue_id=eq.${builderVenueId}&select=id,name,total_seats,layout&order=created_at.desc&limit=1`))[0]
proofs.steps.builder = {
  ...(proofs.steps.builder ?? {}),
  map: { id: builtMap.id, name: builtMap.name, total_seats: builtMap.total_seats },
}
console.log('[drive] builder chart saved:', builtMap.total_seats, 'seats')

// ── 3. Free seated event ON the UI-built chart ──────────────────────────────
const freeEventId = uuidFrom('drive:free-event')
if (STEPS.has('freeevent')) {
const cover = (await q(`events?status=eq.published&select=cover_image_url&cover_image_url=not.is.null&limit=1`))[0].cover_image_url
const cat = (await q(`event_categories?slug=eq.comedy&select=id`))[0]
await upsert('events', {
  id: freeEventId, title: 'Cellar Free Night on the Builder Chart',
  slug: 'cellar-free-night-on-the-builder-chart',
  summary: 'Free seated night on the chart built through the organiser flow.',
  description: 'Free entry with allocated seating. Built in the visual seat-map builder and sold against as the reserved-seating proof.',
  organisation_id: org.id, created_by: TEST_USER_ID, category_id: cat?.id ?? null,
  start_date: '2026-08-28T09:30:00Z', end_date: '2026-08-28T12:00:00Z',
  timezone: 'Australia/Melbourne', event_type: 'in_person',
  venue_id: builderVenueId, venue_name: 'Drive Cellar (builder proof)', venue_city: 'Geelong',
  venue_state: 'VIC', venue_country: 'Australia',
  cover_image_url: cover, thumbnail_url: cover,
  status: 'published', visibility: 'public', published_at: '2026-07-05T00:00:00Z',
  is_age_restricted: false, max_capacity: 36, tags: ['catalogue', 'seated-proof'],
  fee_pass_type: 'pass_to_buyer', is_free: true, is_seed_data: true,
  has_reserved_seating: true, seat_map_id: builtMap.id,
})
for (const [ti, tier] of [
  { name: 'Cellar seat', price: 0, cap: 26 },
  { name: 'Bar standing', price: 0, cap: 10 },
].entries()) {
  await upsert('ticket_tiers', {
    id: uuidFrom(`drive:freetier:${tier.name}`), event_id: freeEventId, name: tier.name,
    description: tier.name, tier_type: 'general_admission', price: tier.price, currency: 'AUD',
    total_capacity: tier.cap, sold_count: 0, reserved_count: 0, min_per_order: 1, max_per_order: 10,
    sort_order: ti, is_visible: true, is_active: true, dynamic_pricing_enabled: false, requires_access_code: false,
  })
}
const freeSeatCount = await rpc('materialize_seats', { p_event_id: freeEventId, p_seat_map_id: builtMap.id })
proofs.steps.freeEvent = { freeEventId, seats: Number(freeSeatCount) }
console.log('[drive] free event materialised from the UI-built chart:', freeSeatCount, 'seats')
}

// ── 4. Attendee map captures + large-chart performance ──────────────────────
if (STEPS.has('maps')) for (const [label, opts] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('#tickets').scrollIntoViewIfNeeded()
  await shot(page, `attendee-map-${label}`)
  await ctx.close()
}
if (STEPS.has('perf')) {
  const ctx = await browser.newContext(MOBILE)
  const page = await ctx.newPage()
  const t0 = Date.now()
  await page.goto(`${BASE}/events/${ARENA_SLUG}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 60000 })
  const seatNodes = await page.locator('svg[aria-label="Seat map"] rect').count()
  const loadedMs = Date.now() - t0
  // Interaction responsiveness: select a seat and time the visual response.
  const i0 = Date.now()
  await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').first().click()
  await page.waitForTimeout(50)
  const interactMs = Date.now() - i0
  await page.locator('#tickets').scrollIntoViewIfNeeded()
  await shot(page, 'attendee-map-arena-1200-mobile')
  proofs.steps.performance = { seatNodes, pageLoadToMapMs: loadedMs, firstSeatClickMs: interactMs }
  console.log(`[drive] arena: ${seatNodes} seat nodes, map in ${loadedMs}ms, click ${interactMs}ms`)
  await ctx.close()
}

// ── 5. FREE purchase, anonymous, on the builder chart ────────────────────────
if (STEPS.has('free')) {
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/cellar-free-night-on-the-builder-chart`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  const clickable = page.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
  await clickable.nth(0).click()
  await clickable.nth(1).click()
  await page.getByRole('button', { name: /Reserve 2 seats/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.waitForTimeout(2000)
  await shot(page, 'free-checkout-desktop')

  await page.getByPlaceholder('Jane Smith').fill('Seat Proof Guest')
  await page.getByPlaceholder('you@example.com').first().fill('seat-proof-guest@eventlinqs.com')
  await page.getByRole('button', { name: 'Register for free' }).click()
  await page.waitForURL(/confirmation/, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(page, 'free-confirmation-desktop')

  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  const freeTickets = await q(
    `tickets?order_id=eq.${orderId}&select=ticket_code,secret,status,seat_id,seat:seats(row_label,seat_number,status,section:seat_map_sections(name))`,
  )
  proofs.steps.freePurchase = { orderId, tickets: freeTickets }

  // Bearer QR ticket page shows the seat.
  const t = freeTickets[0]
  await page.goto(`${BASE}/t/${t.ticket_code}?k=${t.secret}`, { waitUntil: 'load', timeout: 60000 })
  await shot(page, 'free-ticket-qr-desktop')
  await ctx.close()
  console.log('[drive] free purchase done:', orderId)
}

// ── 6. PAID purchase, card 4242 (webhook via stripe listen) ─────────────────
if (STEPS.has('paid')) {
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${PAID_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
  await page.locator('svg[aria-label="Seat map"] g[style*="pointer"]').first().click()
  await page.getByRole('button', { name: /Reserve 1 seat/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 45000 })
  await page.waitForTimeout(2500)
  await shot(page, 'paid-checkout-desktop')

  await page.getByRole('button', { name: /continue to payment/i }).click()
  // Stripe Payment Element iframe: fill the 4242 test card.
  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await stripeFrame.locator('input[name="number"]').fill('4242424242424242', { timeout: 45000 })
  await stripeFrame.locator('input[name="expiry"]').fill('12/30')
  await stripeFrame.locator('input[name="cvc"]').fill('123')
  const postal = stripeFrame.locator('input[name="postalCode"]')
  if (await postal.count()) await postal.fill('3220')
  await page.waitForTimeout(800)
  await shot(page, 'paid-payment-desktop')
  await page.getByRole('button', { name: /pay/i }).first().click()
  await page.waitForURL(/confirmation/, { timeout: 120000 })
  // Give the forwarded webhook time to mint tickets and mark seats sold.
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  await shot(page, 'paid-confirmation-desktop')

  const orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
  const order = (await q(`orders?id=eq.${orderId}&select=id,order_number,status,total_cents,currency`))[0]
  const paidTickets = await q(
    `tickets?order_id=eq.${orderId}&select=ticket_code,secret,status,seat_id,seat:seats(row_label,seat_number,status,section:seat_map_sections(name))`,
  )
  proofs.steps.paidPurchase = { orderId, order, tickets: paidTickets }
  await ctx.close()
  console.log('[drive] paid purchase done:', orderId, order?.status)
}

// ── 7. Door scan of the free seated ticket ───────────────────────────────────
if (STEPS.has('scan')) {
  if (!proofs.steps.freePurchase) {
    const prior = JSON.parse(fs.readFileSync(`${OUT}/ui-proofs.json`, 'utf8'))
    proofs.steps.freePurchase = prior.steps.freePurchase
  }
  const t = proofs.steps.freePurchase.tickets[0]
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/scan/${freeEventId}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  const codeInput = page.locator('input').first()
  await codeInput.fill(t.ticket_code)
  const inputs = page.locator('input')
  if ((await inputs.count()) > 1) await inputs.nth(1).fill(t.secret)
  await page.getByRole('button', { name: /check|scan|admit|submit/i }).first().click()
  await page.waitForTimeout(2500)
  await shot(page, 'scan-admit-seat-desktop')
  const scanRow = await q(`ticket_scans?ticket_id=eq.${(await q(`tickets?ticket_code=eq.${t.ticket_code}&select=id`))[0].id}&select=result,created_at&order=created_at.desc&limit=1`)
  proofs.steps.scan = { ticket_code: t.ticket_code, scanRow }
  await ctx.close()
  console.log('[drive] scan done')
}

// ── 8. Organiser room view after the sale ────────────────────────────────────
if (STEPS.has('room')) {
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/events/${freeEventId}/seats`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2500)
  await shot(page, 'organiser-room-view-desktop')
  await ctx.close()
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
let merged = proofs
try {
  const prior = JSON.parse(fs.readFileSync(`${OUT}/ui-proofs.json`, 'utf8'))
  merged = { ...prior, ...proofs, steps: { ...prior.steps, ...proofs.steps } }
} catch {}
fs.writeFileSync(`${OUT}/ui-proofs.json`, JSON.stringify(merged, null, 2))
console.log('[drive] COMPLETE')
