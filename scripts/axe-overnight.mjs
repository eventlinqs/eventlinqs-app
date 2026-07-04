// Overnight platform-wide axe-core WCAG 2.0/2.1 A/AA scan against the deployed
// preview. Writes to its own dir so the prior session's surface-6 evidence is
// untouched. Runs under the el-audit=1 cookie (motion + hover wash disabled,
// matching the audit profile). Discovers a live event-detail slug at runtime.
//
// Usage: node scripts/axe-overnight.mjs [BASE]
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = (
  process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app'
).replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/overnight-elevation/axe'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const viewports = [
  ['mobile', { width: 412, height: 823 }],
  ['desktop', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })

// Discover a live event-detail slug from /events.
let eventDetail = null
try {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(BASE + '/events', { waitUntil: 'networkidle', timeout: 60_000 })
  const href = await page
    .locator('a[href^="/events/"]:not([href="/events"])')
    .first()
    .getAttribute('href')
  if (href) eventDetail = href
  await ctx.close()
} catch {}

const PAGES = [
  '/', '/events', '/organisers', '/pricing', '/help', '/about', '/careers',
  '/press', '/legal/terms', '/legal/privacy', '/legal/refunds',
  '/city/sydney', '/city/sydney/inner-west', '/community/african',
  '/communities', '/cities', '/login', '/signup',
]
if (eventDetail) PAGES.push(eventDetail)

let totalSerious = 0
const summary = []
for (const path of PAGES) {
  for (const [vpName, vp] of viewports) {
    const context = await browser.newContext({
      viewport: vp,
      extraHTTPHeaders: { Cookie: 'el-audit=1' },
    })
    const page = await context.newPage()
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(600)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const violations = results.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })),
      }))
      const slug = path.replace(/[/?=&]/g, '_') || '_root'
      writeFileSync(`${OUT}/${slug}-${vpName}.json`, JSON.stringify({ url: results.url, violations }, null, 2), 'utf8')
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length
      totalSerious += serious
      summary.push(`[${path} ${vpName}] violations=${violations.length} serious/critical=${serious}`)
      for (const v of violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        console.log(`[${path} ${vpName}] [${v.impact}] ${v.id}: ${v.help}`)
        for (const n of v.nodes.slice(0, 4)) console.log(`     ${JSON.stringify(n.target)}`)
      }
    } catch (e) {
      summary.push(`[${path} ${vpName}] ERROR ${e.message?.slice(0, 80)}`)
    }
    await context.close()
  }
}
await browser.close()
console.log('\n' + summary.join('\n'))
console.log(`\nTOTAL serious/critical platform-wide: ${totalSerious}`)
process.exit(totalSerious > 0 ? 1 : 0)
