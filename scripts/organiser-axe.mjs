// Organiser rebuild - axe-core WCAG 2.0/2.1 A/AA scan on /organisers at
// mobile + desktop against the production server (npm run start, :3000).
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:3000'
const OUT = 'docs/benchmark/system-pass/surface-6/rebuild-2026-06-07/axe'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const viewports = [
  ['mobile', { width: 412, height: 823 }],
  ['desktop', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })
let totalSerious = 0
for (const [vpName, vp] of viewports) {
  const context = await browser.newContext({ viewport: vp, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
  const page = await context.newPage()
  await page.goto(BASE + '/organisers', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(800)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = results.violations.map(v => ({
    id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.map(n => ({ target: n.target, html: n.html?.slice(0, 160) })),
  }))
  writeFileSync(`${OUT}/organisers-${vpName}.json`, JSON.stringify({ url: results.url, violations, passCount: results.passes.length }, null, 2), 'utf8')
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical').length
  totalSerious += serious
  console.log(`[${vpName}] violations=${violations.length} serious/critical=${serious} passes=${results.passes.length}`)
  for (const v of violations) console.log(`   - [${v.impact}] ${v.id}: ${v.help}`)
  await context.close()
}
await browser.close()
console.log(`\nTOTAL serious/critical across viewports: ${totalSerious}`)
process.exit(0)
