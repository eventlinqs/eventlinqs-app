// Batch 9.2.1 - authenticated homepage captures.
//
// Logs in with the seeded test user credentials, then captures the
// homepage at 1440 / 768 / 375 viewports to verify the avatar shell +
// dropdown trigger render correctly.
//
// Run AFTER `node --env-file=.env.local scripts/seed-test-user.mjs`.
// Run AFTER `PORT=3007 npx next start` is up.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const TEST_EMAIL    = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
const OUT = 'docs/redesign/batch-9-2-1-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '768',  w: 768,  h: 1024 },
  { name: '375',  w: 375,  h: 812 },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()

// Sign in once at desktop viewport.
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

// Try the most likely login form selectors.
const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first()
const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first()
const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first()

await emailInput.fill(TEST_EMAIL, { timeout: 8000 })
await passwordInput.fill(TEST_PASSWORD, { timeout: 8000 })
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {}),
  submitBtn.click({ timeout: 8000 }),
])
await page.waitForTimeout(2000)

// Verify auth: hit /account, expect non-redirect 200 + page contains "Welcome".
await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
const onAccount = page.url().includes('/account') && !page.url().includes('/login')
if (!onAccount) {
  console.log(`AUTH FAIL: not redirected to /account (currently ${page.url()})`)
  await browser.close()
  process.exit(1)
}
console.log('AUTH OK')

// Capture homepage at all 3 viewports while authenticated. Reuse the same
// context so the auth cookie carries across viewport-resize captures.
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(900)
  const file = `${OUT}/home-authenticated-${vp.name}-top.png`
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  ok ${file} (${(statSync(file).size / 1024).toFixed(1)}KB)`)
}

// Plus an open-dropdown capture at 1440.
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
await page.waitForTimeout(900)
// Scroll past the sentinel so State B engages and the avatar trigger sits in the visible header.
await page.evaluate(() => window.scrollTo(0, 700))
await page.waitForTimeout(500)
const triggerOpen = page.locator('button[aria-haspopup="menu"]').first()
await triggerOpen.click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(450)
const dropdownFile = `${OUT}/account-dropdown-open-1440.png`
await page.screenshot({ path: dropdownFile, fullPage: false })
console.log(`  ok ${dropdownFile} (${(statSync(dropdownFile).size / 1024).toFixed(1)}KB)`)

// And a closed-trigger capture for the composite.
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const triggerFile = `${OUT}/account-trigger-closed-1440.png`
await page.screenshot({ path: triggerFile, fullPage: false })
console.log(`  ok ${triggerFile} (${(statSync(triggerFile).size / 1024).toFixed(1)}KB)`)

await browser.close()
console.log('\nAuth capture pass complete.')
