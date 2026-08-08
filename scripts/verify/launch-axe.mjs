// axe-core over the public composer's three states, at 1440 and 390.
//
// /launch is a brand new PUBLIC surface, so it needs its own scan: the
// marketing scan's page list predates it and the reveal cannot be reached by
// URL at all, which is exactly the kind of state a fixed URL list never covers.
//
// Usage: node scripts/verify/launch-axe.mjs <base-url>
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:3000').replace(/\/$/, '')
const OUT = 'docs/roast/launch-walk-preview-2026-08-09'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  ['1440', { width: 1440, height: 1000 }],
  ['390', { width: 390, height: 844 }],
]

const browser = await chromium.launch()
const summary = []

async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact))
  summary.push({
    surface: label,
    violations: results.violations.length,
    seriousOrCritical: serious.length,
    detail: results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  })
  console.log(
    `${label}: ${results.violations.length} violations, ${serious.length} serious/critical` +
      (results.violations.length ? ` [${results.violations.map(v => `${v.id}(${v.impact})`).join(', ')}]` : ''),
  )
}

for (const [vpName, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
  const page = await ctx.newPage()

  // State 1: the composer, before anything is typed.
  await page.goto(`${BASE}/launch`, { waitUntil: 'networkidle' })
  await scan(page, `composer@${vpName}`)

  // State 2: the reveal, which has no URL of its own.
  await page.fill('#launch-description', 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park')
  await page.waitForSelector('button:has-text("Build my kit"):not([disabled])', { timeout: 30000 })
  await page.click('button:has-text("Build my kit")')
  await page.waitForSelector('#kit-reveal-heading', { timeout: 45000 })
  await page.waitForTimeout(7000)
  await scan(page, `reveal@${vpName}`)

  // State 3: the bookmarkable kit page.
  const body = await page.innerText('main')
  const code = (body.match(/\/launch\/k\/([a-z2-9]{12})/) ?? [])[1]
  if (code) {
    await page.goto(`${BASE}/launch/k/${code}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(5000)
    await scan(page, `kitpage@${vpName}`)
  }

  await ctx.close()
}

await browser.close()
writeFileSync(`${OUT}/axe.json`, JSON.stringify({ base: BASE, summary }, null, 2))

const totalSerious = summary.reduce((n, s) => n + s.seriousOrCritical, 0)
console.log(`\nTOTAL serious/critical across ${summary.length} scans: ${totalSerious}`)
process.exit(totalSerious === 0 ? 0 : 1)
