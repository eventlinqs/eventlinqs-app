/**
 * AXE OVER A LIST OF URLS, at 390 and 1440, failing on ANY violation of ANY
 * impact (the Scope v5 completion brief: "axe zero violations at every impact
 * level on affected surfaces", which is stricter than the serious/critical
 * floor the older scans used).
 *
 * WCAG 2.0 and 2.1 A and AA tags, the same set as scripts/axe-marketing-scan.mjs.
 * Bearer surfaces (a ticket, the watch page) are scanned by their full address
 * including the query string, and a request header can be added for the geo
 * gated surface. A Playwright storage state can be supplied for a signed-in
 * surface such as the organiser room.
 *
 * Usage:
 *   node scripts/verify/axe-urls.mjs --base http://localhost:3311 --out C:\dev\EVIDENCE\A2\axe \
 *     --url /events/<slug> --url "/t/<code>?k=<secret>" --url "/t/<code>/watch?k=<secret>" \
 *     [--header x-vercel-ip-country=AU] [--storage-state .auth/organiser.json]
 *
 * Prints one line per URL and viewport, writes one JSON per pair, exits 1 on
 * any violation or any navigation that is not 200.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
let base = 'http://localhost:3311'
let out = null
let storageState = null
const urls = []
const headers = {}
/*
 * THIRD-PARTY FRAMES. axe descends into iframes, so a scan of the watch page
 * reports YouTube's own player markup (aria-level on a link, prohibited ARIA
 * on the player div). That markup is not in this repository and cannot be
 * fixed from it; every site that embeds YouTube carries it. `--exclude` takes
 * a selector for such a frame so the verdict is about the surface WE ship.
 * Every exclusion is printed on the scan line, so nothing is hidden quietly.
 */
const excludes = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--base') base = args[++i].replace(/\/$/, '')
  else if (a === '--out') out = args[++i]
  else if (a === '--url') urls.push(args[++i])
  else if (a === '--storage-state') storageState = args[++i]
  else if (a === '--exclude') excludes.push(args[++i])
  else if (a === '--header') {
    const v = args[++i]
    const eq = v.indexOf('=')
    headers[v.slice(0, eq)] = v.slice(eq + 1)
  }
}
if (!out || urls.length === 0) {
  console.error('FAIL: --out and at least one --url are required')
  process.exit(1)
}
if (!existsSync(out)) mkdirSync(out, { recursive: true })

const VIEWPORTS = [
  ['390', { width: 390, height: 844 }],
  ['1440', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })
let scanned = 0
let totalViolations = 0
let failedLoads = 0
const summary = []
for (const path of urls) {
  for (const [label, viewport] of VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: headers,
      ...(storageState ? { storageState } : {}),
    })
    const page = await context.newPage()
    const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 90000 })
    const status = res ? res.status() : 0
    await page.waitForTimeout(800)
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    for (const sel of excludes) builder = builder.exclude(sel)
    const results = await builder.analyze()
    const violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })),
    }))
    const slug = path.replace(/[?].*$/, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root'
    writeFileSync(join(out, `${slug}-${label}.json`), JSON.stringify({ url: results.url, status, violations }, null, 2), 'utf8')
    scanned += 1
    totalViolations += violations.length
    if (status !== 200) failedLoads += 1
    const line = `  ${String(status).padEnd(4)} ${label.padStart(4)}  violations=${violations.length}  ${path.replace(/k=[^&]+/, 'k=***')}${
      excludes.length ? `  (excluding ${excludes.join(', ')})` : ''
    }`
    summary.push(line)
    console.log(line)
    for (const v of violations) {
      console.log(`       [${v.impact}] ${v.id}: ${v.help}`)
      for (const n of v.nodes.slice(0, 4)) console.log(`         ${JSON.stringify(n.target)}  ${n.html?.slice(0, 100)}`)
    }
    await context.close()
  }
}
await browser.close()
console.log(`axe-urls: ${scanned} scans across ${urls.length} URL(s) and ${VIEWPORTS.length} viewports, ${totalViolations} violation(s), ${failedLoads} non-200 load(s)`)
writeFileSync(join(out, 'summary.txt'), summary.join('\n') + `\n\n${scanned} scans, ${totalViolations} violations, ${failedLoads} non-200 loads\n`, 'utf8')
process.exit(totalViolations === 0 && failedLoads === 0 && scanned > 0 ? 0 : 1)
