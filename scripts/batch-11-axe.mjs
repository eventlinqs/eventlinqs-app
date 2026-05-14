// Batch 11 - axe-core 0-violation audit on 5 routes × 2 viewports.
// Founder-authorised localhost verification against the production
// build at http://localhost:3007 (`npm run build` + `next start -p 3007`).
//
// Result: one JSON per route+viewport written to
// docs/redesign/batch-11-evidence/axe/{label}-{viewport}.json plus a
// short stdout summary table.
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/axe'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const routes = [
  ['home',             '/'],
  ['events',           '/events'],
  ['culture-african',  '/culture/african'],
  ['city-sydney',      '/city/sydney'],
  ['event-detail',     '/events/diwali-festival-melbourne-festival-of-lights'],
]
const viewports = [
  ['mobile',  { width: 412, height: 823 }],
  ['desktop', { width: 1440, height: 900 }],
]

const summary = []

const browser = await chromium.launch({ headless: true })
for (const [label, path] of routes) {
  for (const [vpName, vp] of viewports) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const url = BASE + path
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
      // Wait an extra beat so client islands hydrate before scanning.
      await page.waitForTimeout(800)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const slim = {
        url: results.url,
        timestamp: results.timestamp,
        violations: results.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map(n => ({ target: n.target, html: n.html?.slice(0, 200) })),
        })),
        passCount: results.passes.length,
        incompleteCount: results.incomplete.length,
        inapplicableCount: results.inapplicable.length,
      }
      writeFileSync(`${OUT}/${label}-${vpName}.json`, JSON.stringify(slim, null, 2), 'utf8')
      const violationCount = slim.violations.length
      const verdict = violationCount === 0 ? 'PASS' : `FAIL (${violationCount})`
      summary.push([label, vpName, verdict, violationCount])
      console.log(`  ${label.padEnd(20)} ${vpName.padEnd(8)} -> ${verdict}`)
      if (violationCount > 0) {
        for (const v of slim.violations) {
          console.log(`    - [${v.impact}] ${v.id}: ${v.help}`)
        }
      }
    } catch (e) {
      console.log(`  ${label} ${vpName} ERROR: ${e.message?.slice(0, 100)}`)
      summary.push([label, vpName, 'ERROR', -1])
    }
    await context.close()
  }
}
await browser.close()

console.log('\n=== Summary ===')
for (const [l, v, verdict] of summary) {
  console.log(`  ${l.padEnd(20)} ${v.padEnd(8)} -> ${verdict}`)
}
const failing = summary.filter(s => s[3] > 0).length
const errored = summary.filter(s => s[3] === -1).length
console.log(`\n${summary.length - failing - errored} of ${summary.length} clean. (${failing} failing, ${errored} errored)`)
