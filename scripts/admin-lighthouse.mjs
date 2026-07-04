// Authenticated Lighthouse for the admin pages.
//
// Admin is behind login + 2FA, so a plain Lighthouse run only ever sees the
// login redirect. This reads the session cookies saved by the Playwright admin
// setup (.auth/admin.json), injects them as a Cookie header, runs Lighthouse
// (via the already-installed @lhci/cli) against the main admin pages on the
// local server, and prints the real category scores per URL.
//
// Prerequisites:
//   1. npx playwright test --config playwright.admin.config.ts --project setup --headed
//      (one-time login -> writes .auth/admin.json)
//   2. a server on http://localhost:3000 (npm run dev or npm run start)
//
// Usage:  node scripts/admin-lighthouse.mjs
//
// Target: 95+ (0.95) on performance and 1.0 on accessibility/best-practices.
// The script reports the measured numbers; it does not gate.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs'

const BASE = process.env.ADMIN_BASE_URL ?? 'http://localhost:3000'
const STORAGE = '.auth/admin.json'
const URLS = [
  '/admin',
  '/admin/refunds',
  '/admin/disputes',
  '/admin/organisers',
  '/admin/events',
  '/admin/payouts',
]

if (!existsSync(STORAGE)) {
  console.error(`Missing ${STORAGE}. Run the Playwright admin setup first:`)
  console.error('  npx playwright test --config playwright.admin.config.ts --project setup --headed')
  process.exit(1)
}

const state = JSON.parse(readFileSync(STORAGE, 'utf8'))
const host = new URL(BASE).hostname
const cookieHeader = (state.cookies ?? [])
  .filter(c => c.domain === host || c.domain === `.${host}` || host.endsWith(String(c.domain).replace(/^\./, '')))
  .map(c => `${c.name}=${c.value}`)
  .join('; ')

if (!cookieHeader) {
  console.error(`No cookies for ${host} in ${STORAGE}. Re-run the setup login.`)
  process.exit(1)
}

const config = {
  ci: {
    collect: {
      url: URLS.map(u => `${BASE}${u}`),
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        extraHeaders: JSON.stringify({ Cookie: cookieHeader }),
        chromeFlags: '--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
}
writeFileSync('lighthouserc.admin.json', JSON.stringify(config, null, 2))

rmSync('.lighthouseci', { recursive: true, force: true })
console.log(`Running Lighthouse (desktop, median of 3) on ${URLS.length} admin pages...\n`)
try {
  execFileSync('npx', ['--yes', '@lhci/cli@0.14.x', 'collect', '--config=lighthouserc.admin.json'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} catch {
  console.error('\nLighthouse collect failed. Is the server up and the session still valid?')
  process.exit(1)
}

// Parse the per-run reports and report the median score per URL + category.
const dir = '.lighthouseci'
const reports = readdirSync(dir).filter(f => f.startsWith('lhr-') && f.endsWith('.json'))
const byUrl = new Map()
for (const f of reports) {
  const lhr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  const url = lhr.finalUrl ?? lhr.requestedUrl
  const row = byUrl.get(url) ?? { perf: [], a11y: [], bp: [], seo: [] }
  row.perf.push(lhr.categories.performance?.score ?? null)
  row.a11y.push(lhr.categories.accessibility?.score ?? null)
  row.bp.push(lhr.categories['best-practices']?.score ?? null)
  row.seo.push(lhr.categories.seo?.score ?? null)
  byUrl.set(url, row)
}

const median = arr => {
  const xs = arr.filter(x => typeof x === 'number').sort((a, b) => a - b)
  if (!xs.length) return null
  return xs[Math.floor(xs.length / 2)]
}
const pct = x => (x == null ? '  -' : String(Math.round(x * 100)).padStart(3))

console.log('\n=== Median Lighthouse scores (admin, desktop) ===')
console.log('PERF  A11Y  BP   SEO   URL')
for (const [url, row] of byUrl) {
  console.log(`${pct(median(row.perf))}   ${pct(median(row.a11y))}  ${pct(median(row.bp))}  ${pct(median(row.seo))}   ${new URL(url).pathname}`)
}
console.log('\nTarget: PERF >= 95, A11Y/BP = 100.')
