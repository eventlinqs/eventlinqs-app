// Batch 11.1 D3.4-3.9 - Nav / CTA / auth / organiser / search / picker.
//
// Each sub-section emits a structured JSON report into
// docs/redesign/batch-11.1-evidence/ and writes one line to stdout per
// assertion. Any FAIL exits non-zero at the end.
//
// 3.4 Nav: every link in header + footer + mobile bottom nav clickable
//          and HTTP 200.
// 3.5 CTAs: homepage hero CTAs, event card hrefs, city/culture tile
//          hrefs all resolve.
// 3.6 Auth (option b): /login, /signup, /forgot-password render with
//          a form and a submit input.
// 3.7 Organiser (option b): /dashboard, /dashboard/events,
//          /dashboard/events/create return either 200 (authed mode) or
//          302/307 to /login (correct unauthed redirect).
// 3.8 Search: /api/search?q=... returns sensible results for "festival",
//          "African", "Sydney"; empty state returns 200 for missing
//          term.
// 3.9 Picker: open picker on desktop + mobile, search 'Geelong',
//          'London' (no-match expected), 'Sydney'.
import { chromium } from 'playwright'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3007'
const OUT_DIR = 'docs/redesign/batch-11.1-evidence'
const SHOT_DIR = `${OUT_DIR}/screenshots`
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })

const report = { generatedAt: new Date().toISOString(), base: BASE, sections: {} }
const failures = []
function record(section, label, ok, detail) {
  if (!report.sections[section]) report.sections[section] = []
  report.sections[section].push({ label, ok, detail })
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  ${tag.padEnd(4)} [${section}] ${label}${detail ? ' | ' + detail : ''}`)
  if (!ok) failures.push({ section, label, detail })
}

async function status(path) {
  try {
    const r = await fetch(BASE + path, { redirect: 'manual' })
    return r.status
  } catch {
    return 0
  }
}

const browser = await chromium.launch({ headless: true })

// ===== 3.4 Nav links (header + footer + mobile bottom nav) =====
{
  console.log('\n[3.4] Nav links audit')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOT_DIR}/nav-desktop-1440-top.png`, clip: { x: 0, y: 0, width: 1440, height: 120 } })

  const headerLinks = await page.$$eval('header a[href]', els => els.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 40) })))
  for (const l of headerLinks) {
    if (!l.href || l.href.startsWith('#') || l.href.startsWith('mailto') || l.href.startsWith('tel')) continue
    const dest = l.href.startsWith('http') ? l.href : BASE + l.href
    if (!dest.startsWith(BASE)) continue
    const s = await status(l.href)
    record('3.4-header', `${l.text || '(no text)'} -> ${l.href}`, s >= 200 && s < 400, `HTTP ${s}`)
  }

  // Scroll to footer to render it.
  await page.evaluate(() => window.scrollTo({ top: 100000, behavior: 'instant' }))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOT_DIR}/nav-desktop-1440-footer.png`, clip: { x: 0, y: 0, width: 1440, height: 700 }, fullPage: false })
  const footerLinks = await page.$$eval('footer a[href]', els => els.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 40) })))
  for (const l of footerLinks) {
    if (!l.href || l.href.startsWith('#') || l.href.startsWith('mailto') || l.href.startsWith('tel') || l.href.startsWith('http')) continue
    const s = await status(l.href)
    record('3.4-footer', `${l.text || '(no text)'} -> ${l.href}`, s >= 200 && s < 400, `HTTP ${s}`)
  }
  await ctx.close()

  // Mobile bottom nav
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pageM = await ctxM.newPage()
  await pageM.goto(BASE + '/', { waitUntil: 'networkidle' })
  await pageM.waitForTimeout(500)
  await pageM.screenshot({ path: `${SHOT_DIR}/nav-mobile-390-top.png`, clip: { x: 0, y: 0, width: 390, height: 120 } })
  // bottom nav region
  await pageM.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }))
  await pageM.waitForTimeout(300)
  await pageM.screenshot({ path: `${SHOT_DIR}/nav-mobile-390-bottom.png`, clip: { x: 0, y: 720, width: 390, height: 124 } })
  const bottomNavLinks = await pageM.$$eval('nav[aria-label*="bottom" i] a[href], nav[aria-label*="primary" i] a[href]', els => els.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 30) })))
  for (const l of bottomNavLinks.slice(0, 12)) {
    if (!l.href || l.href.startsWith('#')) continue
    const s = await status(l.href)
    record('3.4-mobile-bottom-nav', `${l.text || '(no text)'} -> ${l.href}`, s >= 200 && s < 400, `HTTP ${s}`)
  }
  await ctxM.close()
}

// ===== 3.5 CTA audit =====
{
  console.log('\n[3.5] CTA audit')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  // Click each carousel dot, capture the Get tickets CTA href.
  for (let i = 1; i <= 5; i++) {
    await page.click(`button[role="tab"][aria-label^="Slide ${i}:"]`).catch(() => {})
    await page.waitForTimeout(600)
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(a => a.textContent?.trim() === 'Get tickets')
      return a?.getAttribute('href') || null
    })
    if (!href) {
      record('3.5-hero-cta', `slot ${i}`, false, 'no Get tickets href found')
      continue
    }
    const s = await status(href)
    record('3.5-hero-cta', `slot ${i} -> ${href}`, s === 200, `HTTP ${s}`)
  }
  // Sample event card hrefs
  const eventCardHrefs = await page.$$eval('a[href^="/events/"]:not([href*="?"])', els => els.slice(0, 6).map(a => a.getAttribute('href')))
  for (const h of eventCardHrefs) {
    if (!h) continue
    const s = await status(h)
    record('3.5-event-card', h, s === 200, `HTTP ${s}`)
  }
  // City tile + culture tile hrefs
  const tileHrefs = await page.$$eval('a[href^="/city/"], a[href^="/culture/"]', els => Array.from(new Set(els.map(a => a.getAttribute('href')))).slice(0, 12))
  for (const h of tileHrefs) {
    if (!h) continue
    const s = await status(h)
    record('3.5-tile', h, s === 200, `HTTP ${s}`)
  }
  await ctx.close()
}

// ===== 3.6 Auth smoke (option b: forms render) =====
{
  console.log('\n[3.6] Auth smoke (option b: form render)')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  for (const path of ['/login', '/signup', '/forgot-password']) {
    const resp = await page.goto(BASE + path, { waitUntil: 'networkidle' })
    const hasForm = await page.$('form')
    const hasEmailInput = await page.$('input[type="email"], input[name="email"]')
    const hasSubmit = await page.$('button[type="submit"], input[type="submit"]')
    const ok = (resp?.status() ?? 0) === 200 && !!hasForm && !!hasEmailInput && !!hasSubmit
    record('3.6-auth-form', path, ok, `HTTP ${resp?.status()} form=${!!hasForm} email=${!!hasEmailInput} submit=${!!hasSubmit}`)
  }
  await ctx.close()
}

// ===== 3.7 Organiser dashboard (option b: render + auth redirect) =====
{
  console.log('\n[3.7] Organiser dashboard (option b: render + auth redirect)')
  // Unauthed: each protected route should redirect to /login.
  for (const path of ['/dashboard', '/dashboard/events', '/dashboard/events/create']) {
    const r = await fetch(BASE + path, { redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    // Acceptable: 200 (if no auth wall yet), 302/307 to /login.
    const ok =
      r.status === 200 ||
      ((r.status === 302 || r.status === 307) && loc.includes('/login'))
    record('3.7-dashboard', path, ok, `HTTP ${r.status}${loc ? ' -> ' + loc.slice(0, 60) : ''}`)
  }
}

// ===== 3.8 Global search smoke =====
{
  console.log('\n[3.8] Global search smoke')
  // The search endpoint isn't necessarily exposed at /api/search/...
  // The header search trigger opens an overlay (Cmd+K style). Smoke-
  // test by opening the overlay and checking that typing a query
  // surfaces at least one event card.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  // Scroll a bit so the State B search pill is visible (header switches to State B on scroll).
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }))
  await page.waitForTimeout(300)
  const searchTrigger = await page.$('button[aria-label*="Search"], button[aria-label*="search"]')
  if (!searchTrigger) {
    record('3.8-search', 'header search trigger present', false, 'no search button found in header')
  } else {
    await searchTrigger.click().catch(() => {})
    await page.waitForTimeout(400)
    const queries = ['festival', 'African', 'Sydney']
    for (const q of queries) {
      const input = await page.$('input[placeholder*="Search" i], input[type="search"]')
      if (!input) {
        record('3.8-search', `query "${q}"`, false, 'no search input visible after opening overlay')
        break
      }
      await input.fill(q)
      await page.waitForTimeout(700)
      const hits = await page.$$eval('[role="dialog"] a, [role="dialog"] li', els => els.length)
      record('3.8-search', `query "${q}"`, hits > 0, `${hits} results`)
    }
  }
  await ctx.close()
}

// ===== 3.9 Picker functionality =====
{
  console.log('\n[3.9] Picker functionality')
  for (const [viewport, label] of [[{ width: 1440, height: 900 }, 'desktop-1440'], [{ width: 390, height: 844 }, 'mobile-390']]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    // The picker trigger lives on desktop in the header; mobile lives in the hamburger sheet.
    if (label === 'mobile-390') {
      // Open hamburger first
      await page.click('button[aria-label*="Open navigation"], button[aria-label*="Open menu"]').catch(() => {})
      await page.waitForTimeout(900)
    }
    // Multiple "Change location" triggers exist (desktop + mobile-inline).
    // Pick the first one that's actually visible.
    const triggers = await page.$$('button[aria-label*="Change location"]')
    let opened = false
    for (const t of triggers) {
      const visible = await t.isVisible().catch(() => false)
      if (!visible) continue
      try { await t.click(); opened = true; break } catch {}
    }
    if (!opened) {
      record('3.9-picker', `${label} open`, false, 'could not open picker')
      await ctx.close()
      continue
    }
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOT_DIR}/picker-${label}-open.png` })
    // Geelong, London (negative), Sydney
    for (const [q, expectMatch] of [['Geelong', true], ['London', false], ['Sydney', true], ['Toowoomba', true], ['Sunshine Coast', true]]) {
      await page.fill('input#location-search', q)
      await page.waitForTimeout(250)
      const matches = await page.$$eval('[role="dialog"] li button', els => els.map(el => el.textContent?.trim()))
      const has = matches.some(m => m?.includes(q.split(' ')[0]))
      const ok = expectMatch ? has : !has
      record('3.9-picker', `${label} search "${q}"`, ok, `expected ${expectMatch ? 'match' : 'no match'}, got ${has ? 'match' : 'no match'}`)
    }
    await ctx.close()
  }
}

await browser.close()

writeFileSync(`${OUT_DIR}/d3-4-to-9-report.json`, JSON.stringify(report, null, 2))

console.log(`\n=== D3.4-3.9 Summary ===`)
console.log(`Total failures: ${failures.length}`)
if (failures.length > 0) {
  for (const f of failures) console.log(`  [${f.section}] ${f.label} | ${f.detail || ''}`)
  process.exit(2)
}
console.log('All assertions PASS.')
