/**
 * Phase C capture drive, part 1: C1 before/after, three proof charts in the
 * room studio (50 / 500 / 2000 seats, curve, underlay), builder aesthetics,
 * and the C5 Magic Start latency comparison (staging single-pass vs preview
 * two-pass). Writes only to the TEST database via the deployed UIs and to
 * docs/design/phase-c-2026-07-25/.
 * Usage: node pc-drive-1.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BEFORE = 'https://eventlinqs-staging.vercel.app' // pre-change build
const AFTER =
  'https://eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app' // this build
const OUT = 'docs/design/phase-c-2026-07-25'
fs.mkdirSync(OUT, { recursive: true })
const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'
const EVENT_PATH = '/events/winter-warmers-geelong-comedy-gala-vkmxcg'
const COVER = 'public/images/hero/comedy.jpg'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const results = { c1: {}, charts: [], latency: { before: [], after: [] } }

const browser = await chromium.launch()

async function shoot(page, name, fullPage = true) {
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/${name}`, fullPage })
  log('shot', name)
}

// ── 1. C1 before and after ──────────────────────────────────────────────────
for (const [envName, base, tag] of [
  ['before', BEFORE, 'c1-before'],
  ['after', AFTER, 'c1-after'],
]) {
  for (const [w, h, vp] of [[1440, 900, '1440'], [390, 844, '390']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const p = await ctx.newPage()
    await p.goto(`${base}${EVENT_PATH}`, { waitUntil: 'load', timeout: 90000 })
    await p.waitForTimeout(3000)
    await p.screenshot({ path: `${OUT}/${tag}-event-page-${vp}.png`, fullPage: true })
    if (vp === '1440') {
      const body = await p.textContent('body')
      results.c1[envName] = {
        mentionsAlsoLike: /also like/i.test(body ?? ''),
        mentionsRelated: /related/i.test(body ?? ''),
      }
    }
    await ctx.close()
  }
}
log('C1 evidence:', JSON.stringify(results.c1))

// ── 2. Login on the preview ─────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${AFTER}/login`, { waitUntil: 'load', timeout: 90000 })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await Promise.all([
  page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])
log('login ok on preview')

// ── 3. The room studio: three proof charts ──────────────────────────────────
async function openBuilder() {
  await page.goto(`${AFTER}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
  await page.locator('a[href*="seat-maps"]').first().click()
  await page.waitForURL(/seat-maps/, { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /new seating chart/i }).first().click()
  await page.waitForTimeout(1500)
}

async function setRowsConfig(rows, perRow) {
  await page.getByLabel('Rows', { exact: true }).fill(String(rows))
  await page.getByLabel(/Seats per row/).fill(String(perRow))
  await page.waitForTimeout(900)
}

async function saveChart(name) {
  await page.getByLabel('Seating chart name').fill(name)
  await page.getByRole('button', { name: /save seating chart/i }).click()
  await page.waitForTimeout(2500)
  results.charts.push(name)
  log('chart saved:', name)
  await page.getByRole('button', { name: /^close$/i }).click().catch(() => {})
  await page.waitForTimeout(1000)
}

try {
  // Chart 1: the empty invitation, then 50 seats.
  await openBuilder()
  await shoot(page, 'builder-empty-invitation-1440.png', false)
  await page.getByRole('button', { name: /lay rows/i }).click()
  await page.waitForTimeout(800)
  await setRowsConfig(5, 10)
  await shoot(page, 'builder-density-50-1440.png', false)
  await saveChart('Proof 50')

  // Chart 2: 500 seats, curved, with the tracing underlay demonstrated.
  await openBuilder()
  await page.getByRole('button', { name: /lay rows/i }).click()
  await page.waitForTimeout(800)
  await setRowsConfig(20, 25)
  await page
    .locator('input[type="range"][aria-label*="Row curve"]')
    .fill('48')
  await page.waitForTimeout(900)
  await shoot(page, 'builder-density-500-curved-1440.png', false)
  // The underlay: trace a real image, prove the aid, then remove it so the
  // saved chart is clean.
  await page.locator('input[type="file"][aria-label*="floor plan"]').setInputFiles(COVER)
  await page.waitForTimeout(1200)
  await shoot(page, 'builder-underlay-tracing-1440.png', false)
  await page.getByRole('button', { name: /remove the floor plan underlay/i }).click()
  await page.waitForTimeout(500)
  await saveChart('Proof 500 Curved')

  // Chart 3: 2000 seats.
  await openBuilder()
  await page.getByRole('button', { name: /lay rows/i }).click()
  await page.waitForTimeout(800)
  await setRowsConfig(40, 50)
  await page.waitForTimeout(1500)
  await shoot(page, 'builder-density-2000-1440.png', false)
  await saveChart('Proof 2000')

  // Builder at 390.
  const state = await ctx.storageState()
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
  const mp = await mctx.newPage()
  await mp.goto(`${AFTER}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
  await mp.locator('a[href*="seat-maps"]').first().click()
  await mp.waitForURL(/seat-maps/, { timeout: 30000 })
  await mp.waitForTimeout(1200)
  await mp.getByRole('button', { name: /edit chart/i }).first().click()
  await mp.waitForTimeout(2000)
  await mp.screenshot({ path: `${OUT}/builder-390.png`, fullPage: true })
  await mctx.close()
} catch (e) {
  log('builder section failed:', String(e))
  results.builderError = String(e)
}

// ── 4. C5 latency: Magic Start, staging single-pass vs preview two-pass ─────
async function timeMagicStart(base, label) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await c.newPage()
  await p.goto(`${base}/login`, { waitUntil: 'load', timeout: 90000 })
  await p.fill('input[type="email"]', EMAIL)
  await p.fill('input[type="password"]', PASSWORD)
  await Promise.all([
    p.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
    p.click('button[type="submit"]'),
  ])
  for (let run = 0; run < 2; run++) {
    await p.goto(`${base}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
    await p.waitForSelector('text=Magic Start', { timeout: 30000 })
    await p
      .locator('textarea')
      .first()
      .fill(
        'Free acoustic night called Latency Proof at The Wool Store in Geelong on 12 September 2026 at 7pm, free entry, 60 seats',
      )
    const t0 = Date.now()
    await p.getByRole('button', { name: 'Build my event' }).click()
    try {
      await p.waitForFunction(
        () => {
          const el = document.querySelector('input[placeholder*="Summer Music Festival"]')
          return el && el.value.length > 3
        },
        { timeout: 120000 },
      )
      const ms = Date.now() - t0
      results.latency[label].push(ms)
      log(`magic start ${label} run ${run + 1}: ${ms}ms`)
    } catch (e) {
      results.latency[label].push(null)
      log(`magic start ${label} run ${run + 1} FAILED:`, String(e).slice(0, 120))
    }
  }
  await c.close()
}

await timeMagicStart(BEFORE, 'before')
await timeMagicStart(AFTER, 'after')

fs.writeFileSync(`${OUT}/drive-1-results.json`, JSON.stringify(results, null, 2))
log('DONE', JSON.stringify(results))
await browser.close()
