/**
 * Measure a surface the Lighthouse gate structurally CANNOT reach: one that is
 * a client STATE of a URL rather than a URL of its own. The launch reveal is
 * the case in point - it is what /launch becomes after the composer runs, so a
 * URL-driven audit only ever sees the form.
 *
 * Reports the same three deterministic signals the gate asserts, gathered the
 * same way the browser would score them:
 *   accessibility - axe-core serious/critical violations (Lighthouse's own
 *                   accessibility category is an axe run plus a weighting)
 *   CLS           - the layout-shift PerformanceEntries, before AND after the
 *                   interaction, so a shift caused by the reveal is separated
 *                   from one caused by the load
 *   script bytes  - encoded script bytes over the whole session
 *
 * Prints what it did at each step, so a probe that clicked nothing cannot read
 * as a clean result.
 *
 * Usage: node tmp-state-surface-probe.mjs <urlOfTheComposer>
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const url = process.argv[2]
if (!url) { console.error('usage: node tmp-state-surface-probe.mjs <url>'); process.exit(1) }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { Cookie: 'el-audit=1' },
})
const page = await context.newPage()

let scriptBytes = 0
let scriptReqs = 0
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
const kinds = new Map()
cdp.on('Network.requestWillBeSent', (e) => kinds.set(e.requestId, e.type))
cdp.on('Network.loadingFinished', (e) => {
  if (kinds.get(e.requestId) === 'Script') { scriptBytes += e.encodedDataLength; scriptReqs += 1 }
})

await page.addInitScript(() => {
  window.__cls = 0
  window.__shifts = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      window.__cls += e.value
      window.__shifts.push({
        value: e.value,
        at: Math.round(e.startTime),
        nodes: (e.sources || []).slice(0, 3).map((sc) => ({
          tag: sc.node ? sc.node.tagName : null,
          cls: sc.node && sc.node.className ? String(sc.node.className).slice(0, 70) : null,
          from: sc.previousRect ? [Math.round(sc.previousRect.y), Math.round(sc.previousRect.height)] : null,
          to: sc.currentRect ? [Math.round(sc.currentRect.y), Math.round(sc.currentRect.height)] : null,
        })),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
})

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(4000)
const clsBefore = await page.evaluate(() => window.__cls ?? -1)
if (clsBefore < 0) throw new Error('layout-shift observer never installed - probe is measuring nothing')
const bytesBefore = scriptBytes

const axeBefore = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
const seriousBefore = axeBefore.violations.filter((v) => ['serious', 'critical'].includes(v.impact))

console.log(`composer state:  CLS ${clsBefore.toFixed(4)}  script ${scriptBytes} across ${scriptReqs} req`)
console.log(`  axe violations: ${axeBefore.violations.length} total, ${seriousBefore.length} serious/critical`)
for (const v of axeBefore.violations) console.log(`    ${v.impact}  ${v.id}  x${v.nodes.length}  ${v.nodes[0]?.target?.join(' ')?.slice(0, 90)}`)

// Drive the composer into the reveal. "or fill it in yourself" is the path that
// needs no typed sentence; it still returns a real kit rather than a blank form.
const trigger = page.getByRole('button', { name: /fill it in yourself/i })
const count = await trigger.count()
console.log(`\nreveal trigger found: ${count}`)
if (count === 0) { await browser.close(); process.exit(1) }
await trigger.first().click()

// The reveal is what replaces the composer. Wait for it by content, not by time.
try {
  await page.waitForFunction(() => !document.body.innerText.includes('or fill it in yourself'), { timeout: 45000 })
} catch {
  console.log('  reveal did not replace the composer within 45s')
}
await page.waitForTimeout(6000)

const clsAfter = await page.evaluate(() => window.__cls)
const heading = await page.evaluate(() => document.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 80))
console.log(`\nreveal state:    CLS ${clsAfter.toFixed(4)} (interaction added ${(clsAfter - clsBefore).toFixed(4)})  script ${scriptBytes} across ${scriptReqs} req (interaction added ${scriptBytes - bytesBefore})`)
console.log(`  first heading now: ${heading}`)

const axeAfter = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
const seriousAfter = axeAfter.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
console.log(`  axe violations: ${axeAfter.violations.length} total, ${seriousAfter.length} serious/critical`)
const shifts = await page.evaluate(() => window.__shifts)
console.log(`
  ${shifts.length} layout-shift entr(ies), largest first:`)
for (const sh of shifts.sort((a, b) => b.value - a.value).slice(0, 5)) {
  console.log(`    ${sh.value.toFixed(4)} at ${sh.at}ms`)
  for (const n of sh.nodes) console.log(`       <${n.tag}> ${n.cls} y ${n.from?.[0]} -> ${n.to?.[0]}, h ${n.from?.[1]} -> ${n.to?.[1]}`)
}
for (const v of axeAfter.violations) console.log(`    ${v.impact}  ${v.id}  x${v.nodes.length}  ${v.nodes[0]?.target?.join(' ')?.slice(0, 90)}`)

await browser.close()
