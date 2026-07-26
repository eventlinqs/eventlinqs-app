/**
 * The rebuild evidence drive (TEST only). Against a local production server:
 *   - The three LOD states at 1440 and 390 on the 2,016-seat Grand Hall.
 *   - The 502-seat Play House (aisles, stagger, uneven rows, galleries,
 *     polygons, every venue object) at 1440 and 390.
 *   - The tooltip, the key plan, ticket-type legend filtering, the group
 *     ticket unit, the chair glyph at three sizes, view-from-seat anchored.
 *   - Full keyboard operation of the buyer sheet and the builder.
 *   - Frame times on scripted pan and zoom at 502, 2,016 and 5,000 seats
 *     (rAF frame intervals, honest for old and new renderers alike).
 * Writes screenshots + seating-rebuild-proofs.json to
 * docs/design/seating-rebuild-2026-07-26/.
 *
 * Usage: node scripts/seating-rebuild-proofs.mjs <baseUrl> [steps]
 *   steps: comma list of buyer,extras,keyboard,builder,perf (default all)
 *   PERF_LABEL=before node ... perf   -> writes perf-before.json instead.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/seating-rebuild-proofs.mjs <baseUrl> [steps]')
const STEPS = new Set((process.argv[3] ?? 'buyer,extras,keyboard,builder,perf').split(','))
const PERF_LABEL = process.env.PERF_LABEL ?? 'after'
const OUT = 'docs/design/seating-rebuild-2026-07-26'
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

const SLUG_500 = 'play-house-proof-a-seated-evening'
const SLUG_2000 = 'grand-hall-proof-the-full-house'
const SLUG_5000 = 'endurance-hall-five-thousand-seats'
const MAP_500 = '3633a391-3a0c-4fe2-8b8f-637c3ec46725'
const TEST_EMAIL = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const TEST_USER_ID = '57101100-eec8-4e72-a464-97e11e66bea1'

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

const proofs = { base: BASE, startedAt: new Date().toISOString(), steps: {} }

const SHEET = '[data-testid="seat-sheet"]'
const SELECTOR = '[data-testid="seat-selector"]'
const CONTAINER = `${SHEET} > div`

async function openSeats(page, slug) {
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector(`${SHEET} canvas`, { timeout: 60000 })
  await page.waitForTimeout(1200)
}

async function shotEl(page, selector, name) {
  await page.waitForTimeout(500)
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await el.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`[proof] shot ${name}`)
}

async function getLod(page) {
  return page.locator(CONTAINER).first().getAttribute('data-lod')
}
async function getScale(page) {
  return Number(await page.locator(CONTAINER).first().getAttribute('data-scale'))
}

/** Click zoom controls until the LOD attribute reads the target state. */
async function driveToLod(page, target, dir) {
  const button = page.getByRole('button', { name: dir === 'in' ? 'Zoom in' : 'Zoom out' }).first()
  for (let i = 0; i < 14; i++) {
    if ((await getLod(page)) === target) return true
    await button.click()
    await page.waitForTimeout(420)
  }
  return (await getLod(page)) === target
}

async function seatScreen(page, row, num) {
  return page.locator(CONTAINER).first().evaluate(
    (el, args) => el.__seatDebug?.seatScreen(args.row, args.num) ?? null,
    { row, num },
  )
}

async function clickSeat(page, row, num) {
  const pos = await seatScreen(page, row, num)
  if (!pos) throw new Error(`seat ${row}-${num} not resolvable`)
  const box = await page.locator(CONTAINER).first().boundingBox()
  await page.mouse.click(box.x + pos.x, box.y + pos.y)
  await page.waitForTimeout(400)
  return pos
}

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 940 } }
const MOBILE = { ...devices['iPhone 13'] }

// ── Setup: a view-from-seat photo for the Play House Stalls ────────────────
{
  const cover = (await q('events?status=eq.published&select=cover_image_url&cover_image_url=not.is.null&limit=1'))[0]?.cover_image_url
  if (cover) {
    await upsert(
      'seat_section_views',
      { id: uuidFrom('rebuildview:playhouse:stalls'), seat_map_id: MAP_500, section_name: 'Stalls', photo_url: cover },
      'seat_map_id,section_name',
    )
  }
  proofs.steps.setup = { sectionView: !!cover }
}

// ── Buyer captures ──────────────────────────────────────────────────────────
if (STEPS.has('buyer')) {
  for (const [viewportName, ctxOpts] of [
    ['1440', DESKTOP],
    ['390', MOBILE],
  ]) {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()

    // The three LOD states on the 2,016-seat Grand Hall.
    await openSeats(page, SLUG_2000)
    const entryLod = await getLod(page)
    proofs.steps[`entry-lod-${viewportName}`] = { lod: entryLod, scale: await getScale(page) }
    await driveToLod(page, 'overview', 'out')
    await shotEl(page, SHEET, `lod-overview-${viewportName}`)
    proofs.steps[`lod-overview-${viewportName}`] = { scale: await getScale(page) }
    await driveToLod(page, 'mid', 'in')
    await shotEl(page, SHEET, `lod-mid-${viewportName}`)
    proofs.steps[`lod-mid-${viewportName}`] = { scale: await getScale(page) }
    await driveToLod(page, 'seat', 'in')
    // Numerals band: keep zooming until the numeral threshold.
    for (let i = 0; i < 6 && (await getScale(page)) < 0.9; i++) {
      await page.getByRole('button', { name: 'Zoom in' }).first().click()
      await page.waitForTimeout(420)
    }
    await shotEl(page, SHEET, `lod-seat-${viewportName}`)
    proofs.steps[`lod-seat-${viewportName}`] = { scale: await getScale(page) }

    // The full 2,016-seat room at fit.
    await page.getByRole('button', { name: 'Zoom to fit' }).first().click()
    await page.waitForTimeout(600)
    await shotEl(page, SHEET, `room2000-fit-${viewportName}`)

    // The 502-seat Play House: the whole selector (sheet + schedule).
    await openSeats(page, SLUG_500)
    await shotEl(page, SELECTOR, `room500-${viewportName}`)

    await ctx.close()
  }
  console.log('[proof] buyer captures done')
}

// ── Extras: tooltip, key plan, legend filter, group, glyph sizes, view ─────
if (STEPS.has('extras')) {
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await openSeats(page, SLUG_500)

  // Tooltip: hover a known stalls seat (row C seat 10).
  {
    const box = await page.locator(CONTAINER).first().boundingBox()
    const pos = await seatScreen(page, 'C', '10')
    if (pos) {
      await page.mouse.move(box.x + pos.x, box.y + pos.y)
      await page.waitForTimeout(500)
      await shotEl(page, SHEET, 'tooltip-1440')
    }
  }

  // Key plan: zoom until it appears, then shoot the sheet.
  {
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Zoom in' }).first().click()
      await page.waitForTimeout(380)
    }
    await shotEl(page, SHEET, 'keyplan-1440')
    await page.getByRole('button', { name: 'Zoom to fit' }).first().click()
    await page.waitForTimeout(600)
  }

  // Ticket-type legend: filter to B Reserve, the field dims around it.
  {
    await page.getByRole('button', { name: /B Reserve/ }).first().click()
    await page.waitForTimeout(500)
    await shotEl(page, SELECTOR, 'tiers-filter-1440')
    await page.getByRole('button', { name: /B Reserve/ }).first().click()
    await page.waitForTimeout(300)
  }

  // The group ticket: one tap on the terrace holds three together.
  {
    await clickSeat(page, 'T', '6')
    await shotEl(page, SELECTOR, 'group-of-three-1440')
    await clickSeat(page, 'T', '6') // release the unit
  }

  // View from seat, anchored: open the Stalls photo, polygon lit.
  {
    const viewButton = page.getByRole('button', { name: 'Stalls', exact: true }).first()
    await viewButton.click()
    await page.waitForTimeout(700)
    await shotEl(page, SELECTOR, 'view-from-seat-anchored-1440')
    await page.getByRole('button', { name: 'Close the view photo' }).click()
  }

  // The chair glyph at its three sizes: clip the canvas centre at three
  // zoom levels (mark at overview, mid, full furniture at seat zoom).
  {
    const clipShot = async name => {
      const box = await page.locator(CONTAINER).first().boundingBox()
      await page.screenshot({
        path: `${OUT}/${name}.png`,
        clip: { x: box.x + box.width / 2 - 170, y: box.y + box.height / 2 - 110, width: 340, height: 220 },
      })
      console.log(`[proof] shot ${name}`)
    }
    await page.getByRole('button', { name: 'Zoom to fit' }).first().click()
    await page.waitForTimeout(500)
    await driveToLod(page, 'overview', 'out')
    await shotEl(page, SHEET, 'glyph-overview-polygons-1440')
    await driveToLod(page, 'mid', 'in')
    await clipShot('glyph-mid-mark')
    await driveToLod(page, 'seat', 'in')
    for (let i = 0; i < 3 && (await getScale(page)) < 1.4; i++) {
      await page.getByRole('button', { name: 'Zoom in' }).first().click()
      await page.waitForTimeout(380)
    }
    await clipShot('glyph-full-furniture')
  }

  // Every venue object glyph: the objects flank the Play House; fit shows
  // them all, and a right-edge clip shows the glyph detail.
  {
    await page.getByRole('button', { name: 'Zoom to fit' }).first().click()
    await page.waitForTimeout(600)
    await shotEl(page, SHEET, 'objects-all-1440')
  }

  // Colour-vision palettes on the rebuilt sheet.
  {
    await page.getByRole('button', { name: 'Seat colours' }).click()
    await page.waitForTimeout(300)
    await shotEl(page, SELECTOR, 'palette-menu-1440')
    await page.getByRole('menuitemradio', { name: /deutan/i }).click()
    await page.waitForTimeout(500)
    await shotEl(page, SHEET, 'palette-deutan-1440')
    await page.getByRole('button', { name: 'Seat colours' }).click()
    await page.getByRole('menuitemradio', { name: /tritan/i }).click()
    await page.waitForTimeout(500)
    await shotEl(page, SHEET, 'palette-tritan-1440')
    await page.getByRole('button', { name: 'Seat colours' }).click()
    await page.getByRole('menuitemradio', { name: 'House', exact: false }).first().click()
    await page.waitForTimeout(300)
  }

  // Mobile: docked strip carries the tapped seat; key plan corners the sheet.
  const mctx = await browser.newContext(MOBILE)
  const mpage = await mctx.newPage()
  await openSeats(mpage, SLUG_500)
  {
    for (let i = 0; i < 3; i++) {
      await mpage.getByRole('button', { name: 'Zoom in' }).first().click()
      await mpage.waitForTimeout(380)
    }
    const pos = await seatScreen(mpage, 'H', '10')
    if (pos) {
      const box = await mpage.locator(CONTAINER).first().boundingBox()
      if (pos.x > 0 && pos.y > 0 && pos.x < box.width && pos.y < box.height) {
        await mpage.mouse.click(box.x + pos.x, box.y + pos.y)
        await mpage.waitForTimeout(400)
      }
    }
    await shotEl(mpage, SHEET, 'docked-strip-390')
  }
  await mctx.close()
  await ctx.close()
  console.log('[proof] extras done')
}

// ── Keyboard: the buyer sheet operated by keys alone ───────────────────────
if (STEPS.has('keyboard')) {
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await openSeats(page, SLUG_500)
  const canvas = page.locator(`${SHEET} canvas`).first()
  await canvas.focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(200)
  }
  await shotEl(page, SHEET, 'keyboard-cursor-1440')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await shotEl(page, SELECTOR, 'keyboard-selected-1440')
  proofs.steps.keyboard = {
    selectedCount: await page.locator(`${SELECTOR}`).getByText(/2 seats/).count(),
  }
  await ctx.close()
  console.log('[proof] keyboard done')
}

// ── Builder: the studio on the sheet, keyboard, mobile strip, trace ────────
if (STEPS.has('builder')) {
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

  // The studio venue on the test user's own organisation.
  const org = (await q(`organisations?owner_id=eq.${TEST_USER_ID}&select=id&limit=1`))[0]
  const venueId = uuidFrom('rebuild:studio-venue')
  await upsert('venues', {
    id: venueId, organisation_id: org.id, name: 'Studio Proof Room',
    city: 'Geelong', state: 'VIC', country: 'Australia', capacity: 220, is_active: true,
  })

  const page = await authed.newPage()
  await page.goto(`${BASE}/dashboard/venues/${venueId}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  // Open the builder (new chart or the existing proof chart).
  const openExisting = page.getByRole('button', { name: /edit|open/i }).first()
  const newChart = page.getByRole('button', { name: /new seating chart|create/i }).first()
  if (await newChart.count()) await newChart.click()
  else await openExisting.click()
  await page.waitForSelector('canvas', { timeout: 30000 })
  await page.waitForTimeout(800)

  // Compose the room: preset theatre (stage block included), then an aisle
  // and a bar from the room palette.
  const theatre = page.getByRole('button', { name: 'Theatre', exact: true })
  if (await theatre.count()) {
    await theatre.click()
    await page.waitForTimeout(700)
  }
  await page.getByRole('button', { name: '+ The room' }).click()
  await page.waitForTimeout(300)
  await shotEl(page, 'body', 'builder-room-menu-1440')
  await page.getByRole('menuitem', { name: /Aisle/ }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '+ The room' }).click()
  await page.getByRole('menuitem', { name: 'Bar', exact: true }).click()
  await page.waitForTimeout(600)
  await shotEl(page, 'body', 'builder-sheet-1440')

  // The stage inspector: pick the thrust shape.
  {
    // Select the stage via Tab cycling until the inspector shows shapes.
    const canvas = page.locator('canvas').first()
    await canvas.focus()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(250)
      if (await page.getByRole('button', { name: 'Thrust' }).count()) break
    }
    if (await page.getByRole('button', { name: 'Thrust' }).count()) {
      await page.getByRole('button', { name: 'Thrust' }).click()
      await page.waitForTimeout(600)
      await shotEl(page, 'body', 'builder-stage-thrust-1440')
    }
    // Keyboard nudge proof: arrows move the selected block.
    await canvas.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(400)
    await shotEl(page, 'body', 'builder-keyboard-nudge-1440')
  }

  // The trace: a floor plan under the grid with its slider on the sheet.
  {
    const chooser = page.locator('input[aria-label="Choose a floor plan image to trace"]')
    await chooser.setInputFiles('docs/design/seating-final-2026-07-26/r47/eventbookings-05.png')
    await page.waitForTimeout(900)
    await shotEl(page, 'body', 'builder-trace-1440')
  }

  await page.close()

  // Mobile builder: the numbers strip keeps the room visible.
  const mctx = await browser.newContext({ ...MOBILE, storageState })
  const mpage = await mctx.newPage()
  await mpage.goto(`${BASE}/dashboard/venues/${venueId}/seat-maps`, { waitUntil: 'load', timeout: 90000 })
  const mNew = mpage.getByRole('button', { name: /new seating chart|create/i }).first()
  if (await mNew.count()) await mNew.click()
  else await mpage.getByRole('button', { name: /edit|open/i }).first().click()
  await mpage.waitForSelector('canvas', { timeout: 30000 })
  const mTheatre = mpage.getByRole('button', { name: 'Theatre', exact: true })
  if (await mTheatre.count()) {
    await mTheatre.click()
    await mpage.waitForTimeout(700)
  }
  // Select a block by tapping the canvas centre, opening the strip.
  {
    const box = await mpage.locator('canvas').first().boundingBox()
    await mpage.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await mpage.waitForTimeout(600)
    await mpage.screenshot({ path: `${OUT}/builder-mobile-strip-390.png`, fullPage: false })
    console.log('[proof] shot builder-mobile-strip-390')
  }
  await mctx.close()
  await authed.close()
  console.log('[proof] builder done')
}

// ── Frame times: scripted pan and zoom, rAF intervals (fair to any DOM) ────
if (STEPS.has('perf')) {
  const results = {}
  for (const [label, slug] of [
    ['seats-502', SLUG_500],
    ['seats-2016', SLUG_2000],
    ['seats-5000', SLUG_5000],
  ]) {
    const ctx = await browser.newContext(DESKTOP)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'load', timeout: 180000 })
    // Old renderer has no data-testid: fall back to the map region.
    const target = (await page.locator(SHEET).count())
      ? page.locator(`${SHEET} canvas`).first()
      : page.locator('svg[role="img"][aria-label="Seat map"], svg[aria-label="Seat map"]').first()
    await target.waitFor({ timeout: 90000 })
    await target.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    const box = await target.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    const measure = async driver => {
      await page.evaluate(() => {
        window.__frames = []
        window.__stopFrames = false
        let last = performance.now()
        const tick = now => {
          window.__frames.push(now - last)
          last = now
          if (!window.__stopFrames) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await driver()
      const frames = await page.evaluate(() => {
        window.__stopFrames = true
        return window.__frames.slice(3)
      })
      const sorted = [...frames].sort((a, b) => a - b)
      const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      return { frames: frames.length, meanMs: +mean.toFixed(2), p95Ms: +p95.toFixed(2) }
    }

    const pan = await measure(async () => {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 0; i < 60; i++) {
        await page.mouse.move(cx + Math.sin(i / 6) * 220, cy + Math.cos(i / 8) * 140, { steps: 1 })
        await page.waitForTimeout(16)
      }
      await page.mouse.up()
    })

    const zoom = await measure(async () => {
      for (let i = 0; i < 12; i++) {
        await page.mouse.move(cx, cy)
        await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240)
        await page.keyboard.down('Control')
        await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240)
        await page.keyboard.up('Control')
        await page.waitForTimeout(120)
      }
    })

    // The new renderer also reports true paint durations.
    const paint = await page.evaluate(() => {
      const ring = window.__seatFrameTimes ?? []
      if (ring.length === 0) return null
      const sorted = [...ring].sort((a, b) => a - b)
      return {
        paints: ring.length,
        meanMs: +(ring.reduce((a, b) => a + b, 0) / ring.length).toFixed(2),
        p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2),
      }
    })

    results[label] = { pan, zoom, paint }
    console.log(`[proof] perf ${label}`, JSON.stringify(results[label]))
    await ctx.close()
  }
  fs.writeFileSync(`${OUT}/perf-${PERF_LABEL}.json`, JSON.stringify(results, null, 2))
  proofs.steps[`perf-${PERF_LABEL}`] = results
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
fs.writeFileSync(`${OUT}/seating-rebuild-proofs.json`, JSON.stringify(proofs, null, 2))
console.log('[proof] DONE')
