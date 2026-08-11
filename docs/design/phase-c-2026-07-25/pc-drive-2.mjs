/**
 * Phase C capture drive, part 2: seated proof events on the preview build,
 * buyer-map captures at 50 / 500-curved / 2000 seats, the orphan nudge, the
 * server best-available pick, the price filter (paid two-tier attempt with
 * an honest fallback), and the kit room preview. TEST database only.
 * Usage: node pc-drive-2.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

// CREDENTIALS COME FROM THE ENVIRONMENT, NEVER FROM THIS FILE.
// GitGuardian flagged a plaintext account password committed to this
// repository on 2026-08-08. It was hardcoded in 11 committed automation
// scripts and reproduced into 3 security documents. A drive script is not a
// safe place for a credential: it is committed, it is pushed, and it is
// indexed. Fail closed rather than fall back to a literal.
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[drive] ${name} is not set. Export it for this shell; it is deliberately not in the repo.`)
    process.exit(2)
  }
  return v
}



const BASE =
  'https://eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/design/phase-c-2026-07-25'
fs.mkdirSync(OUT, { recursive: true })
const EMAIL = requireEnv('EL_DRIVE_EMAIL')
const PASSWORD = requireEnv('EL_DRIVE_PASSWORD')
const COVER = 'public/images/hero/comedy.jpg'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const results = { events: {}, checks: {} }

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

const cont = () => page.getByRole('button', { name: /^Continue$/ }).click()

/** Create one published seated event bound to a named chart. */
async function createSeatedEvent(title, chartName, tiers) {
  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
  const titleInput = page.locator('input[placeholder*="Summer Music Festival"]')
  await titleInput.waitFor({ timeout: 60000 })
  await titleInput.fill(title)
  const categoryValue = await page.evaluate(() => {
    const sel = document.querySelector('select')
    if (!sel) return null
    const opts = [...sel.options]
    const pick = opts.find(o => /comed|music/i.test(o.text)) ?? opts[1]
    return pick ? pick.value : null
  })
  if (categoryValue) await page.locator('select').first().selectOption(categoryValue)
  await cont() // -> dates (defaults)
  await page.waitForTimeout(700)
  await cont() // -> location
  await page.waitForTimeout(700)
  await page.getByPlaceholder('e.g. Melbourne Convention Centre').fill('The Wool Store')
  await page.locator('div:has(> label:text-is("City")) input').fill('Geelong')
  await cont() // -> media
  await page.waitForTimeout(700)
  await page.locator('input[type="file"]').first().setInputFiles(COVER)
  await page.waitForFunction(
    () => [...document.querySelectorAll('img')].some(i => /event-images|supabase/i.test(i.src)),
    { timeout: 90000 },
  ).catch(() => {})
  await page.waitForTimeout(2500)
  await cont() // -> tickets
  await page.waitForTimeout(700)
  if (await page.getByText(/still uploading/i).count()) {
    await page.waitForTimeout(6000)
    await cont()
    await page.waitForTimeout(700)
  }
  // Tiers: fill the first, add more if asked.
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    if (i > 0) {
      await page.getByRole('button', { name: /add.*tier/i }).click()
      await page.waitForTimeout(400)
    }
    const nameInputs = page.getByPlaceholder('e.g. General Admission')
    await nameInputs.nth(i).fill(t.name)
    if (t.price > 0) {
      const priceInputs = page.locator('input[type="number"][step="0.01"], input[type="number"][min="0"][step]')
      await page
        .locator('div:has(> h4:text-is("Ticket Tier ' + (i + 1) + '")) input[type="number"]')
        .first()
        .fill(String(t.price))
        .catch(async () => {
          await priceInputs.nth(i).fill(String(t.price)).catch(() => {})
        })
    }
  }
  await cont() // -> settings
  await page.waitForTimeout(700)
  // Reserved seating: the one switch on this step.
  await page.getByRole('switch').click()
  await page.waitForTimeout(700)
  const selects = page.locator('select')
  await selects.first().selectOption({ label: 'The Wool Store' })
  await page.waitForTimeout(900)
  await selects.nth(1).selectOption({ label: new RegExp(chartName) }).catch(async () => {
    // selectOption with regex label unsupported: resolve value by text.
    const value = await page.evaluate(name => {
      const sels = [...document.querySelectorAll('select')]
      const sel = sels[1]
      const opt = [...sel.options].find(o => o.text.includes(name))
      return opt ? opt.value : null
    }, chartName)
    if (value) await selects.nth(1).selectOption(value)
  })
  await page.waitForTimeout(900)
  await cont() // -> review
  await page.waitForTimeout(1200)
  const publish = page.getByRole('button', { name: /publish and get your launch kit|^publish now$/i })
  await publish.waitFor({ timeout: 30000 })
  await publish.click()
  try {
    await page.waitForURL(/launch-kit/, { timeout: 120000 })
  } catch {
    const err = await page.textContent('body')
    log('PUBLISH BLOCKED for', title, (err ?? '').match(/stripe|identity|connect[^.]*/i)?.[0] ?? 'unknown')
    return null
  }
  const eventId = page.url().match(/events\/([0-9a-f-]{36})\/launch-kit/)?.[1]
  const liveHref = await page.locator('a:has-text("Open your live page")').getAttribute('href')
  results.events[title] = { eventId, liveHref }
  log('published:', title, liveHref)
  return { eventId, liveHref }
}

const ev50 = await createSeatedEvent('Seat Proof Fifty', 'Proof 50', [
  { name: 'General admission', price: 0 },
])
const ev500 = await createSeatedEvent('Seat Proof Five Hundred', 'Proof 500 Curved', [
  { name: 'General admission', price: 0 },
])
const ev2000 = await createSeatedEvent('Seat Proof Two Thousand', 'Proof 2000', [
  { name: 'General admission', price: 0 },
])

// ── Buyer map captures ─────────────────────────────────────────────────────
async function mapShot(p, name) {
  const map = p.locator('div.relative:has(> div > svg[aria-label="Seat map"])').first()
  await map.scrollIntoViewIfNeeded()
  await p.waitForTimeout(1500)
  await map.screenshot({ path: `${OUT}/${name}` })
  log('shot', name)
}

if (ev50) {
  await page.goto(ev50.liveHref, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2500)
  await mapShot(page, 'buyer-density-50-1440.png')
  // The orphan nudge: take seat A2 so A1 is stranded.
  await page.locator('[aria-label^="A seat 2,"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/buyer-orphan-nudge-1440.png`, fullPage: true })
  results.checks.nudgeShown = (await page.getByText(/stranded/i).count()) > 0
  // One tap fixes it through the server cascade.
  await page.getByRole('button', { name: /sit us together/i }).click()
  await page.waitForTimeout(2500)
  await mapShot(page, 'buyer-best-available-after-nudge-1440.png')
  results.checks.nudgeGoneAfterFix = (await page.getByText(/stranded/i).count()) === 0
}

if (ev500) {
  await page.goto(ev500.liveHref, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2500)
  await mapShot(page, 'buyer-density-500-curved-1440.png')
  await page.getByRole('button', { name: '4', exact: true }).click()
  await page.waitForTimeout(2500)
  await mapShot(page, 'buyer-best-available-4-curved-1440.png')
}

if (ev2000) {
  await page.goto(ev2000.liveHref, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(3000)
  await mapShot(page, 'buyer-density-2000-1440.png')
  // Kit room preview: one signature language (R46).
  await page.goto(`${BASE}/dashboard/events/${ev2000.eventId}/launch-kit`, {
    waitUntil: 'load',
    timeout: 90000,
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/kit-room-preview-2000-1440.png`, fullPage: true })
}

// ── The price filter: a paid two-tier seated event, honest fallback scan ───
let filterCaptured = false
try {
  const evPaid = await createSeatedEvent('Seat Proof Two Prices', 'Proof 500 Curved', [
    { name: 'A Reserve', price: 59 },
    { name: 'B Reserve', price: 39 },
  ])
  if (evPaid) {
    await page.goto(evPaid.liveHref, { waitUntil: 'load', timeout: 90000 })
    await page.waitForTimeout(2500)
    if ((await page.getByRole('group', { name: /filter seats by price/i }).count()) > 0) {
      await page.screenshot({ path: `${OUT}/buyer-price-filter-all-1440.png`, fullPage: true })
      await page.getByRole('group', { name: /filter seats by price/i }).getByRole('button').nth(1).click()
      await page.waitForTimeout(1200)
      await mapShot(page, 'buyer-price-filter-active-1440.png')
      filterCaptured = true
    }
  }
} catch (e) {
  log('paid filter attempt failed:', String(e).slice(0, 160))
}
results.checks.priceFilterCaptured = filterCaptured

// ── Mobile 390 pass ────────────────────────────────────────────────────────
const state = await ctx.storageState()
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
const mp = await mctx.newPage()
for (const [ev, name] of [
  [ev50, 'buyer-density-50-390.png'],
  [ev500, 'buyer-density-500-curved-390.png'],
  [ev2000, 'buyer-density-2000-390.png'],
]) {
  if (!ev) continue
  try {
    await mp.goto(ev.liveHref, { waitUntil: 'load', timeout: 90000 })
    await mp.waitForTimeout(2500)
    const map = mp.locator('div.relative:has(> div > svg[aria-label="Seat map"])').first()
    await map.scrollIntoViewIfNeeded()
    await mp.waitForTimeout(1200)
    await map.screenshot({ path: `${OUT}/${name}` })
    log('shot', name)
  } catch (e) {
    log('mobile shot failed', name, String(e).slice(0, 120))
  }
}
await mctx.close()

fs.writeFileSync(`${OUT}/drive-2-results.json`, JSON.stringify(results, null, 2))
log('DONE', JSON.stringify(results))
await browser.close()
