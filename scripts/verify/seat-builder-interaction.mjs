/**
 * THE SEAT BUILDER, ACTUALLY EXERCISED: a real wheel and a real drag, with the
 * canvas pixels compared before and after.
 *
 * WHY THIS EXISTS SEPARATELY. The full platform audit reported "no canvas
 * element on the seat map surface" and filed zoom and pan as NOT COVERED. That
 * was the audit's fault, not the product's: it followed the first link matching
 * /seat-maps from /dashboard/venues, which lands on the seat-map LIST, and the
 * builder with its canvas only mounts once a chart is opened. Looking for a
 * canvas on the list page and concluding the renderer was broken is the same
 * shape of error as every other one this audit made about itself.
 *
 * It proves the interaction by PIXELS, not by events fired. A wheel handler that
 * runs and repaints nothing is indistinguishable from one that does not run, and
 * only the drawn output can tell them apart.
 *
 * Needs a TEST organiser session:
 *   PROOF_EMAIL=... PROOF_PASSWORD=... node scripts/verify/seat-builder-interaction.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = (process.env.AUDIT_BASE_URL ??
  'https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const EMAIL = process.env.PROOF_EMAIL
const PASSWORD = process.env.PROOF_PASSWORD

const OUT = path.resolve('docs/roast/audit-2026-08-15/shots')
mkdirSync(OUT, { recursive: true })

const notes = []
const note = (stage, verdict, detail) => {
  notes.push({ stage, verdict, detail })
  console.log(`  ${String(verdict).padEnd(12)} ${String(stage).padEnd(26)} ${detail ?? ''}`)
}

if (!EMAIL || !PASSWORD) {
  console.error('NOT COVERED: PROOF_EMAIL and PROOF_PASSWORD are required. This is not a pass.')
  process.exit(1)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
let failed = false

try {
  // Sign in.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByLabel(/email/i).first().fill(EMAIL)
  await page.getByLabel(/password/i).first().fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).first().click()
  /*
   * POLL THE URL rather than waitForURL with a predicate. The sign-in completes
   * with a client-side router.push, and waitForURL timed out against it here
   * while a plain wait-then-read saw /dashboard within a few seconds. Polling is
   * what actually observes the transition, and it reports the page's own text on
   * failure so a refusal is diagnosed rather than guessed at.
   */
  let landed = null
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(1000)
    if (!new URL(page.url()).pathname.startsWith('/login')) {
      landed = new URL(page.url()).pathname
      break
    }
  }
  if (!landed) {
    const said = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))
    note('login', 'REFUSED', `still on /login. Page says: ${said}`)
    throw new Error('login did not complete')
  }
  note('login', 'OK', landed)

  // Venues, then a venue with seat maps.
  await page.goto(`${BASE}/dashboard/venues`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(1500)
  const seatMapsHref = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .find(h => h && /\/seat-maps\/?$/.test(h)) ?? null)
  if (!seatMapsHref) {
    note('seat-map list', 'NOT FOUND', 'no /seat-maps link on /dashboard/venues')
    throw new Error('no seat-map entry point')
  }
  await page.goto(`${BASE}${seatMapsHref}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(2500)
  note('seat-map list', 'REACHED', seatMapsHref)

  /*
   * OPEN THE BUILDER. This is the step the platform audit missed: the list page
   * carries no canvas, because the canvas belongs to the builder. Try an
   * existing chart first, then fall back to creating a new one.
   */
  let opened = false
  const openers = [
    page.getByRole('link', { name: /edit|open|chart/i }).first(),
    page.getByRole('button', { name: /edit|open/i }).first(),
    page.getByRole('button', { name: /new (seating )?chart|create/i }).first(),
  ]
  for (const opener of openers) {
    if (!(await opener.isVisible().catch(() => false))) continue
    await opener.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(3000)
    if ((await page.locator('canvas').count()) > 0) { opened = true; break }
  }
  if (!opened) await page.waitForTimeout(4000)

  const canvasCount = await page.locator('canvas').count()
  if (canvasCount === 0) {
    note('canvas', 'ABSENT', 'the builder did not mount a canvas after opening a chart')
    failed = true
    throw new Error('no canvas')
  }
  note('canvas', 'PRESENT', `${canvasCount} canvas element(s)`)

  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  note('canvas size', 'MEASURED', `${Math.round(box.width)}x${Math.round(box.height)}`)

  /** A hash of the drawn pixels, so a repaint is provable rather than assumed. */
  const snap = async () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return 'none'
      try {
        const d = c.toDataURL()
        let h = 0
        for (let i = 0; i < d.length; i += 1) h = (h * 31 + d.charCodeAt(i)) | 0
        return `${h}:${d.length}`
      } catch {
        return 'tainted'
      }
    })

  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  const before = await snap()
  await page.screenshot({ path: path.join(OUT, 'seat-builder-before-1440.png') }).catch(() => {})

  /*
   * CTRL + WHEEL, which is the gesture the renderer actually binds.
   *
   * A plain wheel was tried first and reported zoom INERT. That was the test
   * being wrong, not the product: seat-canvas.tsx:8 lists the gestures as "drag
   * pan, pinch, Ctrl+wheel, double tap". A bare wheel is deliberately left to
   * scroll the PAGE, which is the correct behaviour for a canvas embedded in a
   * scrolling document, because trapping the scroll strands a reader who is only
   * trying to get past it. Asserting the wrong gesture and calling the result a
   * defect is the same error this audit has made about itself repeatedly.
   */
  await page.mouse.move(cx, cy)
  await page.keyboard.down('Control')
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(200)
  }
  await page.keyboard.up('Control')
  await page.waitForTimeout(800)
  const afterZoom = await snap()
  await page.screenshot({ path: path.join(OUT, 'seat-builder-zoom-1440.png') }).catch(() => {})

  if (afterZoom === before) {
    note('zoom', 'INERT', 'a wheel over the canvas did not change the drawn pixels')
    failed = true
  } else {
    note('zoom', 'WORKS', `pixels changed (${before.slice(0, 12)} -> ${afterZoom.slice(0, 12)})`)
  }

  // A REAL DRAG across the canvas.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(cx - i * 25, cy - i * 12)
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
  await page.waitForTimeout(800)
  const afterPan = await snap()
  await page.screenshot({ path: path.join(OUT, 'seat-builder-pan-1440.png') }).catch(() => {})

  if (afterPan === afterZoom) {
    note('pan', 'INERT', 'a drag across the canvas did not change the drawn pixels')
    failed = true
  } else {
    note('pan', 'WORKS', `pixels changed (${afterZoom.slice(0, 12)} -> ${afterPan.slice(0, 12)})`)
  }
} catch (e) {
  note('walk', 'FAILED', String(e.message).split('\n')[0])
  failed = true
}

await browser.close()

console.log('')
console.log('='.repeat(70))
console.log(failed ? 'RESULT: FAIL or NOT COVERED' : 'RESULT: PASS - zoom and pan both repaint the canvas')
console.log('='.repeat(70))
process.exit(failed ? 1 : 0)
