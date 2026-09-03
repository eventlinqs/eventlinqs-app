/**
 * CAPTURE EVIDENCE: full-page screenshots of real pages at the three viewports
 * the completion law names (390, 768, 1440), into an evidence directory.
 *
 * The brief for the Scope v5 completion build (3 September 2026) says a green
 * unit test is not evidence and a driven flow is, and that every item's driven
 * proof lives under C:\dev\EVIDENCE\<item-id>\ at 390, 768 and 1440. Fifty
 * one-off capture scripts already sit in scripts/, each hard-coding its own
 * pages and paths. This is the one that takes them as arguments so the next
 * item does not need a fifty-second.
 *
 * It PRINTS HOW MUCH IT DID and exits non-zero on zero captures or any failed
 * navigation, per the steps-declare-work ruling.
 *
 * Usage:
 *   node scripts/verify/capture-evidence.mjs --out C:\dev\EVIDENCE\A1 \
 *     --page home=https://www.eventlinqs.com.au/ \
 *     --page events=https://www.eventlinqs.com.au/events \
 *     [--viewports 390,768,1440] [--header x-vercel-ip-country=NZ] [--no-full-page]
 *
 * Each --page is name=url. Files land as <out>/<name>-<width>.png.
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const pages = []
const headers = {}
let out = null
let viewports = [390, 768, 1440]
let fullPage = true
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--out') out = args[++i]
  else if (a === '--page') {
    const v = args[++i]
    const eq = v.indexOf('=')
    if (eq < 0) {
      console.error(`FAIL: --page wants name=url, got ${v}`)
      process.exit(1)
    }
    pages.push({ name: v.slice(0, eq), url: v.slice(eq + 1) })
  } else if (a === '--viewports') viewports = args[++i].split(',').map((n) => Number(n))
  else if (a === '--header') {
    const v = args[++i]
    const eq = v.indexOf('=')
    headers[v.slice(0, eq)] = v.slice(eq + 1)
  } else if (a === '--no-full-page') fullPage = false
}
if (!out || pages.length === 0) {
  console.error('FAIL: --out and at least one --page name=url are required')
  process.exit(1)
}
if (!existsSync(out)) mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
let captured = 0
let failed = 0
for (const width of viewports) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: 1,
    userAgent: `Mozilla/5.0 eventlinqs-evidence capture-evidence ${width}`,
    extraHTTPHeaders: headers,
  })
  const page = await context.newPage()
  for (const p of pages) {
    const file = join(out, `${p.name}-${width}.png`)
    try {
      const res = await page.goto(p.url, { waitUntil: 'networkidle', timeout: 90000 })
      const status = res ? res.status() : 0
      // Let lazy imagery and reveals settle so the capture is the final state.
      await page.waitForTimeout(800)
      await page.screenshot({ path: file, fullPage })
      captured += 1
      console.log(`  ${String(status).padEnd(4)} ${String(width).padStart(4)}  ${p.name}  ${file}`)
      if (status >= 400) failed += 1
    } catch (err) {
      failed += 1
      console.error(`  FAIL ${String(width).padStart(4)}  ${p.name}  ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  await context.close()
}
await browser.close()
console.log(`capture-evidence: ${captured} screenshots across ${viewports.length} viewports and ${pages.length} pages, ${failed} failed`)
if (captured === 0 || failed > 0) process.exit(1)
