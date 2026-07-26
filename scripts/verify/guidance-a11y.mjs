/**
 * Accessibility proof for the guidance work.
 *
 * Two halves, because axe alone does not prove what the brief asks for:
 *  A. axe-core WCAG 2 A/AA on the guide hub, a guide page, and the buyer seat
 *     map in each guidance state (coach open, help panel open), at 390 + 1440.
 *  B. A keyboard drive: reach the help launcher by Tab alone, open it with the
 *     keyboard, confirm focus lands inside the panel, close with Escape, and
 *     confirm focus returns to the launcher rather than the top of the page.
 *     Also asserts every guidance control carries an accessible name.
 *
 * Usage: node scripts/verify/guidance-a11y.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const OUT = 'docs/design/guidance-2026-07-26'
fs.mkdirSync(OUT, { recursive: true })

const SEATED_SLUG = 'seat-proof-price-bands-vezwrk'
const VIEWPORTS = [
  ['mobile-390', { width: 390, height: 844 }],
  ['desktop-1440', { width: 1440, height: 900 }],
]

const browser = await chromium.launch()
const findings = []
let serious = 0

async function runAxe(page, name) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  serious += bad.length
  findings.push({
    surface: name,
    violations: results.violations.length,
    seriousOrCritical: bad.length,
    detail: bad.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
  })
  console.log(
    `${bad.length === 0 ? 'OK  ' : 'FAIL'} ${name}: ${results.violations.length} total, ${bad.length} serious/critical`,
  )
}

// ── A. axe across the guidance surfaces ─────────────────────────────────────
for (const [label, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/guides`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('#guide-search', { timeout: 30000 })
  await runAxe(page, `guides-hub ${label}`)

  await page.fill('#guide-search', 'zzzznotathing')
  await page.waitForTimeout(500)
  await runAxe(page, `guides-hub-empty-search ${label}`)

  await page.goto(`${BASE}/guides/getting-paid-and-payout-timing`, {
    waitUntil: 'load',
    timeout: 90000,
  })
  await page.waitForTimeout(800)
  await runAxe(page, `guide-page ${label}`)

  // The buyer seat map with first-run coaching showing.
  await page.goto(`${BASE}/events/${SEATED_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('[data-testid="seat-selector"]', { timeout: 45000 })
  await page.waitForTimeout(2500)
  await runAxe(page, `seat-map-coach-open ${label}`)

  // The same surface with the help panel open.
  await page.click('button[aria-label*="Close this guide"]')
  await page.waitForTimeout(400)
  await page.click('button[aria-label^="Open help"]')
  await page.waitForTimeout(700)
  await runAxe(page, `seat-map-help-panel ${label}`)

  await ctx.close()
}

// ── B. the keyboard drive ───────────────────────────────────────────────────
const keyboard = []
function check(name, pass, detail = '') {
  keyboard.push({ name, pass, detail })
  console.log(`${pass ? 'OK  ' : 'FAIL'} keyboard: ${name}${detail ? ` (${detail})` : ''}`)
  if (!pass) serious += 1
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${SEATED_SLUG}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('[data-testid="seat-selector"]', { timeout: 45000 })
  await page.waitForTimeout(2500)

  // Every control inside the coach has an accessible name.
  const coachControls = await page.$$eval('[role="dialog"][aria-modal="false"] button', els =>
    els.map(el => ({
      text: (el.textContent ?? '').trim(),
      label: el.getAttribute('aria-label') ?? '',
    })),
  )
  check(
    'every coach control has an accessible name',
    coachControls.length > 0 && coachControls.every(c => c.text.length > 0 || c.label.length > 0),
    `${coachControls.length} controls`,
  )

  // The coach is announced as a dialog and does NOT trap focus.
  const coachRole = await page.getAttribute('[role="dialog"][aria-modal="false"]', 'aria-modal')
  check('coach announces as a non-trapping dialog', coachRole === 'false', `aria-modal=${coachRole}`)

  // Escape closes the coach from inside it.
  await page.focus('[role="dialog"][aria-modal="false"]')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  check('Escape closes the coach', (await page.$('[role="dialog"][aria-modal="false"]')) === null)

  // The launcher is reachable by Tab alone, from the top of the document.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.keyboard.press('Tab')
  let reached = false
  for (let i = 0; i < 300; i++) {
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    if (label.startsWith('Open help')) {
      reached = true
      break
    }
    await page.keyboard.press('Tab')
  }
  check('help launcher is reachable by Tab alone', reached)

  if (reached) {
    // Enter opens the panel and focus moves INTO it.
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    const focusInPanel = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"][aria-modal="false"]')
      return Boolean(panel && (panel === document.activeElement || panel.contains(document.activeElement)))
    })
    check('opening with the keyboard moves focus into the panel', focusInPanel)

    // Every control in the panel has an accessible name.
    const panelControls = await page.$$eval('[role="dialog"][aria-modal="false"] button, [role="dialog"][aria-modal="false"] a', els =>
      els.map(el => ({
        text: (el.textContent ?? '').trim(),
        label: el.getAttribute('aria-label') ?? '',
      })),
    )
    check(
      'every help-panel control has an accessible name',
      panelControls.length > 0 && panelControls.every(c => c.text.length > 0 || c.label.length > 0),
      `${panelControls.length} controls`,
    )

    // Escape closes it and returns focus to the launcher, not the document top.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const backOnLauncher = await page.evaluate(() =>
      (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('Open help'),
    )
    check('Escape returns focus to the launcher', backOnLauncher)
  }

  await ctx.close()
}

await browser.close()

fs.writeFileSync(
  `${OUT}/a11y-results.json`,
  JSON.stringify({ base: BASE, axe: findings, keyboard, seriousOrCritical: serious }, null, 2),
)

console.log(`\nTOTAL serious/critical issues: ${serious}`)
if (serious > 0) process.exitCode = 1
