/**
 * axe-core over the four surfaces changed by the timezone work, at both
 * viewports. Scoped deliberately: these four are what this branch touched, so
 * this is the regression check for those changes, not a platform sweep.
 *
 * Usage: node scripts/verify/axe-timezone-surfaces.mjs [BASE]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve('axe-core/axe.min.js')

const BASE = process.argv[2] ?? 'http://localhost:3300'
const OUT = 'docs/roast/timezone-walk-2026-08-09'
mkdirSync(OUT, { recursive: true })

const SURFACES = [
  { name: 'home (trending bento + surprise me)', path: '/' },
  { name: 'event detail (ticket selector)', path: '/events/afrobeats-amapiano-live-at-the-rosemount-perth' },
  { name: 'artist profile (credits)', path: '/artists/marlo-reyes-lojdor' },
]

const browser = await chromium.launch()
const results = []
let serious = 0

for (const s of SURFACES) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      locale: 'en-AU',
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.addScriptTag({ path: AXE_PATH })

    const run = await page.evaluate(async () => {
      // WCAG 2 A and AA, which is the bar the constitution sets.
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes[0]?.target?.join(' ') ?? '',
      }))
    })

    const bad = run.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    serious += bad.length
    results.push({ surface: s.name, path: s.path, width, violations: run, seriousOrCritical: bad.length })
    console.log(
      `${bad.length === 0 ? 'PASS' : 'FAIL'}  ${s.name.padEnd(38)} @${String(width).padEnd(5)} ` +
        `violations=${run.length} serious/critical=${bad.length}`,
    )
    for (const v of run) console.log(`        ${v.impact}: ${v.id} (${v.nodes}) ${v.sample.slice(0, 70)}`)
    await ctx.close()
  }
}

await browser.close()
writeFileSync(`${OUT}/axe.json`, JSON.stringify({ base: BASE, results }, null, 2))
console.log(`\nTOTAL serious/critical across ${results.length} runs: ${serious}`)
console.log(serious === 0 ? 'AXE: PASS' : 'AXE: FAIL')
process.exitCode = serious === 0 ? 0 : 1
