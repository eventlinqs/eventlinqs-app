// Homepage QA: screenshots at 4 viewports + axe-core audit.
// Usage: node scripts/home-qa.mjs [baseUrl]
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:3100'
const OUT = 'qa/home-rebuild'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-375', width: 375, height: 812 },
]

const browser = await chromium.launch()
let axeReported = false

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(800)

  // Above-the-fold capture
  await page.screenshot({ path: `${OUT}/${vp.name}-fold.png` })
  // Full page capture
  await page.screenshot({ path: `${OUT}/${vp.name}-full.png`, fullPage: true })

  if (!axeReported) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const violations = results.violations
    console.log(`\n=== axe-core (${vp.name}) ===`)
    console.log(`violations: ${violations.length}`)
    for (const v of violations) {
      console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      for (const n of v.nodes.slice(0, 3)) {
        console.log(`    ${n.target.join(' ')}`)
      }
    }
    axeReported = true
  }

  await ctx.close()
  console.log(`captured ${vp.name}`)
}

await browser.close()
console.log('\nDONE. Screenshots in', OUT)
