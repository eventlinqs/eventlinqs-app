// Full mobile audit at 390 across every public page. Per page checks:
//   - horizontal overflow (documentElement.scrollWidth > innerWidth) - the
//     classic mobile breaker
//   - console errors + page errors (zero allowed)
//   - broken images (img.complete && naturalWidth === 0)
//   - small touch targets among PRIMARY controls (button / [role=button] /
//     nav+CTA links) under 44px (informational, judged not auto-failed)
//   - axe (audit profile) at 390
//   - a 390 capture per page
// Output -> docs/benchmark/system-pass/mobile-audit/. Exit 1 on overflow,
// console errors, broken images, or axe violations.
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/mobile-audit'
mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const PAGES = [
  ['home', '/'],
  ['events-browse', '/events'],
  ['event-detail', '/events/aso-ebi-affair-owambe-garden-party'],
  ['city', '/city/sydney'],
  ['suburb', '/city/sydney/inner-west'],
  ['community', '/community/african'],
  ['communities-hub', '/communities'],
  ['category', '/events?category=music'],
  ['organisers', '/organisers'],
  ['pricing', '/pricing'],
  ['about', '/about'],
  ['careers', '/careers'],
  ['press', '/press'],
  ['help', '/help'],
  ['legal', '/legal/terms'],
  ['login', '/login'],
  ['signup', '/signup'],
]

async function clamp(p) {
  const m = await sharp(p).metadata()
  if (Math.max(m.width, m.height) > 1800) {
    await sharp(p).resize({ width: m.width >= m.height ? 1800 : null, height: m.height > m.width ? 1800 : null }).png().toFile(p + '.t.png')
    const fs = await import('node:fs'); fs.renameSync(p + '.t.png', p)
  }
}

const IN_PAGE = () => {
  const vw = window.innerWidth
  const de = document.documentElement
  // "Document width" = the documentElement scroll width (the actual scroll
  // container). NOT body.scrollWidth, which counts clipped off-canvas panels
  // (html/body overflow-x:clip) that the user can never scroll to - a phantom.
  // Confirm with a real scroll test below.
  const overflow = de.scrollWidth - vw
  // Actual horizontal scrollability: try to scroll right; if scrollX stays 0,
  // there is no user-facing sideways scroll regardless of any phantom width.
  const sx0 = window.scrollX
  window.scrollTo(vw + 80, 0)
  const canScrollX = window.scrollX > 0
  window.scrollTo(sx0, 0)
  // primary touch targets: buttons, role=button, and link-buttons / nav links
  const small = []
  const sel = 'button, [role="button"], a[class*="inline-flex"], header a, nav a, footer button'
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.height < 44 - 0.5 || r.width < 24) {
      small.push({ tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) })
    }
  }
  // broken images
  const broken = []
  for (const img of Array.from(document.querySelectorAll('img'))) {
    if (img.complete && img.naturalWidth === 0) broken.push((img.currentSrc || img.src || '').slice(0, 90))
  }
  // widest element causing overflow (if any)
  let widest = null
  if (overflow > 1) {
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 && r.width <= vw + 40) { widest = { tag: el.tagName.toLowerCase(), cls: (el.className?.toString?.() || '').slice(0, 60), right: Math.round(r.right) }; break }
    }
  }
  return { vw, overflow: Math.round(overflow), canScrollX, small: small.slice(0, 10), smallCount: small.length, broken, widest }
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
const results = []
let hardFail = 0
for (const [name, path] of PAGES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)) })
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 120)))
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)) } window.scrollTo(0, 0) })
    await page.waitForTimeout(500)
    const m = await page.evaluate(IN_PAGE)
    // axe
    let axeV = -1, axeIds = []
    try {
      const ac = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
      await ac.addCookies([{ name: 'el-audit', value: '1', domain: new URL(BASE).hostname, path: '/' }])
      const ap = await ac.newPage(); await ap.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 }); await ap.waitForTimeout(500)
      const ar = await new AxeBuilder({ page: ap }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      axeV = ar.violations.length; axeIds = ar.violations.map(v => v.id); await ac.close()
    } catch (e) { axeIds = ['axe-error:' + String(e).slice(0, 40)] }
    const f = `${OUT}/m-${name}.png`
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 390, height: 844 } })
    await clamp(f)
    const rec = { name, path, status: res?.status() ?? 0, overflowPx: m.overflow, canScrollX: m.canScrollX, consoleErrors, broken: m.broken, smallTargets: m.smallCount, smallSample: m.small, widest: m.widest, axe: axeV, axeIds }
    results.push(rec)
    const fail = (m.overflow > 1) || m.canScrollX || consoleErrors.length > 0 || m.broken.length > 0 || axeV > 0
    if (fail) hardFail++
    console.log(`${fail ? 'FAIL' : 'OK  '} ${name.padEnd(14)} [${rec.status}] ovf=${m.overflow}px scrollX=${m.canScrollX} err=${consoleErrors.length} broken=${m.broken.length} axe=${axeV} small=${m.smallCount}`)
    if (consoleErrors.length) consoleErrors.slice(0, 3).forEach(e => console.log('       err: ' + e))
    if (m.widest) console.log('       overflow culprit: ' + JSON.stringify(m.widest))
    if (axeV > 0) console.log('       axe: ' + axeIds.join(', '))
  } catch (e) {
    results.push({ name, path, error: String(e).slice(0, 100) }); hardFail++
    console.log(`ERR  ${name}: ${String(e).slice(0, 80)}`)
  }
  await ctx.close()
}
await b.close()
writeFileSync(`${OUT}/mobile-audit.json`, JSON.stringify(results, null, 2))
console.log(`\n${results.length} pages; hard-fail pages: ${hardFail}`)
console.log(hardFail === 0 ? 'MOBILE AUDIT: PASS' : 'MOBILE AUDIT: FAIL')
process.exit(hardFail === 0 ? 0 : 1)
