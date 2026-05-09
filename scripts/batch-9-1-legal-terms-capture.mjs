// One-shot capture for /legal/terms at 1440 (no-hero State B verification).
import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3007'
const OUT  = 'docs/redesign/batch-9-1-evidence/screenshots/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

await page.goto(`${BASE}/legal/terms`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
await page.waitForTimeout(700)

const top = `${OUT}/legal-terms-1440-top.png`
await page.screenshot({ path: top, fullPage: false })
console.log(`top    ${top} ${statSync(top).size} bytes`)

await page.evaluate(() => window.scrollTo(0, 600))
await page.waitForTimeout(450)
const scr = `${OUT}/legal-terms-1440-scrolled.png`
await page.screenshot({ path: scr, fullPage: false })
console.log(`scroll ${scr} ${statSync(scr).size} bytes`)

await browser.close()
