/**
 * Build a kit COLD from the public composer and pull all four artefacts.
 *
 * The point is not that the endpoints return 200. It is that the four files a
 * promoter actually posts are fetched from a real deployment, written to disk,
 * and can then be OPENED and looked at. A rendered artefact is unproven until
 * somebody has seen it.
 *
 * Usage: node scripts/verify/launch-kit-artefact-pull.mjs <baseUrl>
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/verify/launch-kit-artefact-pull.mjs <baseUrl>')
  process.exit(1)
}

const OUT = join(process.cwd(), 'docs', 'design', 'launch-kit-live')
mkdirSync(OUT, { recursive: true })

const ARRIVAL =
  'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

await page.goto(`${BASE}/launch`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
await page.waitForSelector('#launch-description', { timeout: 60_000 })
await page.$eval(
  '#launch-description',
  (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  },
  ARRIVAL,
)
await page.waitForTimeout(400)
await page
  .getByRole('button', { name: /make|build|create|generate|kit|start|go/i })
  .first()
  .click({ timeout: 30_000 })

// The composer works for a few seconds. Wait for an artefact link to exist.
await page.waitForFunction(
  () => [...document.querySelectorAll('a[href]')].some((a) => /\/api\/launch\//.test(a.getAttribute('href'))),
  { timeout: 180_000 },
)

const links = await page.$$eval('a[href]', (as) =>
  [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => /\/api\/launch\//.test(h)))],
)
console.log('artefact links found:')
for (const l of links) console.log(`  ${l}`)

const code = (links[0].match(/\/api\/launch\/([^/]+)\//) || [])[1]
console.log(`\nkit code: ${code}`)

const targets = [
  { name: 'story', url: `${BASE}/api/launch/${code}/card/story`, file: 'story.jpg' },
  { name: 'square', url: `${BASE}/api/launch/${code}/card/square`, file: 'square.jpg' },
  { name: 'feed (tall post)', url: `${BASE}/api/launch/${code}/card/feed`, file: 'feed.jpg' },
  { name: 'poster', url: `${BASE}/api/launch/${code}/poster`, file: 'poster.pdf' },
]

for (const t of targets) {
  const res = await page.request.get(t.url, { timeout: 180_000 })
  const body = Buffer.from(await res.body())
  writeFileSync(join(OUT, t.file), body)
  console.log(
    `${t.name}: HTTP ${res.status()} ${res.headers()['content-type']} ${body.byteLength} bytes -> ${t.file}`,
  )
}

await browser.close()
console.log(`\nwritten to ${OUT}`)
