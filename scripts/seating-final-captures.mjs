/**
 * Seating final round captures (2026-07-26), TEST only.
 * Drives every NEW capability live on a local production server and writes
 * evidence into docs/design/seating-final-2026-07-26/.
 *
 * Stages (STAGES=buyer,builder,mobile,diff,selfmove):
 *   buyer    - one-control party+price, palette sets, keyboard cursor,
 *              view-from-seat card, at 1440 and 390
 *   builder  - auto-bow, live slider, per-row shaping, skew, presets,
 *              floor-plan detect, section view upload, live-usage banner
 *   mobile   - the 390 builder: draw, move, relabel, bind tier, sheet, save
 *   diff     - post-publish edit: keyboard nudge, save, review sheet, apply
 *   selfmove - the orphan-guarded self-move control on /tickets
 *
 * Usage: node tmp-seating-final-captures.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node tmp-seating-final-captures.mjs <baseUrl>')
const OUT = 'docs/design/seating-final-2026-07-26'
fs.mkdirSync(OUT, { recursive: true })

const STAGES = new Set((process.env.STAGES ?? 'buyer,builder,mobile,diff,selfmove').split(','))

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

const proofs = { base: BASE, startedAt: new Date().toISOString(), notes: {} }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}
async function patch(path, body) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...svcH, prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
async function shot(page, name, opts = {}) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? false })
  console.log(`[cap] ${name}`)
}
async function shotEl(locator, name) {
  await locator.first().screenshot({ path: `${OUT}/${name}.png` })
  console.log(`[cap] ${name}`)
}

// SAFETY + sanity: the served page must carry the TEST supabase ref.
{
  const res = await fetch(BASE)
  const html = await res.text()
  if (html.includes(PROD_REF)) throw new Error('SAFETY STOP: served bundle carries the PROD ref')
  console.log('[cap] server bundle verified TEST')
}

// â”€â”€ Find the proof data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// A published, two-priced seated event with open seats.
const seatedEvents = await q(
  `events?has_reserved_seating=eq.true&status=eq.published&select=id,slug,title,seat_map_id,ticket_tiers(name,price),seats(count)&limit=30`,
)
let twoPriced = null
for (const ev of seatedEvents) {
  const prices = [...new Set((ev.ticket_tiers ?? []).map(t => Number(t.price)).filter(p => p > 0))]
  if (prices.length >= 2 && ev.seat_map_id) {
    const open = await q(`seats?event_id=eq.${ev.id}&status=eq.available&select=id&limit=12`)
    if (open.length >= 8) { twoPriced = ev; break }
  }
}
if (!twoPriced) throw new Error('no two-priced seated event with open seats on TEST')
console.log('[cap] two-priced event:', twoPriced.slug)
proofs.notes.twoPriced = { slug: twoPriced.slug, id: twoPriced.id, seat_map_id: twoPriced.seat_map_id }

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const MOBILE = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }

// Login once, reuse the session.
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
  console.log('[cap] login ok')
}
const storageState = await authed.storageState()

const eventUrl = `${BASE}/events/${twoPriced.slug}`

// Seed a view-from-seat row for the buyer card if none exists yet (the
// UPLOAD path is proven live in the builder stage on the studio chart).
if (STAGES.has('buyer')) {
  const existing = await q(`seat_section_views?seat_map_id=eq.${twoPriced.seat_map_id}&select=id&limit=1`)
  if (existing.length === 0) {
    const cover = (await q(`events?id=eq.${twoPriced.id}&select=cover_image_url`))[0]?.cover_image_url
    const section = (await q(`seat_map_sections?seat_map_id=eq.${twoPriced.seat_map_id}&select=name&limit=1`))[0]
    if (cover && section) {
      await fetch(`${URL_}/rest/v1/seat_section_views`, {
        method: 'POST', headers: svcH,
        body: JSON.stringify({ seat_map_id: twoPriced.seat_map_id, section_name: section.name, photo_url: cover }),
      })
      proofs.notes.viewSeed = { section: section.name, via: 'service row (upload path proven in builder stage)' }
      console.log('[cap] seeded view row for', section.name)
    }
  }
}

// â”€â”€ BUYER: one control, palettes, keyboard, view card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (STAGES.has('buyer')) {
  for (const [label, opts] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.goto(eventUrl, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
    await page.locator('#tickets').scrollIntoViewIfNeeded()
    await shot(page, `buyer-one-control-idle-${label}`)

    // The ONE control: party of 4, under the lowest price band, find.
    const group = page.getByRole('group', { name: 'Find seats together under your price' })
    await group.getByRole('button', { name: 'One more person' }).click()
    await group.getByRole('button', { name: 'One more person' }).click()
    const bandChips = group.getByRole('group', { name: 'Under this price' }).getByRole('button')
    const chipCount = await bandChips.count()
    if (chipCount > 1) await bandChips.nth(1).click() // first real band after Any price
    await group.getByRole('button', { name: /Find our seats/ }).click()
    await page.waitForTimeout(2500)
    await shot(page, `buyer-one-control-found-${label}`)
    if (label === '1440') {
      const picked = await page.locator('svg[aria-label="Seat map"] rect.seat-bloom').count()
      proofs.notes.oneControl = { pickedBloomSeats: picked }
    }
    await ctx.close()
  }

  // Palette sets + keyboard + view card at 1440.
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(eventUrl, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
  await page.locator('#tickets').scrollIntoViewIfNeeded()

  await page.getByRole('button', { name: 'Seat colours' }).click()
  await shot(page, 'buyer-palette-menu-1440')
  for (const [setName, file] of [
    ['Red-green (protan)', 'buyer-palette-protan-1440'],
    ['Red-green (deutan)', 'buyer-palette-deutan-1440'],
    ['Blue-yellow (tritan)', 'buyer-palette-tritan-1440'],
  ]) {
    await page.getByRole('button', { name: 'Seat colours' }).click().catch(() => {})
    const item = page.getByRole('menuitemradio', { name: setName })
    if (await item.count()) await item.click()
    await page.waitForTimeout(400)
    await shotEl(page.locator('svg[aria-label="Seat map"]'), file)
  }
  // Back to house for the rest.
  await page.getByRole('button', { name: 'Seat colours' }).click()
  await page.getByRole('menuitemradio', { name: 'House' }).click()

  // Keyboard: focus the map, walk right three seats, select with Enter.
  const map = page.getByRole('group', { name: /Seat map\. Arrow keys/ })
  await map.focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await shotEl(page.locator('svg[aria-label="Seat map"]'), 'buyer-keyboard-cursor-1440')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await shotEl(page.locator('svg[aria-label="Seat map"]'), 'buyer-keyboard-selected-1440')

  // View from seat card.
  const camera = page.locator('button[aria-label^="See the real view from"]')
  if (await camera.count()) {
    await camera.first().click()
    await page.waitForTimeout(600)
    await shot(page, 'buyer-view-from-seat-1440')
    await page.getByRole('button', { name: 'Close the view photo' }).click()
  } else {
    proofs.notes.viewCard = 'NO CAMERA CHIP RENDERED - check seed'
  }
  await ctx.close()

  // View card at 390.
  const mctx = await browser.newContext(MOBILE)
  const mpage = await mctx.newPage()
  await mpage.goto(eventUrl, { waitUntil: 'load', timeout: 90000 })
  await mpage.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
  await mpage.locator('#tickets').scrollIntoViewIfNeeded()
  const mcam = mpage.locator('button[aria-label^="See the real view from"]')
  if (await mcam.count()) {
    await mcam.first().click()
    await mpage.waitForTimeout(600)
    await shot(mpage, 'buyer-view-from-seat-390')
  }
  await mctx.close()
}

// â”€â”€ BUILDER: curves, detect, views, banner (1440, authed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VENUE_ID = (await q(`venues?name=eq.Drive%20Cellar%20(builder%20proof)&select=id&limit=1`))[0]?.id
if (STAGES.has('builder')) {
  if (!VENUE_ID) throw new Error('builder venue missing; run the prior drive first')
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/venues/${VENUE_ID}/seat-maps`, { waitUntil: 'load', timeout: 90000 })

  // A fresh chart from the Theatre preset (auto-bow arcs out of the box).
  await page.getByRole('button', { name: 'New seating chart' }).click()
  await page.getByLabel('Seating chart name').fill('Final round proof chart')
  await page.getByRole('button', { name: 'Theatre' }).click()
  await page.waitForTimeout(600)
  await shot(page, 'builder-preset-theatre-autobow-1440', { fullPage: true })

  // The live arc slider on the lit canvas: tighten it and watch the rows.
  const arcSlider = page.locator('input[aria-label^="Arc tightness"]')
  await arcSlider.focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  await shot(page, 'builder-arc-slider-tightened-1440')

  // Manual mode: front/back bows and the per-row disclosure.
  await page.getByLabel('Bow to the stage').first().uncheck()
  await page.locator('input[aria-label^="Front row bow"]').first().fill('28')
  await page.locator('input[aria-label^="Back row bow"]').first().fill('6')
  await page.getByText('Shape row by row').first().click()
  await page.waitForTimeout(400)
  await shot(page, 'builder-per-row-shape-1440', { fullPage: true })

  // Skew.
  await page.getByLabel('Skew (px per row)').first().fill('9')
  await page.waitForTimeout(400)
  await shotEl(page.locator('svg[role="application"]'), 'builder-skew-1440')

  // Save, then the section view photo upload through the REAL pipeline.
  await page.getByRole('button', { name: 'Save seating chart' }).click()
  await page.waitForSelector('text=/Saved: \\d+ seats/', { timeout: 30000 })
  // Re-open the saved chart so the view slot is live.
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Edit chart' }).first().click()
  await page.locator('svg[role="application"] circle[r="9"]').first().click()
  const viewInput = page.locator('input[aria-label^="Upload the view photographed from"]')
  if (await viewInput.count()) {
    // A real JPEG for the pipeline: generate one by screenshotting the canvas.
    const jpg = `${OUT}/tmp-view-photo.jpg`
    await page.locator('svg[role="application"]').screenshot({ path: jpg, type: 'jpeg', quality: 80 })
    await viewInput.setInputFiles(jpg)
    await page.waitForTimeout(5000)
    await shot(page, 'builder-view-slot-uploaded-1440', { fullPage: true })
    const uploaded = await q(`seat_section_views?select=section_name,photo_url&order=created_at.desc&limit=1`)
    proofs.notes.viewUpload = uploaded[0] ?? 'NOT FOUND'
    fs.rmSync(jpg, { force: true })
  } else {
    proofs.notes.viewUpload = 'VIEW SLOT NOT FOUND'
  }
  await page.getByRole('button', { name: 'Close' }).click()

  // The live-usage banner on the chart already attached to a live event.
  await page.getByRole('button', { name: 'Edit chart' }).last().click()
  await page.waitForTimeout(800)
  await shot(page, 'builder-live-usage-banner-1440')
  await ctx.close()
}

// -- BANDED: the one control with a REAL price band live -------------------
if (STAGES.has('banded')) {
  // Give the proof event a genuine second live price: the back half of its
  // seats move to a $39 tier (TEST fixture data, seats carry tier ids).
  // ticket_tiers.price is CENTS: $39 = 3900. Prefer the existing tier.
  const tiers = await q(`ticket_tiers?event_id=eq.${twoPriced.id}&select=id,name,price&order=price.asc`)
  const cheap = tiers.find(t => Number(t.price) === 3900)
  if (!cheap) throw new Error('no 3900-cent tier on the proof event')
  // Rows from K back become the cheap tier.
  const allSeats = await q(`seats?event_id=eq.${twoPriced.id}&select=id,row_label&limit=10000`)
  const backIds = allSeats.filter(s => s.row_label >= 'K').map(s => s.id)
  for (let i = 0; i < backIds.length; i += 200) {
    await patch(`seats?id=in.(${backIds.slice(i, i + 200).join(',')})`, { ticket_tier_id: cheap.id })
  }
  console.log(`[cap] re-tiered ${backIds.length} back seats to $39`)

  for (const [label, opts] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.goto(eventUrl, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 45000 })
    await page.locator('#tickets').scrollIntoViewIfNeeded()
    const group = page.getByRole('group', { name: 'Find seats together under your price' })
    await group.getByRole('button', { name: 'One more person' }).click()
    await group.getByRole('button', { name: 'One more person' }).click()
    // The $39.00 chip: the band, not Any price.
    await group.getByRole('button', { name: /39\.00/ }).first().click()
    await page.waitForTimeout(600)
    await shot(page, `buyer-banded-receded-${label}`)
    await group.getByRole('button', { name: /Find our seats/ }).click()
    await page.waitForTimeout(2500)
    await shot(page, `buyer-banded-found-${label}`)
    await ctx.close()
  }
  proofs.notes.banded = 'party 4 under $39: picks must land in rows K+ only'
}

// -- DETECT: floor-plan assisted detection with a known-geometry plan ------
if (STAGES.has('detect')) {
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()

  // A plan with EXACT known geometry: two rows of 12 dots, centres at
  // image y=200 and y=260, x=60+i*30, on an 800x400 white canvas.
  const planPage = await ctx.newPage()
  await planPage.setViewportSize({ width: 800, height: 400 })
  await planPage.setContent(`<body style="margin:0;background:#fff;width:800px;height:400px;position:relative">
    ${Array.from({ length: 12 }, (_, i) => `<div style="position:absolute;left:${60 + i * 30 - 8}px;top:192px;width:16px;height:16px;border-radius:50%;background:#222"></div>`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<div style="position:absolute;left:${60 + i * 30 - 8}px;top:252px;width:16px;height:16px;border-radius:50%;background:#222"></div>`).join('')}
  </body>`)
  const planPng = `${OUT}/tmp-floor-plan.png`
  await planPage.screenshot({ path: planPng })
  await planPage.close()

  await page.goto(`${BASE}/dashboard/venues/${VENUE_ID}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: 'New seating chart' }).click()
  await page.getByLabel('Seating chart name').fill('Detect proof chart')
  await page.locator('input[aria-label="Choose a floor plan image to trace"]').setInputFiles(planPng)
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Detect a row' }).click()

  // Anchor the guide line on the underlay IMAGE element's own client box:
  // the dot row sits at exactly half the plan's height (image y 200 of
  // 400), dots spanning x fractions 0.065 to 0.5.
  const imageBox = await page.locator('svg[role="application"] image').boundingBox()
  const rowY = imageBox.y + imageBox.height * 0.5
  await page.mouse.click(imageBox.x + imageBox.width * 0.05, rowY)
  await page.waitForTimeout(300)
  await shot(page, 'builder-detect-anchor-1440')
  await page.mouse.click(imageBox.x + imageBox.width * 0.53, rowY)
  await page.waitForTimeout(1800)
  await shot(page, 'builder-detect-row-placed-1440', { fullPage: true })
  const detectMsg = await page
    .locator('text=/Detected \\d+ seats|laid evenly/')
    .textContent()
    .catch(() => 'no message')
  proofs.notes.detect = { message: detectMsg }
  fs.rmSync(planPng, { force: true })
  await ctx.close()
}

// -- SUPPLEMENT: curve controls and the 390 builder views ------------------
if (STAGES.has('supplement')) {
  const ctx = await browser.newContext({ ...MOBILE, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/venues/${VENUE_ID}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  // Open the auto-bow proof chart at 390: the fanned theatre on a phone.
  await page.getByRole('button', { name: 'Edit chart' }).first().click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Close the block editor' }).click().catch(() => {})
  await shot(page, 'builder-autobow-390', { fullPage: false })
  // Select the rows block: the sheet opens with the curve group; show it.
  await page.locator('svg[role="application"] circle[r="9"]').first().click()
  await page.waitForTimeout(500)
  const bowLabel = page.getByText('Bow to the stage').first()
  await bowLabel.scrollIntoViewIfNeeded()
  await shot(page, 'builder-curve-sheet-390')
  await ctx.close()
}

// â”€â”€ MOBILE builder at 390: draw, move, relabel, bind tier, sheet, save â”€â”€â”€â”€
if (STAGES.has('mobile')) {
  const ctx = await browser.newContext({ ...MOBILE, storageState })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/venues/${VENUE_ID}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: 'New seating chart' }).click()
  await page.getByLabel('Seating chart name').fill('Built on a phone')

  // DRAW: lay rows from the invitation.
  await page.getByRole('button', { name: 'Lay rows' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'mobile-01-draw-390', { fullPage: true })

  // The bottom sheet is up (block selected): BIND TIER in it.
  await page.getByLabel('Ticket tier (bound by name at event attach)').fill('A Reserve')
  await page.waitForTimeout(300)
  await shot(page, 'mobile-02-bind-tier-sheet-390')

  // Close the sheet, MOVE the block with a drag on the canvas.
  await page.getByRole('button', { name: 'Close the block editor' }).click()
  const svg = page.locator('svg[role="application"]')
  const box = await svg.boundingBox()
  const seat = page.locator('svg[role="application"] circle[r="9"]').first()
  const sb = await seat.boundingBox()
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + 90, sb.y + 60, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Close the block editor' }).click().catch(() => {})
  await shot(page, 'mobile-03-moved-390')

  // RELABEL: tool tap, seat tap, type in the sheet, apply (retry the seat
  // tap once if the first lands during a sheet transition).
  await page.getByRole('button', { name: 'Relabel seat' }).click()
  await page.waitForTimeout(400)
  await page.locator('svg[role="application"] circle[r="9"]').nth(2).click()
  await page.waitForTimeout(800)
  if ((await page.locator('input[aria-label^="New label for seat"]').count()) === 0) {
    await page.locator('svg[role="application"] circle[r="9"]').nth(3).click()
    await page.waitForTimeout(800)
  }
  await page.locator('input[aria-label^="New label for seat"]').fill('Box')
  await shot(page, 'mobile-04-relabel-390')
  await page.getByRole('button', { name: 'Apply' }).click()

  // SAVE at 390.
  await page.getByRole('button', { name: 'Select and move' }).click()
  await page.getByRole('button', { name: 'Close the block editor' }).click().catch(() => {})
  await page.getByRole('button', { name: 'Save seating chart' }).click()
  await page.waitForSelector('text=/Saved: \\d+ seats/', { timeout: 30000 })
  await shot(page, 'mobile-05-saved-390', { fullPage: true })
  proofs.notes.mobileBuilder = 'draw, bind, move, relabel, save all performed at 390'
  await ctx.close()
}

// â”€â”€ DIFF: post-publish edit reviewed before commit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (STAGES.has('diff')) {
  // The free cellar event carries sold seats from the prior proofs.
  const freeEvent = (await q(`events?slug=eq.cellar-free-night-on-the-builder-chart&select=id,seat_map_id`))[0]
  if (!freeEvent) throw new Error('cellar free event missing')
  const ctx = await browser.newContext({ ...DESKTOP, storageState })
  const page = await ctx.newPage()

  // Edit the attached chart: keyboard-nudge the block, save (post-publish).
  await page.goto(`${BASE}/dashboard/venues/${VENUE_ID}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: 'Edit chart' }).last().click()
  await page.waitForTimeout(600)
  const svg = page.locator('svg[role="application"]')
  await svg.focus()
  // Block 0 (the seated rows) opens selected; arrows nudge it by the grid.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Save seating chart' }).click()
  await page.waitForSelector('text=/Saved: \\d+ seats/', { timeout: 30000 })

  // The Seats page: review before commit.
  await page.goto(`${BASE}/dashboard/events/${freeEvent.id}/seats`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: 'Review chart edits' }).click()
  await page.waitForSelector('text=Sold and held seats are never touched', { timeout: 30000 })
  await shot(page, 'diff-sheet-1440')
  await page.getByRole('button', { name: 'Apply to the live room' }).click()
  await page.waitForTimeout(2500)
  await shot(page, 'diff-applied-1440')
  await ctx.close()

  const mctx = await browser.newContext({ ...MOBILE, storageState })
  const mpage = await mctx.newPage()
  await mpage.goto(`${BASE}/dashboard/events/${freeEvent.id}/seats`, { waitUntil: 'load', timeout: 90000 })
  await mpage.getByRole('button', { name: 'Review chart edits' }).click()
  await mpage.waitForSelector('text=Sold and held seats are never touched', { timeout: 30000 })
  await shot(mpage, 'diff-sheet-390')
  await mctx.close()
}

// â”€â”€ SELF-MOVE: the orphan-guarded control on /tickets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (STAGES.has('selfmove')) {
  // The test user's seated ticket: enable self-service on its event.
  const seated = await q(
    `tickets?select=id,event_id,seat_id,orders!inner(user_id)&orders.user_id=eq.${TEST_USER_ID}&seat_id=not.is.null&status=eq.valid&limit=1`,
  )
  if (seated.length === 0) {
    proofs.notes.selfmove = 'NO SEATED TICKET for test user - stage skipped'
  } else {
    await patch(`events?id=eq.${seated[0].event_id}`, { allow_seat_self_service: true })
    for (const [label, opts] of [['1440', DESKTOP], ['390', MOBILE]]) {
      const ctx = await browser.newContext({ ...opts, storageState })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/tickets`, { waitUntil: 'load', timeout: 90000 })
      const change = page.getByRole('button', { name: 'Change my seat' })
      await change.first().scrollIntoViewIfNeeded()
      await change.first().click()
      await page.waitForSelector('text=/no one stranded|no lone single|No safe seat/i', { timeout: 30000 })
      await shot(page, `selfmove-control-${label}`, { fullPage: label === '390' })
      await ctx.close()
    }
    proofs.notes.selfmove = { ticket: seated[0].id, event: seated[0].event_id }
  }
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
let merged = proofs
try {
  const prior = JSON.parse(fs.readFileSync(`${OUT}/capture-proofs.json`, 'utf8'))
  merged = { ...prior, ...proofs, notes: { ...prior.notes, ...proofs.notes } }
} catch {}
fs.writeFileSync(`${OUT}/capture-proofs.json`, JSON.stringify(merged, null, 2))
console.log('[cap] COMPLETE')

