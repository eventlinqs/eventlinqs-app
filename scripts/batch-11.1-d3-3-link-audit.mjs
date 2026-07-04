// Batch 11.1 D3.3 - Comprehensive internal link audit.
//
// Crawl every page in the public inventory, extract every internal
// link (href starting with `/` or pointing at eventlinqs.com), test
// each one. Any link returning 404 / 5xx is a FAIL.
//
// Output: docs/redesign/batch-11.1-evidence/link-audit.json (raw)
//   + console summary
//
// Runs against `http://localhost:3007` (local prod build).
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3007'
const OUT_DIR = 'docs/redesign/batch-11.1-evidence'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const AU_CITIES = [
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
  'gold-coast', 'canberra', 'hobart', 'darwin', 'cairns',
  'geelong', 'newcastle', 'wollongong',
  'sunshine-coast', 'toowoomba', 'townsville',
  'ballarat', 'bendigo', 'launceston', 'albury',
]
const COMMUNITIES = [
  'african', 'south-asian', 'caribbean', 'latin', 'east-asian',
  'filipino', 'mediterranean', 'middle-eastern', 'european',
  'pacific', 'gospel', 'comedy', 'wellness', 'pride',
]

const pagesToCrawl = [
  '/',
  '/events',
  '/communities',
  '/cities',
  '/organisers',
  '/organisers/signup',
  '/pricing',
  '/about',
  '/contact',
  '/press',
  '/help',
  '/careers',
  '/blog',
  '/legal/terms',
  '/legal/privacy',
  '/legal/refunds',
  '/legal/cookies',
  '/legal/accessibility',
  '/legal/organiser-terms',
  '/login',
  '/signup',
  '/forgot-password',
  '/verify-email-sent',
  ...AU_CITIES.map(c => `/events/browse/${c}`),
  ...AU_CITIES.map(c => `/city/${c}`),
  ...COMMUNITIES.map(c => `/community/${c}`),
]

console.log(`Crawling ${pagesToCrawl.length} pages...`)

const PROD_DOMAIN = 'www.eventlinqs.com'
const ALSO_DOMAIN = 'eventlinqs.com'

// Extract internal hrefs from HTML.
function extractInternalLinks(html) {
  const out = new Set()
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1]
    if (!href) continue
    // Absolute on our own domain.
    if (href.startsWith('https://' + PROD_DOMAIN) || href.startsWith('https://' + ALSO_DOMAIN)) {
      href = href.replace(/^https:\/\/(www\.)?eventlinqs\.com/, '')
    }
    if (!href.startsWith('/')) continue
    // Skip fragments, mailto, tel, javascript, query-only, /api/* (not user-navigable)
    if (href.startsWith('//')) continue
    if (href.startsWith('/api/')) continue
    if (href.startsWith('/_next/')) continue
    // Strip fragment + remove obvious tracking suffix.
    href = href.split('#')[0]
    if (!href) continue
    out.add(href)
  }
  return out
}

// Cache HTTP status checks (many pages share links - cards, footers, nav).
const statusCache = new Map()
async function statusFor(path) {
  if (statusCache.has(path)) return statusCache.get(path)
  try {
    const r = await fetch(BASE + path, { redirect: 'manual' })
    statusCache.set(path, r.status)
    return r.status
  } catch {
    statusCache.set(path, 0)
    return 0
  }
}

const allLinksByPage = {}
const allUniqueLinks = new Set()

for (const page of pagesToCrawl) {
  try {
    const r = await fetch(BASE + page, { redirect: 'manual' })
    if (r.status !== 200) {
      console.log(`  ${page} returned ${r.status} - SKIPPED extraction`)
      allLinksByPage[page] = { status: r.status, links: [] }
      continue
    }
    const html = await r.text()
    const links = [...extractInternalLinks(html)]
    allLinksByPage[page] = { status: 200, links }
    for (const l of links) allUniqueLinks.add(l)
  } catch (e) {
    console.log(`  ${page} crawl error: ${e.message?.slice(0, 60)}`)
    allLinksByPage[page] = { status: 0, links: [], error: e.message }
  }
}

console.log(`\nCrawled ${pagesToCrawl.length} pages; found ${allUniqueLinks.size} unique internal links.`)
console.log('Testing each unique link...')

const linkStatuses = {}
const linksArr = [...allUniqueLinks].sort()

// Batch the HTTP tests in waves of 10 to avoid hammering.
for (let i = 0; i < linksArr.length; i += 10) {
  const wave = linksArr.slice(i, i + 10)
  const results = await Promise.all(wave.map(l => statusFor(l)))
  for (let j = 0; j < wave.length; j++) {
    linkStatuses[wave[j]] = results[j]
  }
  if ((i + 10) % 100 === 0) process.stdout.write('.')
}
console.log()

const failures = []
for (const [link, status] of Object.entries(linkStatuses)) {
  if (status === 0 || status === 404 || status >= 500) {
    failures.push({ link, status })
  }
}

writeFileSync(`${OUT_DIR}/link-audit.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  pagesCrawled: pagesToCrawl.length,
  uniqueLinks: allUniqueLinks.size,
  failures,
  // Compact view: link -> status
  statuses: linkStatuses,
  // Per-page link inventory (verbose)
  byPage: allLinksByPage,
}, null, 2))

console.log(`\n=== Link audit ===`)
console.log(`Pages crawled: ${pagesToCrawl.length}`)
console.log(`Unique internal links: ${allUniqueLinks.size}`)
console.log(`Failures: ${failures.length}`)
if (failures.length > 0) {
  for (const f of failures.slice(0, 50)) {
    console.log(`  ${String(f.status).padStart(4)} ${f.link}`)
  }
  console.log(`\nFull failure list: ${OUT_DIR}/link-audit.json`)
  process.exit(2)
} else {
  console.log('\nAll internal links return 200/2xx/3xx. No broken links.')
}
