/**
 * THE INDEXING TAGS, IN A REAL BROWSER, AT THREE VIEWPORTS (close-out C19.7).
 *
 * scripts/verify/indexing-drive.mjs asserts the policy over a whole host with
 * fetch. This is the other half of the proof: a real browser loads each page at
 * 390, 768 and 1440, reads the robots directive, the canonical, the title, the
 * description and the JSON-LD types out of the rendered DOM, and captures the
 * page. It exists because the tags are what a crawler acts on and a table of
 * them beside the picture is what the ledger can cite.
 *
 * The three viewports are not decoration here. Metadata is emitted server side
 * and is viewport-independent, and this run is what SHOWS that rather than
 * assuming it: if a width ever changed a canonical, the table would say so.
 *
 * Run: node scripts/verify/indexing-capture.mjs <base> <outDir> <label> <path...>
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const BASE = process.argv[2]
const OUT = process.argv[3]
const LABEL = process.argv[4] ?? 'local'
const URLS = process.argv.slice(5)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const rows = []
for (const path of URLS) {
  for (const width of [390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
    const tags = await page.evaluate(() => ({
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap(s => { try { const j = JSON.parse(s.textContent); return (Array.isArray(j) ? j : [j]).map(x => x['@type']) } catch { return ['UNPARSEABLE'] } }),
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 80) ?? null,
    }))
    const file = `${LABEL}-${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}-${width}.jpg`
    await page.screenshot({ path: join(OUT, file), quality: 55, type: 'jpeg' })
    rows.push({ path, width, status: res.status(), ...tags, capture: file })
    await ctx.close()
  }
}
await browser.close()
writeFileSync(join(OUT, `${LABEL}-tags.json`), JSON.stringify(rows, null, 1))
const md = ['| path | width | status | robots | canonical | JSON-LD | capture |', '|---|---|---|---|---|---|---|']
for (const r of rows) md.push(`| ${r.path} | ${r.width} | ${r.status} | ${r.robots ?? 'none'} | ${(r.canonical ?? 'none').replace(/^https?:\/\/[^/]+/, '')} | ${r.ld.join(', ') || 'none'} | ${r.capture} |`)
writeFileSync(join(OUT, `${LABEL}-tags.md`), md.join('\n') + '\n')
console.log(md.join('\n'))
