#!/usr/bin/env node
// Batch 5 screenshot capture - community page audit at 1440 + 375.
//
// Usage:
//   node scripts/batch-5-screenshot.mjs after
//
// Captures every /community/[slug] page (14 pages) plus a verification
// pass on the legacy /categories/[slug] redirects (those should land
// on /community/* with a 301).

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'

const phase = process.argv[2] ?? 'after'
if (phase !== 'before' && phase !== 'after') {
  console.error('Usage: node scripts/batch-5-screenshot.mjs <before|after>')
  process.exit(1)
}

const BASE = process.env.BATCH5_BASE ?? 'http://localhost:3001'
const OUT = path.join(process.cwd(), 'docs', 'redesign', 'batch-5-evidence', phase)

const PAGES = [
  // 10 Tier 1 communities
  { slug: 'community-african',         path: '/community/african' },
  { slug: 'community-south-asian',     path: '/community/south-asian' },
  { slug: 'community-caribbean',       path: '/community/caribbean' },
  { slug: 'community-latin',           path: '/community/latin' },
  { slug: 'community-east-asian',      path: '/community/east-asian' },
  { slug: 'community-filipino',        path: '/community/filipino' },
  { slug: 'community-mediterranean',   path: '/community/mediterranean' },
  { slug: 'community-middle-eastern',  path: '/community/middle-eastern' },
  { slug: 'community-european',        path: '/community/european' },
  { slug: 'community-pacific',         path: '/community/pacific' },
  // 4 Tier 2 cross-community verticals
  { slug: 'community-gospel',   path: '/community/gospel' },
  { slug: 'community-comedy',   path: '/community/comedy' },
  { slug: 'community-wellness', path: '/community/wellness' },
  { slug: 'community-pride',    path: '/community/pride' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

await fs.mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

const results = []
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    userAgent: vp.name === '375'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  })
  const page = await ctx.newPage()
  for (const p of PAGES) {
    const file = path.join(OUT, `${p.slug}-${vp.name}.png`)
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(900)
      await page.screenshot({ path: file, fullPage: true })
      results.push({ slug: p.slug, viewport: vp.name, ok: true })
      console.log(`OK  ${vp.name} ${p.path} -> ${file}`)
    } catch (e) {
      results.push({ slug: p.slug, viewport: vp.name, ok: false, err: e.message })
      console.error(`ERR ${vp.name} ${p.path}: ${e.message}`)
    }
  }
  await ctx.close()
}

// Redirect verification: the legacy /categories/* slugs that map to
// new community pages should 301 to /community/*. We hit them with
// followRedirects=true and record the final URL alongside the screenshot.
const redirectChecks = [
  { from: '/categories/afrobeats',                 expected: '/community/african' },
  { from: '/categories/amapiano',                  expected: '/community/african' },
  { from: '/categories/owambe',                    expected: '/community/african' },
  { from: '/categories/heritage-and-independence', expected: '/community/african' },
  { from: '/categories/caribbean',                 expected: '/community/caribbean' },
  { from: '/categories/gospel',                    expected: '/community/gospel' },
]

const redirectResults = []
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
for (const r of redirectChecks) {
  try {
    const res = await page.goto(`${BASE}${r.from}`, { waitUntil: 'networkidle', timeout: 30000 })
    const finalUrl = page.url()
    const ok = finalUrl.endsWith(r.expected)
    redirectResults.push({ from: r.from, expected: r.expected, final: finalUrl, status: res?.status() ?? 0, ok })
    console.log(`${ok ? 'OK ' : 'ERR'} REDIR ${r.from} -> ${finalUrl}`)
  } catch (e) {
    redirectResults.push({ from: r.from, expected: r.expected, ok: false, err: e.message })
    console.error(`ERR REDIR ${r.from}: ${e.message}`)
  }
}
await ctx.close()

await browser.close()

const summary = path.join(OUT, '_summary.json')
await fs.writeFile(summary, JSON.stringify({
  phase,
  base: BASE,
  when: new Date().toISOString(),
  results,
  redirectResults,
}, null, 2))

const passed = results.filter(r => r.ok).length
const total = results.length
console.log(`\nCaptured ${passed}/${total} screenshots`)
console.log(`Redirect checks: ${redirectResults.filter(r => r.ok).length}/${redirectResults.length}`)
console.log(`Summary: ${summary}`)

const failed = results.filter(r => !r.ok)
if (failed.length) {
  console.log('\nFailures:')
  for (const f of failed) console.log(`  ${f.viewport} ${f.slug}: ${f.err}`)
}
