import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
const url = process.argv[2]
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, extraHTTPHeaders: { Cookie: 'el-audit=1' } })
const page = await context.newPage()
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(3000)
const r = await new AxeBuilder({ page }).analyze()
console.log(`${url}\n${r.violations.length} violation type(s)`)
for (const v of r.violations) {
  console.log(`\n${v.impact}  ${v.id}  x${v.nodes.length}\n  ${v.help}`)
  for (const n of v.nodes.slice(0, 4)) {
    console.log(`    target: ${n.target.join(' ')}`)
    console.log(`    html:   ${n.html.replace(/\s+/g, ' ').slice(0, 200)}`)
    console.log(`    why:    ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220)}`)
  }
}
await browser.close()
