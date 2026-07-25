/**
 * Launch Kit audit evidence drive (Phase A, read-only on code).
 * Captures: anonymous auth wall, a TIMED realistic wizard run (typed at human
 * cadence), the Launch Kit screen, reach panel, A4 poster PDF, OG invitation
 * card, seat map builder, and the public event page, at 1440 and 390.
 * Writes ONLY to docs/design/launch-kit-audit-2026-07-25/ and the TEST database
 * (one real published free event, via the staging deployment).
 * Usage: node lk-audit-drive.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv[2] ?? 'https://eventlinqs-staging.vercel.app'
const OUT = 'docs/design/launch-kit-audit-2026-07-25'
fs.mkdirSync(OUT, { recursive: true })
const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'
const COVER = 'public/images/hero/comedy.jpg'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const results = { base: BASE, timings: {}, checks: {} }

const browser = await chromium.launch()

// ── 1. Anonymous wall proof: where does a stranger hit the first wall? ──────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
  await p.waitForTimeout(2500)
  results.checks.anonCreateLandsOn = p.url()
  log('anonymous /dashboard/events/create landed on:', p.url())
  await p.screenshot({ path: `${OUT}/01-anon-create-wall-1440.png`, fullPage: true })
  await ctx.close()
}

// ── 2. Login (once: staging rate-limits the login route) ───────────────────
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

// ── 3. TIMED realistic wizard run ───────────────────────────────────────────
// Human cadence: fields typed at ~30ms/char, ~1.2s orientation pause per step.
await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
const titleInput = page.locator('input[placeholder*="Summer Music Festival"]')
await titleInput.waitFor({ timeout: 60000 })
const pause = ms => page.waitForTimeout(ms)
const cont = () => page.getByRole('button', { name: /^Continue$/ }).click()

const t0 = Date.now()
// Step 1: Basic Details
await titleInput.pressSequentially('Winter Warmers: Geelong Comedy Gala', { delay: 28 })
const categoryValue = await page.evaluate(() => {
  const sel = document.querySelector('select')
  if (!sel) return null
  const opts = [...sel.options]
  const pick = opts.find(o => /comed/i.test(o.text)) ?? opts[1]
  return pick ? pick.value : null
})
if (categoryValue) await page.locator('select').first().selectOption(categoryValue)
await page.screenshot({ path: `${OUT}/02a-wizard-step1-basic-1440.png`, fullPage: true })
await cont()
await pause(1200)

// Step 2: Date & Time (pre-filled defaults reviewed, kept)
await page.screenshot({ path: `${OUT}/02b-wizard-step2-datetime-1440.png` })
await cont()
await pause(1200)

// Step 3: Location
await page.getByPlaceholder('e.g. Melbourne Convention Centre').pressSequentially('The Wool Store', { delay: 28 })
await page.locator('div:has(> label:text-is("City")) input').pressSequentially('Geelong', { delay: 28 })
await page.locator('div:has(> label:text-is("State / Region")) input').pressSequentially('VIC', { delay: 28 })
await page.screenshot({ path: `${OUT}/02c-wizard-step3-location-1440.png` })
await cont()
await pause(1200)

// Step 4: Event Media (real cover upload; publish requires it)
const upStart = Date.now()
await page.locator('input[type="file"]').first().setInputFiles(COVER)
// Wait until the uploaded preview lands (a real https url, not a blob)
await page.waitForFunction(
  () => [...document.querySelectorAll('img')].some(i => /event-images|supabase/i.test(i.src)),
  { timeout: 90000 },
).catch(() => log('cover preview selector never matched; continuing on timer'))
await pause(2500)
results.timings.coverUploadMs = Date.now() - upStart
await page.screenshot({ path: `${OUT}/02d-wizard-step4-media-1440.png` })
await cont()
await pause(1200)
// If the guard said "still uploading", wait and retry once.
if (await page.getByText(/still uploading/i).count()) {
  await pause(6000)
  await cont()
  await pause(1200)
}

// Step 5: Tickets (free tier, named, capacity set)
await page.getByPlaceholder('e.g. General Admission').pressSequentially('General admission', { delay: 28 })
await page
  .locator('div:has(> label:text-matches("Capacity", "i")) input')
  .first()
  .fill('80', { timeout: 5000 })
  .catch(() => log('capacity field not fillable; leaving default'))
await page.screenshot({ path: `${OUT}/02e-wizard-step5-tickets-1440.png`, fullPage: true })
await cont()
await pause(1200)

// Step 6: Settings (defaults kept)
await page.screenshot({ path: `${OUT}/02f-wizard-step6-settings-1440.png`, fullPage: true })
await cont()
await pause(1200)

// Step 7: Review & Publish
await page.screenshot({ path: `${OUT}/02g-wizard-step7-review-1440.png`, fullPage: true })
const publishBtn = page.getByRole('button', { name: /publish and get your launch kit|^publish now$/i })
await publishBtn.waitFor({ timeout: 30000 })
const tPublishClick = Date.now()
await publishBtn.click()
log('publish clicked at', ((tPublishClick - t0) / 1000).toFixed(1), 's')

await page.waitForURL(/launch-kit/, { timeout: 120000 })
await page.waitForSelector('#launch-kit-heading', { timeout: 60000 })
const tKit = Date.now()
results.timings.wizardStartToPublishClickMs = tPublishClick - t0
results.timings.publishToKitRenderedMs = tKit - tPublishClick
results.timings.totalStartToKitMs = tKit - t0
log('KIT RENDERED. total', ((tKit - t0) / 1000).toFixed(1), 's')

// ── 4. Launch Kit screen ────────────────────────────────────────────────────
await page.waitForTimeout(3500) // reveals + images settle
await page.screenshot({ path: `${OUT}/03-launch-kit-full-1440.png`, fullPage: true })
const kitUrl = page.url()
const eventId = kitUrl.match(/events\/([0-9a-f-]{36})\/launch-kit/)?.[1]
const liveHref = await page.locator('a:has-text("Open your live page")').getAttribute('href')
results.checks.eventId = eventId
results.checks.liveEventUrl = liveHref
log('event id', eventId, 'live url', liveHref)

// ── 5. Reach panel ──────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard/events/${eventId}/reach`, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/04-reach-panel-1440.png`, fullPage: true })

// ── 6. Poster PDF + OG invitation card (authed request context) ─────────────
try {
  const poster = await ctx.request.get(`${BASE}/api/organiser/events/${eventId}/poster`, { timeout: 90000 })
  results.checks.posterStatus = poster.status()
  if (poster.ok()) fs.writeFileSync(`${OUT}/05-poster-a4.pdf`, await poster.body())
  log('poster status', poster.status())
} catch (e) {
  results.checks.posterStatus = String(e)
}
try {
  const og = await ctx.request.get(`${liveHref}/opengraph-image`, { timeout: 90000 })
  results.checks.ogStatus = og.status()
  if (og.ok()) fs.writeFileSync(`${OUT}/06-invitation-card-og.png`, await og.body())
  log('og status', og.status())
} catch (e) {
  results.checks.ogStatus = String(e)
}

// ── 7. Public event page (cross-promotion check: requirement 6) ─────────────
await page.goto(liveHref, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/07a-event-page-top-1440.png` })
await page.screenshot({ path: `${OUT}/07b-event-page-full-1440.png`, fullPage: true })
const bodyText = await page.textContent('body')
results.checks.eventPageMentionsOtherEvents = /you might also like|related|more events|similar/i.test(bodyText)

// ── 8. Seat map builder (the room studio) ───────────────────────────────────
try {
  await page.goto(`${BASE}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/08a-venues-list-1440.png`, fullPage: true })
  const mapsLink = page.locator('a[href*="seat-maps"]').first()
  if (await mapsLink.count()) {
    await mapsLink.click()
    await page.waitForURL(/seat-maps/, { timeout: 30000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/08b-seat-charts-list-1440.png`, fullPage: true })
    const openBuilder = page.getByRole('button', { name: /edit chart|new seating chart|build your first chart/i }).first()
    if (await openBuilder.count()) {
      await openBuilder.click()
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/08c-seat-builder-1440.png`, fullPage: true })
      results.checks.seatBuilderOpened = true
    }
  } else {
    results.checks.seatBuilderOpened = 'no venue with seat-maps link'
  }
} catch (e) {
  results.checks.seatBuilderOpened = String(e)
}

// ── 9. Mobile 390 pass (same session) ───────────────────────────────────────
const state = await ctx.storageState()
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
const mp = await mctx.newPage()
const mshot = async (url, name, fullPage = false) => {
  try {
    await mp.goto(url, { waitUntil: 'load', timeout: 90000 })
    await mp.waitForTimeout(2500)
    await mp.screenshot({ path: `${OUT}/${name}`, fullPage })
  } catch (e) {
    log('mobile shot failed', name, String(e))
  }
}
await mshot(kitUrl, '03-launch-kit-full-390.png', true)
await mshot(`${BASE}/dashboard/events/${eventId}/reach`, '04-reach-panel-390.png', true)
await mshot(`${BASE}/dashboard/events/create`, '02a-wizard-step1-basic-390.png', true)
await mshot(liveHref, '07a-event-page-top-390.png')
await mctx.close()

fs.writeFileSync(`${OUT}/drive-results.json`, JSON.stringify(results, null, 2))
log('DONE', JSON.stringify(results))
await browser.close()
