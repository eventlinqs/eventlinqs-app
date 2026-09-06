/**
 * C14 RUBRIC MEASUREMENT, per URL, per viewport (390, 768, 1440), per colour
 * scheme (light and dark emulation), against a running server.
 *
 * What it measures on the rendered page (CLOSE-OUT C14.12, the rubric), with
 * the in-page code in scripts/verify/lib/rubric-in-page.mjs (shared with the
 * competitor capture so both sides are measured identically):
 *   typography  distinct rendered font sizes (with the elements carrying each),
 *               distinct font families, characters per line for every text
 *               block, and single-word last lines (orphans)
 *   colour      the share of the page painted gold (fills and borders whose
 *               hue reads gold), and the count of gold text elements
 *   shape       distinct border radii and distinct box shadows in use, with
 *               Tailwind's transparent placeholder shadow layers stripped
 *   targets     interactive elements smaller than 44px in either direction
 *   focus       whether a sample of interactive elements shows a focus ring
 *   a11y        axe-core WCAG 2.0/2.1 A/AA violations (contrast included)
 *   weight      script and stylesheet bytes the route loads to first paint
 *   theme       the number of prefers-color-scheme: dark rules the page ships
 *               and a hash of the light and dark captures, so a platform with
 *               no dark theme is recorded as such, never assumed
 *
 * It also writes a full-page capture per cell as a JPEG (quality 70) to keep
 * the evidence small (disk discipline), never a trace or a video.
 *
 * Usage:
 *   node scripts/verify/c14-rubric-measure.mjs --base http://localhost:3311 \
 *     --out C:/dev/EVIDENCE/C14/before --url home=/ --url browse=/events \
 *     [--cookie "name=value; name2=value2"] [--viewport 390,768,1440] [--no-dark]
 *
 * Under Git Bash set MSYS_NO_PATHCONV=1, or "home=/" arrives as a Windows path.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { measureInPage, focusSampleInPage } from './lib/rubric-in-page.mjs'

const args = process.argv.slice(2)
let base = 'http://localhost:3311'
let out = null
let cookie = null
let viewports = [390, 768, 1440]
let dark = true
const urls = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--base') base = args[++i].replace(/\/$/, '')
  else if (a === '--out') out = args[++i]
  else if (a === '--cookie') cookie = args[++i]
  else if (a === '--viewport') viewports = args[++i].split(',').map(Number)
  else if (a === '--no-dark') dark = false
  else if (a === '--url') {
    const v = args[++i]
    const eq = v.indexOf('=')
    urls.push({ label: v.slice(0, eq), path: v.slice(eq + 1) })
  }
}
if (!out || urls.length === 0) {
  console.error('FAIL: --out and at least one --url label=path are required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const HEIGHTS = { 390: 844, 768: 1024, 1440: 900 }

const browser = await chromium.launch({ headless: true })
const report = []
for (const { label, path } of urls) {
  for (const width of viewports) {
    const schemes = dark ? ['light', 'dark'] : ['light']
    const hashes = {}
    for (const scheme of schemes) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHTS[width] ?? 900 },
        colorScheme: scheme,
        locale: 'en-AU',
        deviceScaleFactor: 1,
        isMobile: width < 768,
        hasTouch: width < 768,
        extraHTTPHeaders: cookie ? { Cookie: cookie } : {},
      })
      const page = await context.newPage()
      const errors = []
      const weight = { scriptBytes: 0, scripts: 0, styleBytes: 0, styles: 0 }
      page.on('pageerror', (e) => errors.push((e.stack || String(e)).slice(0, 400)))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 160))
      })
      page.on('response', async (res) => {
        const type = res.request().resourceType()
        if (type !== 'script' && type !== 'stylesheet') return
        try {
          const body = await res.body()
          if (type === 'script') {
            weight.scriptBytes += body.length
            weight.scripts += 1
          } else {
            weight.styleBytes += body.length
            weight.styles += 1
          }
        } catch {
          // a response that was already gone when we asked for its body
        }
      })
      // 'load' first, then a bounded wait for the network to go quiet: a page
      // whose third-party script keeps retrying (the map on a localhost referer)
      // would otherwise never reach networkidle and fail the whole run.
      const res = await page.goto(base + path, { waitUntil: 'load', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(800)
      const firstPaintWeight = { ...weight }
      // settle lazy rails: scroll to the bottom and back so every reveal fires and images load
      await page.evaluate(async () => {
        const h = document.documentElement.scrollHeight
        for (let y = 0; y < h; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(600)
      const file = join(out, `${label}-${width}-${scheme}.jpg`)
      const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 })
      writeFileSync(file, buf)
      hashes[scheme] = createHash('sha1').update(buf).digest('hex').slice(0, 12)
      let metrics = null
      let focus = null
      let axe = null
      if (scheme === 'light') {
        metrics = await page.evaluate(measureInPage)
        focus = await page.evaluate(focusSampleInPage, 30)
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        axe = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          count: v.nodes.length,
          nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, html: n.html?.slice(0, 160) })),
        }))
      }
      report.push({ label, path, width, scheme, status: res?.status(), file, hash: hashes[scheme], weight: firstPaintWeight, errors: errors.slice(0, 10), metrics, focus, axe })
      await context.close()
    }
    const light = report.find((r) => r.label === label && r.width === width && r.scheme === 'light')
    const m = light.metrics
    const sizes = Object.keys(m.fontSizes).map(parseFloat).sort((a, b) => a - b)
    const serious = (light.axe ?? []).filter((v) => v.impact === 'serious' || v.impact === 'critical').reduce((s, v) => s + v.count, 0)
    const darkVerdict = dark ? `${m.darkRules} rules, capture ${hashes.light === hashes.dark ? 'identical' : 'differs'}` : 'skipped'
    console.log(
      `[${label} ${width}] status=${light.status} sizes=${sizes.length} (${sizes.join('/')}) families=${Object.keys(m.families).join('|')} radii=${Object.keys(m.radii).length} shadows=${Object.keys(m.shadows).length} gold=${m.gold.fillSharePct}% goldText=${m.gold.textElements} maxLine=${m.lineLengths.max} over75=${m.lineLengths.over75.length} orphans=${m.orphanCount} small=${m.smallTargetCount}/${m.interactiveCount} focusMissing=${light.focus.missingRing.length}/${light.focus.sampled} axe=${(light.axe ?? []).length} serious=${serious} js=${Math.round(light.weight.scriptBytes / 1024)}K css=${Math.round(light.weight.styleBytes / 1024)}K dark=${darkVerdict} errors=${light.errors.length}`,
    )
  }
}
await browser.close()
writeFileSync(join(out, 'rubric-measure.json'), JSON.stringify({ base, measuredAt: new Date().toISOString(), report }, null, 2))
console.log(`wrote ${join(out, 'rubric-measure.json')}`)
