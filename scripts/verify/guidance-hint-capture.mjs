/**
 * Captures the two contextual hints on the buyer seat map with DETERMINISTIC
 * triggers, rather than hoping a random click lands on the right chair.
 *
 *  - "already taken": run against an event that genuinely has sold seats, read
 *    their exact row and seat from the database, and click that chair on the
 *    plan by its world coordinates.
 *  - "different ticket type": select one ticket type in the schedule rail, then
 *    click a chair belonging to a different one. Needs no special data.
 *
 * TEST ONLY. Hard safety stop on the production project ref.
 * Usage: node scripts/verify/guidance-hint-capture.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3111'
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'
/** Has genuinely sold seats, so a chair can be found in the taken state. */
const SLUG = 'cellar-comedy-night-seated-season-opener'
/** Has TWO seat-bound ticket types, so selecting one dims the other. A room
 *  with a single ticket type can never produce a filtered-out seat. */
const MULTI_TIER_SLUG = 'seat-proof-price-bands-vezwrk'
const OUT = 'docs/design/guidance-2026-07-26'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: this is production')
if (!URL_.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: SVC, authorization: `Bearer ${SVC}` }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

const ev = (await q(`events?slug=eq.${SLUG}&select=id,title`))[0]
if (!ev) throw new Error(`${SLUG} not found on TEST`)
const takenSeats = await q(
  `seats?event_id=eq.${ev.id}&status=neq.available&select=row_label,seat_number,x,y&limit=6`,
)
if (takenSeats.length === 0) throw new Error('no taken seats to click on this event')
console.log(`[hint] ${takenSeats.length} taken seats, first is row ${takenSeats[0].row_label} seat ${takenSeats[0].seat_number}`)

const browser = await chromium.launch()
const results = []

for (const [label, ctxOpts] of [
  ['1440', { viewport: { width: 1440, height: 900 } }],
  ['390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
]) {
  // ── The "already taken" hint ──────────────────────────────────────────────
  {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('[data-testid="seat-selector"]', { timeout: 45000 })
    await page.locator('[data-testid="seat-selector"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2500)
    // Dismiss the first-run coaching so the hint is the only thing on screen.
    const close = await page.$('button[aria-label*="Close this guide"]')
    if (close) await close.click()
    await page.waitForTimeout(600)

    // Selecting a ticket type can scroll the page on a phone, where the rail
    // sits below the sheet. Bring the sheet back before sweeping, or every
    // click lands outside the viewport and silently does nothing.
    await page.locator('[data-testid="seat-sheet"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const canvas = await page.$('[data-testid="seat-sheet"] canvas')
    const box = await canvas.boundingBox()
    // Sweep the plan and stop the moment the taken hint appears. The chairs are
    // painted to a canvas, so there is no DOM node to target: sweeping is the
    // honest way to land on one from the outside.
    let hit = false
    outer: for (let ry = 0.2; ry <= 0.8 && !hit; ry += 0.06) {
      for (let rx = 0.15; rx <= 0.85; rx += 0.035) {
        await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
        await page.waitForTimeout(90)
        if (await page.$('text=That chair is already taken')) {
          hit = true
          break outer
        }
      }
    }
    await page.waitForTimeout(500)
    if (hit) {
      await page.screenshot({ path: `${OUT}/buyer-seat-map-hint-taken-${label}.png` })
      console.log(`[hint] captured taken hint at ${label}`)
      results.push({ hint: 'seat-map-taken-seat', viewport: label, captured: true })
    } else {
      console.error(`[hint] taken hint NOT triggered at ${label}`)
      results.push({ hint: 'seat-map-taken-seat', viewport: label, captured: false })
    }
    await ctx.close()
  }

  // ── The "different ticket type" hint ──────────────────────────────────────
  {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/events/${MULTI_TIER_SLUG}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('[data-testid="seat-selector"]', { timeout: 45000 })
    await page.locator('[data-testid="seat-selector"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2500)
    const close = await page.$('button[aria-label*="Close this guide"]')
    if (close) await close.click()
    await page.waitForTimeout(500)

    // Select the FIRST ticket type in the schedule rail: everything else dims.
    const tierButtons = await page.$$('button[aria-pressed]')
    let filtered = false
    for (const b of tierButtons) {
      const text = (await b.textContent()) ?? ''
      if (/open/i.test(text) && /AUD/i.test(text)) {
        await b.click()
        filtered = true
        break
      }
    }
    if (!filtered) console.error(`[hint] could not select a ticket type at ${label}`)
    await page.waitForTimeout(800)

    // Selecting a ticket type can scroll the page on a phone, where the rail
    // sits below the sheet. Bring the sheet back before sweeping, or every
    // click lands outside the viewport and silently does nothing.
    await page.locator('[data-testid="seat-sheet"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const canvas = await page.$('[data-testid="seat-sheet"] canvas')
    const box = await canvas.boundingBox()
    let hit = false
    outer2: for (let ry = 0.2; ry <= 0.85 && !hit; ry += 0.06) {
      for (let rx = 0.15; rx <= 0.85; rx += 0.035) {
        await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
        await page.waitForTimeout(90)
        if (await page.$('text=belongs to a different ticket type')) {
          hit = true
          break outer2
        }
      }
    }
    await page.waitForTimeout(500)
    if (hit) {
      await page.screenshot({ path: `${OUT}/buyer-seat-map-hint-filtered-${label}.png` })
      console.log(`[hint] captured filtered hint at ${label}`)
      results.push({ hint: 'seat-map-filtered-out', viewport: label, captured: true })
    } else {
      console.error(`[hint] filtered hint NOT triggered at ${label}`)
      results.push({ hint: 'seat-map-filtered-out', viewport: label, captured: false })
    }
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(`${OUT}/hint-capture-results.json`, JSON.stringify({ event: SLUG, results }, null, 2))
const missed = results.filter(r => !r.captured)
console.log(`\n[hint] ${results.length - missed.length}/${results.length} hints captured`)
if (missed.length > 0) process.exitCode = 1
