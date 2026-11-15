// THE WHOLE PUBLIC SITE, CRAWLED ON PRODUCTION WITH A REAL BROWSER (Lawal, 15 November 2026, 22:01, item 2: "every public
// page and admin page crawled on production at 390 and 1440 with a real browser: every link answers 200 (or its intended
// redirect), no console error, no failed network request, no unhandled rejection"). WINDOW 5A. Read only: GET requests
// only, a named crawler user agent (production drives name themselves crawlers so analytics never count them), and it
// skips the tracked short links (/out /e /s /go) so no click is ever recorded. Admin pages need a signed in admin with 2FA
// and are crawled on TEST by the admin harness, not here.
// THE STANDING RUN (law 21): .github/workflows/site-crawl.yml runs it after every production deployment and daily; any page
// with a fault or any dead link fails the run, which emails the owner and is read by the next release (the PM's 22:05).
//   node scripts/verify/site-crawl.mjs [maxPages]     (CRAWL_BASE, CRAWL_OUT override the address and the folder)
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { declareWork } from '../lib/work-report.mjs'
const BASE = (process.env.CRAWL_BASE ?? 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = process.env.CRAWL_OUT ?? 'crawl-evidence'
const MAX = Number(process.argv[2] ?? 60)
const UA = 'EventLinqs-QA-crawler/1.0 (+https://www.eventlinqs.com.au; site check, not a visitor)'
mkdirSync(OUT, { recursive: true })
const SEEDS = ['/', '/events', '/city/melbourne', '/city/geelong', '/city/ballarat', '/city/bendigo', '/state/victoria', '/cities',
  '/communities', '/this-weekend', '/organisers', '/submit-event', '/legal/terms', '/legal/privacy', '/legal/refunds',
  '/legal/organiser-terms', '/about', '/pricing', '/login', '/signup']
const SKIP = /^\/(out|e|s|go|api|admin|dashboard|checkout|account|auth|unsubscribe)(\/|$)|\.(jpg|jpeg|png|webp|avif|svg|pdf|ics|xml|txt)$/i
const norm = (href) => {
  try {
    const u = new URL(href, BASE)
    if (u.origin !== BASE) return null
    return u.pathname.replace(/\/$/, '') || '/'
  } catch { return null }
}
const queue = [...SEEDS]
const seen = new Set(queue)
const links = new Map() // path -> first page that linked it
const pages = []
const browser = await chromium.launch()
const ctxFor = async (w, h) => browser.newContext({ viewport: { width: w, height: h }, userAgent: UA })
const ctx1440 = await ctxFor(1440, 900)
const ctx390 = await ctxFor(390, 844)
async function visit(ctx, path, width) {
  const page = await ctx.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failed = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)))
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? ''
    // A request the browser abandoned because the page moved on is not a fault (net::ERR_ABORTED on a prefetch).
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) return
    failed.push(`${r.method()} ${r.url().slice(0, 160)} ${why}`)
  })
  page.on('response', (r) => {
    const u = r.url()
    if (u.startsWith(BASE) && r.status() >= 400 && !/\/_vercel\/(insights|speed-insights)/.test(u)) failed.push(`${r.status()} ${u.slice(0, 160)}`)
  })
  let status = 0
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 })
    status = res ? res.status() : 0
    await page.waitForTimeout(2500)
  } catch (err) {
    pageErrors.push(`navigation: ${String(err.message).split('\n')[0]}`)
  }
  let hrefs = []
  try { hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))) } catch {}
  await page.close()
  return { path, width, status, consoleErrors, pageErrors, failed, hrefs }
}
let n = 0
while (queue.length && n < MAX) {
  const path = queue.shift()
  n += 1
  const a = await visit(ctx1440, path, 1440)
  const b = await visit(ctx390, path, 390)
  for (const h of [...a.hrefs, ...b.hrefs]) {
    const p = norm(h)
    if (!p || SKIP.test(p)) continue
    if (!links.has(p)) links.set(p, path)
    if (!seen.has(p)) { seen.add(p); queue.push(p) }
  }
  for (const r of [a, b]) {
    delete r.hrefs
    pages.push(r)
    const bad = r.status >= 400 || r.consoleErrors.length || r.pageErrors.length || r.failed.length
    if (bad) console.log(`FAULT ${r.width} ${r.status} ${path} | console ${r.consoleErrors.length} | errors ${r.pageErrors.length} | failed ${r.failed.length}`)
  }
  if (n % 20 === 0) console.log(`${n} pages crawled, ${queue.length} queued`)
  await new Promise((r) => setTimeout(r, 300))
}
// Every internal link found but not crawled as a page: its status, one GET each, a little apart.
const checked = []
const crawled = new Set(pages.map((p) => p.path))
for (const [p, from] of links) {
  if (crawled.has(p)) continue
  try {
    const r = await ctx1440.request.get(BASE + p, { maxRedirects: 5, timeout: 30000, headers: { 'user-agent': UA } })
    checked.push({ path: p, from, status: r.status() })
    if (r.status() >= 400) console.log(`LINK ${r.status()} ${p} (linked from ${from})`)
  } catch (err) {
    checked.push({ path: p, from, status: 0, error: String(err.message).split('\n')[0] })
  }
  await new Promise((r) => setTimeout(r, 150))
}
await browser.close()
const faults = pages.filter((r) => r.status >= 400 || r.consoleErrors.length || r.pageErrors.length || r.failed.length)
const deadLinks = checked.filter((c) => c.status >= 400 || c.status === 0)
writeFileSync(`${OUT}/crawl.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, pagesCrawled: n, views: pages.length, linksChecked: checked.length, faults, deadLinks, pages, checked }, null, 1))
console.log(`DONE ${n} pages at 1440 and 390 (${pages.length} views); ${faults.length} views with a fault; ${checked.length} more links checked, ${deadLinks.length} dead`)
// How much it did, said so a crawl that reached nothing can never pass (steps-declare-work, the ruling of 25 August 2026).
declareWork('site-crawl', {
  did: { 'page crawled at both widths': n, 'further link': checked.length },
  found: { 'faulty view': faults.length, 'dead link': deadLinks.length },
  zeroIsFine: { 'further link': 'every link found was crawled as a page' },
})
process.exitCode = faults.length > 0 || deadLinks.length > 0 ? 1 : process.exitCode ?? 0
