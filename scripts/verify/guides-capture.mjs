/**
 * The guide + guidance capture drive.
 *
 * Produces two sets of evidence, both from the RUNNING app on TEST data:
 *  1. public/guides/*.png   the screenshots the written guides are illustrated
 *                           with. The guide library test fails if any is
 *                           missing, so this script is the gate's supplier.
 *  2. docs/design/guidance-2026-07-26/*.png  the proof captures of every
 *                           guidance surface at 1440 and 390.
 *
 * TEST ONLY. Hard safety stop on the production project ref.
 * Usage: node scripts/verify/guides-capture.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: this is production')
if (!URL_.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')

const T = JSON.parse(fs.readFileSync('scripts/verify/.guides-capture-targets.json', 'utf8'))

const GUIDE_DIR = 'public/guides'
const PROOF_DIR = 'docs/design/guidance-2026-07-26'
fs.mkdirSync(GUIDE_DIR, { recursive: true })
fs.mkdirSync(PROOF_DIR, { recursive: true })

const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'

const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

const done = []
const failed = []

const browser = await chromium.launch()

async function shot(page, dir, name, opts = {}) {
  await page.waitForTimeout(opts.settle ?? 900)
  const path = `${dir}/${name}.png`
  if (opts.selector) {
    const el = await page.$(opts.selector)
    if (!el) throw new Error(`selector not found for ${name}: ${opts.selector}`)
    await el.screenshot({ path })
  } else {
    await page.screenshot({ path, fullPage: Boolean(opts.fullPage) })
  }
  done.push(path)
  console.log(`[capture] ${path}`)
}

async function login(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
  return page
}

async function step(name, fn) {
  try {
    await fn()
  } catch (err) {
    failed.push(`${name}: ${err.message}`)
    console.error(`[capture] FAILED ${name}: ${err.message}`)
  }
}

// ── 1. Organiser dashboard captures for the written guides ──────────────────
{
  const ctx = await browser.newContext(DESKTOP)
  const page = await login(ctx)

  await step('creating-your-first-event', async () => {
    await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('text=Basic Details', { timeout: 30000 })
    await shot(page, GUIDE_DIR, 'creating-your-first-event-1')
  })

  await step('creating-your-first-event-tickets', async () => {
    // The EDIT form of a real event: fields are already valid, so stepping
    // through to Tickets shows the real screen rather than an empty one.
    await page.goto(`${BASE}/dashboard/events/${T.anyPublishedEventId}/edit`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForSelector('text=Basic Details', { timeout: 30000 })
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("Continue")')
      await page.waitForTimeout(700)
    }
    await page.waitForSelector('text=Step 5 of 7', { timeout: 15000 })
    await shot(page, GUIDE_DIR, 'creating-your-first-event-2')
  })

  await step('room-studio-with-chart', async () => {
    await page.goto(`${BASE}/dashboard/venues/${T.venueWithChart.venueId}/seat-maps`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForSelector('button:has-text("Edit chart")', { timeout: 30000 })
    await page.click('button:has-text("Edit chart")')
    await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForTimeout(1800)
    await shot(page, GUIDE_DIR, 'building-a-seating-chart-1')

    // The inspector with a block selected: the ticket type field.
    await step('studio-inspector', async () => {
      const box = await (await page.$('canvas')).boundingBox()
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45)
      await page.waitForTimeout(900)
      await shot(page, GUIDE_DIR, 'mapping-ticket-tiers-to-seats-1')
    })
  })

  await step('room-studio-empty', async () => {
    await page.goto(`${BASE}/dashboard/venues/${T.venueWithChart.venueId}/seat-maps`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForSelector('button:has-text("New seating chart")', { timeout: 30000 })
    await page.click('button:has-text("New seating chart")')
    await page.waitForSelector('text=Draw your room', { timeout: 30000 })
    await page.waitForTimeout(1200)
    await shot(page, GUIDE_DIR, 'building-a-seating-chart-2')
    // Proof: the room studio first-run coaching, desktop.
    await shot(page, PROOF_DIR, 'room-studio-coach-1440')

    // Proof: the empty-sheet teaching state, and the first-block hint on a
    // desktop where the inspector is a side column rather than an overlay.
    await step('room-studio-desktop-empty-and-hint', async () => {
      await page.click('button[aria-label*="Close this guide"]')
      await page.waitForTimeout(500)
      await shot(page, PROOF_DIR, 'room-studio-empty-state-1440')
      await page.click('button:has-text("Lay rows")')
      await page.waitForTimeout(1400)
      await shot(page, PROOF_DIR, 'room-studio-first-block-hint-1440')
    })
  })

  await step('event-seats-page', async () => {
    await page.goto(`${BASE}/dashboard/events/${T.seatedEventId}/seats`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForTimeout(2000)
    await shot(page, GUIDE_DIR, 'mapping-ticket-tiers-to-seats-2')
  })

  await step('launch-kit', async () => {
    await page.goto(`${BASE}/dashboard/events/${T.anyPublishedEventId}/launch-kit`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForTimeout(1800)
    await shot(page, GUIDE_DIR, 'publishing-and-sharing-your-promo-kit-1')
    await shot(page, GUIDE_DIR, 'publishing-and-sharing-your-promo-kit-2', {
      selector: 'section[aria-labelledby="kit-share-heading"]',
    })
  })

  await step('reach', async () => {
    await page.goto(`${BASE}/dashboard/events/${T.anyPublishedEventId}/reach`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForTimeout(1500)
    await shot(page, GUIDE_DIR, 'tracking-your-reach-1')
    await shot(page, GUIDE_DIR, 'tracking-your-reach-2', { fullPage: true })
  })

  await step('payouts', async () => {
    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForTimeout(1500)
    await shot(page, GUIDE_DIR, 'getting-paid-and-payout-timing-1')
    await shot(page, GUIDE_DIR, 'getting-paid-and-payout-timing-2', { fullPage: true })
  })

  await step('order-refund', async () => {
    await page.goto(
      `${BASE}/dashboard/events/${T.orderTarget.eventId}/orders/${T.orderTarget.orderId}`,
      { waitUntil: 'load', timeout: 90000 },
    )
    await page.waitForTimeout(1500)
    await shot(page, GUIDE_DIR, 'refunds-and-transfers-1', { fullPage: true })
  })

  await step('tickets-transfer', async () => {
    await page.goto(`${BASE}/tickets`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForTimeout(1500)
    await shot(page, GUIDE_DIR, 'refunds-and-transfers-2', { fullPage: true })
  })

  await ctx.close()
}

// ── 2. The door scanner, captured at phone width because that is where it runs ─
{
  const ctx = await browser.newContext(MOBILE)
  const page = await login(ctx)
  await step('scanner', async () => {
    await page.goto(`${BASE}/scan/${T.anyPublishedEventId}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForTimeout(1500)
    await shot(page, GUIDE_DIR, 'running-the-door-with-the-qr-scanner-1')
    await shot(page, GUIDE_DIR, 'running-the-door-with-the-qr-scanner-2', { fullPage: true })
  })
  await ctx.close()
}

// ── 3. Guidance proof: the buyer seat map, desktop and phone ────────────────
for (const [label, opts] of [
  ['1440', DESKTOP],
  ['390', MOBILE],
]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await step(`buyer-seat-map-${label}`, async () => {
    await page.goto(`${BASE}/events/${T.seatedEventSlug}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('[data-testid="seat-selector"]', { timeout: 45000 })
    await page.locator('[data-testid="seat-selector"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2500)
    // First-run coaching is showing: this context has never seen it.
    await shot(page, PROOF_DIR, `buyer-seat-map-coach-${label}`)

    // Step through the coaching so the sequence itself is evidenced.
    await step(`buyer-seat-map-coach-step2-${label}`, async () => {
      await page.click('button:has-text("Next")')
      await page.waitForTimeout(600)
      await shot(page, PROOF_DIR, `buyer-seat-map-coach-step2-${label}`)
    })

    // Dismiss, then open the persistent help launcher.
    await step(`buyer-seat-map-panel-${label}`, async () => {
      await page.click('button[aria-label*="Close this guide"]')
      await page.waitForTimeout(500)
      await shot(page, PROOF_DIR, `buyer-seat-map-launcher-${label}`)
      await page.click('button[aria-label^="Open help"]')
      await page.waitForTimeout(900)
      await shot(page, PROOF_DIR, `buyer-seat-map-help-panel-${label}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    })

    // The contextual hints need a room with sold seats and a room with two
    // ticket types, which this proof room is neither of. They are captured
    // deterministically by scripts/verify/guidance-hint-capture.mjs instead:
    // a sweep here produced an empty frame that looked like evidence and was
    // not, which is worse than no capture.
  })
  await ctx.close()
}

// ── 4. Guidance proof: the room studio at phone width ───────────────────────
{
  const ctx = await browser.newContext(MOBILE)
  const page = await login(ctx)
  await step('room-studio-390', async () => {
    await page.goto(`${BASE}/dashboard/venues/${T.venueWithChart.venueId}/seat-maps`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForSelector('button:has-text("New seating chart")', { timeout: 30000 })
    await page.click('button:has-text("New seating chart")')
    await page.waitForSelector('text=Draw your room', { timeout: 30000 })
    await page.waitForTimeout(1500)
    await shot(page, PROOF_DIR, 'room-studio-coach-390')
    await step('room-studio-empty-teaching-390', async () => {
      await page.click('button[aria-label*="Close this guide"]')
      await page.waitForTimeout(500)
      await shot(page, PROOF_DIR, 'room-studio-empty-state-390')
    })
    await step('room-studio-first-block-390', async () => {
      await page.click('button:has-text("Lay rows")')
      await page.waitForTimeout(1200)
      // On a phone the inspector sheet slides up over the plan and covers the
      // hint. That is correct behaviour and the inspector teaches the same
      // thing in its own field label, so the capture is named for what it
      // actually shows rather than for the hint it does not.
      await shot(page, PROOF_DIR, 'room-studio-first-block-inspector-390')
    })
  })
  await ctx.close()
}

// ── 5. The hub and a guide page, both widths ────────────────────────────────
for (const [label, opts] of [
  ['1440', DESKTOP],
  ['390', MOBILE],
]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await step(`guides-hub-${label}`, async () => {
    await page.goto(`${BASE}/guides`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('#guide-search', { timeout: 30000 })
    await page.waitForTimeout(1600)
    await shot(page, PROOF_DIR, `guides-hub-${label}`, { fullPage: true })
    await page.fill('#guide-search', 'payout')
    await page.waitForTimeout(700)
    await shot(page, PROOF_DIR, `guides-hub-search-${label}`)
  })
  await step(`guide-page-${label}`, async () => {
    await page.goto(`${BASE}/guides/mapping-ticket-tiers-to-seats`, {
      waitUntil: 'load',
      timeout: 90000,
    })
    await page.waitForTimeout(1600)
    await shot(page, PROOF_DIR, `guide-page-${label}`, { fullPage: true })
  })
  await ctx.close()
}

// ── 6. The teaching empty state on a seatless event, desktop ────────────────
await browser.close()

fs.writeFileSync(
  `${PROOF_DIR}/capture-manifest.json`,
  JSON.stringify({ base: BASE, captured: done, failed, at: new Date().toISOString() }, null, 2),
)

console.log(`\n[capture] ${done.length} captured, ${failed.length} failed`)
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED ${f}`)
  process.exitCode = 1
}
