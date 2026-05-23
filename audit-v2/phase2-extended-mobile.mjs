// Phase 2 extended: targeted long-observation mobile pass on the
// homepage to validate that React #185 (PR #34, commit 9fa8ba8) is
// actually fixed in serving production. The original bug surfaced
// only under iPhone 12 Pro viewport, with cookie state changes
// driving an unstable useSyncExternalStore snapshot. We probe:
//   1. cold mobile load, observe 20s
//   2. scroll the page (triggers IntersectionObserver wiring)
//   3. simulate cookie write/clear and observe
// Any pageerror or React-flagged console.error counts as a regression.
import { chromium, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://www.eventlinqs.com'
const ROOT = path.resolve('audit-v2')
const RESULTS = path.join(ROOT, 'evidence', 'phase2-extended-mobile.json')

async function main() {
  await mkdir(path.dirname(RESULTS), { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 12 Pro'], ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const out = { url: BASE + '/', viewport: 'iPhone 12 Pro', steps: [], pageErrors: [], reactErrors: [] }
  page.on('pageerror', e => out.pageErrors.push({ step: out.steps.at(-1)?.name, message: String(e.message||e).slice(0,500) }))
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text()
      if (/react|hydrat|#\d+/i.test(t)) out.reactErrors.push({ step: out.steps.at(-1)?.name, text: t.slice(0,500) })
    }
  })
  const stamp = (name, extra={}) => out.steps.push({ name, t: Date.now(), ...extra })

  stamp('navigate')
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })

  stamp('observe-20s-after-load')
  await page.waitForTimeout(20000)

  stamp('scroll-to-bottom')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(2000)

  stamp('cookie-write-clear-3x')
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { document.cookie = 'el_audit_probe=1; path=/; max-age=10' })
    await page.waitForTimeout(500)
    await page.evaluate(() => { document.cookie = 'el_audit_probe=; path=/; max-age=0' })
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(3000)

  stamp('done')
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'root_mobile_extended.png') }).catch(()=>{})
  await ctx.close()
  await browser.close()

  await writeFile(RESULTS, JSON.stringify(out, null, 2))
  console.log(`pageerrors: ${out.pageErrors.length}, react-flagged console errors: ${out.reactErrors.length}`)
  if (out.pageErrors.length) console.log(JSON.stringify(out.pageErrors, null, 2))
  if (out.reactErrors.length) console.log(JSON.stringify(out.reactErrors, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
