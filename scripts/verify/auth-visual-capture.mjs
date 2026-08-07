/**
 * PHASE 7.5: screenshot every auth page at 390 and 1440.
 *
 * Run once per tree state with a label, then compare the sets. The design lock
 * says nothing may move except the provider button, so the comparison must show
 * pixel-identical pages everywhere else.
 *
 * Usage: node scripts/verify/auth-visual-capture.mjs <label> [baseUrl]
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const LABEL = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:3132'
if (!LABEL) {
  console.error('usage: node scripts/verify/auth-visual-capture.mjs <label> [baseUrl]')
  process.exit(1)
}

const OUT = `docs/hardening/auth/visual/${LABEL}`
mkdirSync(OUT, { recursive: true })

const PAGES = [
  ['login', '/login'],
  ['signup', '/signup'],
  ['signup-organiser', '/signup?role=organiser'],
  ['forgot-password', '/forgot-password'],
  ['verify-email-sent', '/verify-email-sent?email=someone%40example.com'],
  ['reset-password', '/auth/reset-password'],
]

const VIEWPORTS = [
  ['1440', { width: 1440, height: 1000 }],
  ['390', { width: 390, height: 844 }],
]

const browser = await chromium.launch()
try {
  for (const [vpName, viewport] of VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      // Headless audits see the final state from first paint, so motion never
      // changes a capture. Same posture the rest of the proof harness uses.
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    for (const [name, path] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      // The reset page settles into its "validating" or "link failed" state on
      // a timer; wait past it so the capture is deterministic.
      await page.waitForTimeout(path.includes('reset-password') ? 5000 : 900)
      await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: true })
      console.log(`  captured ${name} @ ${vpName}`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(`\ncaptures written to ${OUT}\n`)
