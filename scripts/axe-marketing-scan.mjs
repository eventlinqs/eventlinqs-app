// axe-core WCAG 2.0/2.1 A/AA scan across the marketing + legal surfaces that
// were NOT in the Lighthouse/axe gate URL list (workshop inspection MAJOR-4).
// Runs at mobile + desktop against a server (default localhost:3000).
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:3000').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/surface-6/rebuild-2026-06-07/axe/marketing'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const PAGES = ['/about', '/careers', '/press', '/legal/terms', '/legal/privacy', '/pricing']
const viewports = [
  ['mobile', { width: 412, height: 823 }],
  ['desktop', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })
let totalSerious = 0
const summary = []
for (const path of PAGES) {
  for (const [vpName, vp] of viewports) {
    const context = await browser.newContext({ viewport: vp, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
    const page = await context.newPage()
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const violations = results.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.map(n => ({ target: n.target, html: n.html?.slice(0, 200) })),
    }))
    const slug = path.replace(/\//g, '_') || '_root'
    writeFileSync(`${OUT}/${slug}-${vpName}.json`, JSON.stringify({ url: results.url, violations }, null, 2), 'utf8')
    const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical').length
    totalSerious += serious
    summary.push(`[${path} ${vpName}] violations=${violations.length} serious/critical=${serious}`)
    for (const v of violations) {
      console.log(`[${path} ${vpName}] [${v.impact}] ${v.id}: ${v.help}`)
      for (const n of v.nodes.slice(0, 6)) console.log(`     ${JSON.stringify(n.target)}  ${n.html?.slice(0, 90)}`)
    }
    await context.close()
  }
}
await browser.close()
console.log('\n' + summary.join('\n'))
console.log(`\nTOTAL serious/critical across marketing+legal: ${totalSerious}`)
process.exit(totalSerious > 0 ? 1 : 0)
