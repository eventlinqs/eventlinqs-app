#!/usr/bin/env node
// Batch 4 screenshot capture - audit before / after sweeps for the visual quality gate.
//
// Usage:
//   node scripts/batch-4-screenshot.mjs before
//   node scripts/batch-4-screenshot.mjs after
//
// Captures every public page in groups A/B/C at viewports 1440 and 375 to
// docs/redesign/batch-4-evidence/<phase>/ as `<slug>-<viewport>.png` (full page).

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'

const phase = process.argv[2]
if (phase !== 'before' && phase !== 'after') {
  console.error('Usage: node scripts/batch-4-screenshot.mjs <before|after>')
  process.exit(1)
}

const BASE = process.env.BATCH4_BASE ?? 'http://localhost:3001'
const OUT = path.join(process.cwd(), 'docs', 'redesign', 'batch-4-evidence', phase)

const PAGES = [
  // Group A: homepage
  { slug: 'home', path: '/' },
  // Group B: catalogue + city + categories + event detail
  { slug: 'events', path: '/events' },
  { slug: 'events-browse-sydney', path: '/events/browse/sydney' },
  { slug: 'events-browse-melbourne', path: '/events/browse/melbourne' },
  { slug: 'events-browse-brisbane', path: '/events/browse/brisbane' },
  { slug: 'categories-owambe', path: '/categories/owambe' },
  { slug: 'categories-bollywood', path: '/categories/bollywood' },
  { slug: 'categories-afrobeats', path: '/categories/afrobeats' },
  { slug: 'event-detail-sample', path: '/events/afrobeats-melbourne-summer-sessions' },
  // Group C: marketing + legal
  { slug: 'pricing', path: '/pricing' },
  { slug: 'about', path: '/about' },
  { slug: 'organisers', path: '/organisers' },
  { slug: 'blog', path: '/blog' },
  { slug: 'press', path: '/press' },
  { slug: 'help', path: '/help' },
  { slug: 'help-getting-started', path: '/help/getting-started' },
  { slug: 'contact', path: '/contact' },
  { slug: 'legal-terms', path: '/legal/terms' },
  { slug: 'legal-privacy', path: '/legal/privacy' },
  { slug: 'legal-cookies', path: '/legal/cookies' },
  { slug: 'legal-organiser-terms', path: '/legal/organiser-terms' },
  { slug: 'legal-accessibility', path: '/legal/accessibility' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
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
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 45000 })
      // small settle for hydration / images
      await page.waitForTimeout(800)
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

await browser.close()

const summary = path.join(OUT, '_summary.json')
await fs.writeFile(summary, JSON.stringify({ phase, base: BASE, when: new Date().toISOString(), results }, null, 2))
console.log(`\nCaptured ${results.filter(r => r.ok).length}/${results.length} screenshots`)
console.log(`Summary: ${summary}`)

const failed = results.filter(r => !r.ok)
if (failed.length) {
  console.log('\nFailures:')
  for (const f of failed) console.log(`  ${f.viewport} ${f.slug}: ${f.err}`)
}
