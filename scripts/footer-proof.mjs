// Footer proof: at 390 expand each accordion and assert the OTHER sections above
// it do NOT move (the grid-coupling bug is gone); capture each state. Desktop
// resize captures at 1440/1280/1024 prove static, stable columns.
// Output -> docs/benchmark/system-pass/footer-organisers/.
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/footer-organisers'
mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TITLES = ['Discover', 'Communities', 'For organisers', 'Company']

async function clamp(p) {
  const m = await sharp(p).metadata()
  if (Math.max(m.width, m.height) > 1800) {
    await sharp(p).resize({ width: m.width >= m.height ? 1800 : null, height: m.height > m.width ? 1800 : null }).png().toFile(p + '.tmp.png')
    const fs = await import('node:fs'); fs.renameSync(p + '.tmp.png', p)
  }
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
const summary = { base: BASE, mobile: { pass: true, checks: [] }, desktop: {} }

// ---- MOBILE 390: expand each accordion, assert sections ABOVE unchanged ----
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  // The mobile footer is in the md:hidden block; only its buttons are visible at 390.
  const btn = (t) => page.locator('footer button[aria-controls]', { hasText: t }).first()
  await btn('Discover').scrollIntoViewIfNeeded({ timeout: 8000 })
  await page.waitForTimeout(400)

  const tops = async () => {
    const o = {}
    for (const t of TITLES) o[t] = (await btn(t).boundingBox())?.y ?? null
    return o
  }
  // Verify single-column stacked layout: each button strictly below the previous, same x.
  const boxes = {}
  for (const t of TITLES) boxes[t] = await btn(t).boundingBox()
  const xs = TITLES.map(t => Math.round(boxes[t].x))
  const stacked = TITLES.slice(1).every((t, i) => boxes[t].y > boxes[TITLES[i]].y) && new Set(xs).size === 1
  summary.mobile.stackedSingleColumn = stacked
  if (!stacked) summary.mobile.pass = false

  for (let i = 0; i < TITLES.length; i++) {
    const before = await tops()
    await btn(TITLES[i]).click()
    await page.waitForTimeout(500) // height transition
    const after = await tops()
    // Sections ABOVE the expanded one must not move (delta 0). Below may shift down (correct flow).
    const movedAbove = []
    for (let j = 0; j < i; j++) {
      const d = Math.abs((after[TITLES[j]] ?? 0) - (before[TITLES[j]] ?? 0))
      if (d > 1) movedAbove.push({ section: TITLES[j], delta: Math.round(d) })
    }
    const expandedPanel = await page.locator(`#${await btn(TITLES[i]).getAttribute('aria-controls')}`).boundingBox().catch(() => null)
    summary.mobile.checks.push({ expanded: TITLES[i], aboveMoved: movedAbove, panelHeight: expandedPanel ? Math.round(expandedPanel.height) : null })
    if (movedAbove.length) summary.mobile.pass = false
    // capture the expanded state
    await btn(TITLES[i]).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const f = `${OUT}/footer-390-${i}-${TITLES[i].replace(/\s+/g, '-')}.png`
    await page.screenshot({ path: f, clip: { x: 0, y: Math.max(0, (await btn('Discover').boundingBox()).y - 20), width: 390, height: 760 } })
    await clamp(f)
    await btn(TITLES[i]).click() // collapse to reset
    await page.waitForTimeout(450)
  }
  await ctx.close()
}

// ---- DESKTOP resize: static columns at 1440 / 1280 / 1024 ----
for (const w of [1440, 1280, 1024]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1.25, userAgent: UA })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await page.locator('footer').first().scrollIntoViewIfNeeded({ timeout: 8000 })
  await page.waitForTimeout(400)
  // No accordion buttons should be visible on desktop (static columns only).
  const visibleAccordionBtns = await page.locator('footer button[aria-controls]:visible').count()
  summary.desktop[w] = { visibleAccordionButtons: visibleAccordionBtns }
  const fb = await page.locator('footer').first().boundingBox()
  const f = `${OUT}/footer-desktop-${w}.png`
  await page.screenshot({ path: f, clip: { x: 0, y: Math.max(0, fb.y), width: w, height: Math.min(700, fb.height) } })
  await clamp(f)
  await ctx.close()
}

await b.close()
writeFileSync(`${OUT}/footer-proof.json`, JSON.stringify(summary, null, 2))
console.log('MOBILE stacked single column:', summary.mobile.stackedSingleColumn)
summary.mobile.checks.forEach(c => console.log(`  expand "${c.expanded}": aboveMoved=${c.aboveMoved.length === 0 ? 'NONE' : JSON.stringify(c.aboveMoved)} panelH=${c.panelHeight}`))
console.log('DESKTOP visible accordion buttons (want 0):', Object.entries(summary.desktop).map(([w, v]) => `${w}:${v.visibleAccordionButtons}`).join(' '))
console.log(summary.mobile.pass && Object.values(summary.desktop).every(v => v.visibleAccordionButtons === 0) ? 'FOOTER PROOF: PASS' : 'FOOTER PROOF: FAIL')
process.exit(summary.mobile.pass && Object.values(summary.desktop).every(v => v.visibleAccordionButtons === 0) ? 0 : 1)
