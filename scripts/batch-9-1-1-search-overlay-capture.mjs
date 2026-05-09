// Capture the 9.1.1 search overlay open state with one suggestion highlighted
// (ArrowDown pressed once). Output sits next to the regular AFTER captures.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT  = 'docs/redesign/batch-9-1-1-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
await page.waitForTimeout(900)
// Scroll to State B so the desktop search pill is interactive.
await page.evaluate(() => window.scrollTo(0, 700))
await page.waitForTimeout(450)
// Open via the global "/" shortcut.
await page.keyboard.press('/')
await page.waitForTimeout(450)

// Baseline: overlay open, no ArrowDown press. Visually identical to 9.1's
// overlay in the same state (9.1 had no Arrow handler so this is the
// equivalent "before" snapshot for the keyboard-nav comparison).
const noHighlight = `${OUT}/search-overlay-1440-no-highlight.png`
await page.screenshot({ path: noHighlight, fullPage: false })
console.log(`ok ${noHighlight} ${(statSync(noHighlight).size / 1024).toFixed(1)}KB`)

// Now press ArrowDown to demonstrate the 9.1.1 keyboard highlight on the
// first suggestion.
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(150)

const file = `${OUT}/search-overlay-1440-keyboard-highlight.png`
await page.screenshot({ path: file, fullPage: false })
console.log(`ok ${file} ${(statSync(file).size / 1024).toFixed(1)}KB`)
await browser.close()
