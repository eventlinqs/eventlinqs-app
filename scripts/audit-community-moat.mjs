// Community-moat audit on the deployed preview:
//   1. Sample >=15 intersection pages (/culture/[culture]/[city]) across many
//      communities x cities by harvesting REAL rendered city links from each
//      culture landing (so every combo is valid), then verify each is HTTP 200.
//   2. axe (audit profile) on home, the /cultures hub, and 3 intersection pages
//      at desktop + mobile.
// Output -> docs/benchmark/system-pass/community-moat/audit.json. Exit 1 on any
// dead intersection or any axe violation.
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/community-moat'
mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Communities spanning the heritage order (First Nations first) + variety.
const CULTURES = [
  'aboriginal-torres-strait-islander', 'african', 'indian', 'chinese',
  'filipino', 'latin-american', 'greek', 'vietnamese', 'korean', 'italian',
]

const b = await chromium.launch({ args: ['--no-sandbox'] })
const summary = { base: BASE, intersections: { total: 0, ok: 0, dead: [], sample: [] }, axe: {} }

// ---- 1. Harvest valid intersection links from culture landings ----
const ctx = await b.newContext({ userAgent: UA })
const seen = new Set()
for (const culture of CULTURES) {
  try {
    const page = await ctx.newPage()
    const res = await page.goto(`${BASE}/culture/${culture}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (!res || res.status() >= 400) { await page.close(); continue }
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.getAttribute('href'))
        .filter(h => h && /^\/culture\/[^/]+\/[^/]+$/.test(h)))
    for (const h of hrefs) seen.add(h)
    await page.close()
  } catch {}
}
// Sample: take up to 24, ensuring spread across communities and cities.
const all = Array.from(seen)
const byCulture = {}
for (const h of all) { const c = h.split('/')[2]; (byCulture[c] ||= []).push(h) }
const sample = []
// round-robin one per culture until we have >=18
let added = true
while (added && sample.length < 24) {
  added = false
  for (const c of Object.keys(byCulture)) {
    const next = byCulture[c].find(h => !sample.includes(h))
    if (next) { sample.push(next); added = true }
    if (sample.length >= 24) break
  }
}
await ctx.close()

// ---- verify each sampled intersection is 200 ----
for (const path of sample) {
  try {
    const r = await fetch(BASE + path, { redirect: 'follow', headers: { 'user-agent': UA } })
    summary.intersections.total++
    if (r.status === 200) { summary.intersections.ok++; summary.intersections.sample.push({ path, status: 200 }) }
    else { summary.intersections.dead.push({ path, status: r.status }) }
  } catch (e) { summary.intersections.dead.push({ path, error: String(e).slice(0, 80) }) }
}
const cultures = new Set(sample.map(h => h.split('/')[2]))
const cities = new Set(sample.map(h => h.split('/')[3]))
summary.intersections.spread = { communities: cultures.size, cities: cities.size }

// ---- 2. axe on home + hub + 3 intersections, desktop + mobile ----
const axeTargets = [['home', '/'], ['hub', '/cultures'],
  ...sample.slice(0, 3).map((p, i) => [`intersection${i + 1}`, p])]
for (const [name, path] of axeTargets) {
  summary.axe[name] = {}
  for (const [vp, w, h] of [['desktop', 1440, 900], ['mobile', 412, 823]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } })
    await c.addCookies([{ name: 'el-audit', value: '1', domain: new URL(BASE).hostname, path: '/' }])
    const page = await c.newPage()
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
    await page.waitForTimeout(700)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    summary.axe[name][vp] = { violations: r.violations.length, ids: r.violations.map(v => v.id) }
    await c.close()
  }
  console.log(`axe ${name}: d=${summary.axe[name].desktop.violations} m=${summary.axe[name].mobile.violations}`)
}

await b.close()
writeFileSync(`${OUT}/audit.json`, JSON.stringify(summary, null, 2))
const axeTotal = Object.values(summary.axe).reduce((s, v) => s + v.desktop.violations + v.mobile.violations, 0)
console.log(`\nintersections: ${summary.intersections.ok}/${summary.intersections.total} ok across ${cultures.size} communities x ${cities.size} cities; dead=${summary.intersections.dead.length}`)
console.log(`axe total violations: ${axeTotal}`)
const fail = summary.intersections.dead.length > 0 || axeTotal > 0 || summary.intersections.ok < 15
console.log(fail ? 'AUDIT: FAIL' : 'AUDIT: PASS')
process.exit(fail ? 1 : 0)
