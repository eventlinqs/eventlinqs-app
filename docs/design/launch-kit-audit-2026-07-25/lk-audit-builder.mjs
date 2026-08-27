/**
 * Launch Kit audit follow-up: capture the seat map builder (room studio).
 * Creates one venue on TEST via the staging UI, opens the chart builder,
 * draws a rows block and a standing area, captures 1440 + 390.
 */
import { chromium } from 'playwright'
import _fs from 'node:fs'

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



const BASE = process.argv[2] ?? 'https://eventlinqs-staging.vercel.app'
const OUT = 'docs/design/launch-kit-audit-2026-07-25'
const EMAIL = requireEnv('EL_DRIVE_EMAIL')
const PASSWORD = requireEnv('EL_DRIVE_PASSWORD')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

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

await page.goto(`${BASE}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(1500)

// Create a venue if none exists yet.
if (!(await page.locator('a[href*="seat-maps"]').count())) {
  await page.getByRole('button', { name: /add venue|new venue/i }).first().click()
  await page.waitForTimeout(800)
  await page.getByPlaceholder('e.g. Melbourne Convention Centre').fill('The Wool Store')
  await page.locator('div:has(> label:text-is("City")) input').fill('Geelong')
  await page.locator('div:has(> label:text-is("State / Province")) input').fill('VIC')
  await page.getByRole('button', { name: /save|create/i }).last().click()
  await page.waitForTimeout(3000)
  log('venue created')
}

const mapsLink = page.locator('a[href*="seat-maps"]').first()
await mapsLink.waitFor({ timeout: 15000 })
await mapsLink.click()
await page.waitForURL(/seat-maps/, { timeout: 30000 })
await page.waitForTimeout(1500)

await page.getByRole('button', { name: /new seating chart|build your first chart/i }).first().click()
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/08c-seat-builder-empty-1440.png`, fullPage: true })

// Draw the room: a rows block and a standing area.
await page.getByRole('button', { name: /\+ Rows/i }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /\+ Standing area/i }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/08d-seat-builder-drawn-1440.png`, fullPage: true })
log('builder captured at 1440')

// Mobile view of the same builder state.
const state = await ctx.storageState()
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
const mp = await mctx.newPage()
await mp.goto(page.url(), { waitUntil: 'load', timeout: 90000 })
await mp.waitForTimeout(2000)
const openBtn = mp.getByRole('button', { name: /new seating chart|build your first chart|edit chart/i }).first()
if (await openBtn.count()) {
  await openBtn.click()
  await mp.waitForTimeout(2000)
}
await mp.screenshot({ path: `${OUT}/08e-seat-builder-390.png`, fullPage: true })
log('builder captured at 390')

await browser.close()
