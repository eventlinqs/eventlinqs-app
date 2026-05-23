// Phase 2 delta: re-test routes with the correct URLs (the original
// audit brief used /sign-in and /sign-up which 404 — the real routes
// are /login and /signup) and check whether /tickets actually redirects
// to login for anonymous viewers (HEAD returned 200, but the page may
// render an auth gate client-side).
import { chromium, devices } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://www.eventlinqs.com'
const ROOT = path.resolve('audit-v2')
const SHOTS = path.join(ROOT, 'screenshots')
const RESULTS = path.join(ROOT, 'evidence', 'phase2-delta.json')
const OBSERVE_MS = 5000

const PAGES = [
  '/login',
  '/signup',
  '/organisers/signup',
  '/tickets', // already in main run, but capture auth-gate behaviour
]

const VIEWPORTS = [
  { name: 'mobile', device: devices['iPhone 12 Pro'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const safe = s => s.replace(/^\//,'root').replace(/[\/]/g,'_').replace(/[^a-z0-9_-]/gi,'-') || 'root'

async function auditOne(browser, urlPath, vp) {
  const opts = vp.device ? { ...vp.device } : { viewport: vp.viewport }
  const ctx = await browser.newContext({ ...opts, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const r = { path: urlPath, viewport: vp.name, httpStatus: null, finalUrl: null,
              loadTimeMs: null, consoleErrors: [], pageErrors: [], badResponses: [],
              visibleErrorText: null, screenshot: null, navError: null }
  page.on('console', m => { if (m.type()==='error') r.consoleErrors.push({text:m.text().slice(0,500)}) })
  page.on('pageerror', e => r.pageErrors.push({message:String(e.message||e).slice(0,500),stack:String(e.stack||'').slice(0,800)}))
  page.on('response', resp => { const s = resp.status(); if (s>=400) r.badResponses.push({url:resp.url(),status:s,method:resp.request().method()}) })
  const start = Date.now()
  try {
    const resp = await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 30000 })
    r.httpStatus = resp ? resp.status() : null
    r.loadTimeMs = Date.now() - start
    await sleep(OBSERVE_MS)
    r.finalUrl = page.url()
    r.visibleErrorText = await page.evaluate(() => {
      const t = document.body?.innerText || ''
      for (const c of ['We hit a snag','Something went wrong','Application error','Page not found','Internal Server Error']) {
        if (t.toLowerCase().includes(c.toLowerCase())) return c
      }
      return null
    }).catch(() => null)
    const shot = path.join(SHOTS, `${safe(urlPath)}_${vp.name}.png`)
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {})
    r.screenshot = path.relative(ROOT, shot).replace(/\\/g,'/')
  } catch (e) {
    r.navError = String(e.message||e).slice(0,500)
    r.loadTimeMs = Date.now() - start
  } finally {
    await ctx.close()
  }
  return r
}

async function main() {
  await mkdir(SHOTS, { recursive: true })
  await mkdir(path.dirname(RESULTS), { recursive: true })
  const browser = await chromium.launch()
  const all = []
  for (const vp of VIEWPORTS) {
    process.stdout.write(`\n=== ${vp.name.toUpperCase()} ===\n`)
    for (const p of PAGES) {
      const r = await auditOne(browser, p, vp)
      const bits = []
      if (r.httpStatus>=400) bits.push(`HTTP ${r.httpStatus}`)
      if (r.pageErrors.length) bits.push(`pageerror×${r.pageErrors.length}`)
      if (r.consoleErrors.length) bits.push(`console×${r.consoleErrors.length}`)
      if (r.navError) bits.push('NAV-FAIL')
      if (r.finalUrl && r.finalUrl !== BASE+p) bits.push(`redir→${new URL(r.finalUrl).pathname}`)
      const flag = bits.length ? ` [${bits.join(', ')}]` : ''
      process.stdout.write(`  ${vp.name.padEnd(7)} ${String(r.httpStatus??'---').padEnd(4)} ${String(r.loadTimeMs).padStart(5)}ms  ${p}${flag}\n`)
      all.push(r)
    }
  }
  await browser.close()
  await writeFile(RESULTS, JSON.stringify(all, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
