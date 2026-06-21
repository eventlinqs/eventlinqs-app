// Link-integrity crawler - enforces the ZERO DEAD LINKS law.
//
// "Verify by clicking what the user clicks. A surface is not done until every
//  link rendered on it resolves to a working page. Zero dead links
//  platform-wide." (CLAUDE.md)
//
// What it does: loads each KEY surface, extracts EVERY internal href the page
// actually renders (event cards, city/community/suburb tiles, nav, footer, CTAs),
// requests each unique target following redirects, and FAILS (exit 1) on any
// link whose final response is not HTTP 200. This is the automated proof that a
// founder clicking any card/tile/link never lands on a 404 or 500.
//
// Usage:
//   node scripts/link-integrity-crawl.mjs <baseUrl>
//   BASE=https://...preview.vercel.app node scripts/link-integrity-crawl.mjs
//   node scripts/link-integrity-crawl.mjs http://localhost:3000
//
// Default base is the feat/home-rebuild preview. Override with argv[2] or BASE.

const BASE = (process.argv[2] || process.env.BASE ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app'
).replace(/\/$/, '')

// The surfaces a test-driver actually lands on. Each is loaded, and every
// internal link it renders is harvested and verified. This deliberately spans
// the buyer journey (home -> browse -> detail) plus city/community/suburb long
// tail and the marketing/legal set.
const SEED_PATHS = [
  '/',                              // homepage (full fixture density: 55 event cards)
  '/events',                        // browse
  '/organisers',                    // marketing reference build
  '/pricing',
  '/about',
  '/careers',
  '/press',
  '/cities',
  '/communities',
  '/city/sydney',                   // city landing (renders suburb tiles + community tiles)
  '/city/melbourne',
  '/community/african',               // community landing (renders community-city tiles)
  '/city/sydney/inner-west',        // suburb (BLOCKER-2)
  '/community/african/sydney',        // community-city (BLOCKER-2)
  '/legal/terms',
  '/legal/privacy',
  '/login',
  '/signup',
]

// Internal links we deliberately do NOT crawl as navigable pages.
const SKIP_PREFIXES = ['/api/', '/cdn/', '/_next/', '/monitoring']
const SKIP_EXACT = new Set(['/sitemap.xml', '/robots.txt'])

const CONCURRENCY = 12
const TIMEOUT_MS = 30000

function isInternal(href) {
  if (!href) return false
  if (href.startsWith('//')) return false                 // protocol-relative -> external
  if (href.startsWith('/')) return true
  if (href.startsWith(BASE)) return true
  return false
}

function normalise(href) {
  let path = href.startsWith(BASE) ? href.slice(BASE.length) : href
  path = path.split('#')[0]                                // drop fragment
  if (!path) return null
  if (!path.startsWith('/')) return null
  if (path !== '/' ) path = path.replace(/\/$/, '')        // drop trailing slash
  if (SKIP_EXACT.has(path)) return null
  if (SKIP_PREFIXES.some(p => path.startsWith(p))) return null
  if (/\.(png|jpe?g|svg|webp|avif|ico|css|js|json|xml|txt|woff2?)$/i.test(path)) return null
  return path
}

function extractHrefs(html) {
  const out = new Set()
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    if (isInternal(m[1])) {
      const n = normalise(m[1])
      if (n) out.add(n)
    }
  }
  return out
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' })
  } finally {
    clearTimeout(t)
  }
}

async function pool(items, n, fn) {
  const results = []
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  console.log(`\n[link-crawl] base: ${BASE}`)
  console.log(`[link-crawl] harvesting links from ${SEED_PATHS.length} seed surfaces...\n`)

  // 1) Harvest every internal link rendered on the seed surfaces.
  const linkSources = new Map() // path -> Set(seed that linked it)
  const register = (path, seed) => {
    if (!linkSources.has(path)) linkSources.set(path, new Set())
    linkSources.get(path).add(seed)
  }
  for (const seed of SEED_PATHS) register(seed, '(seed)')

  await pool(SEED_PATHS, CONCURRENCY, async seed => {
    try {
      const res = await fetchWithTimeout(BASE + seed, { headers: { 'user-agent': 'eventlinqs-link-crawl' } })
      const status = res.status
      if (status !== 200) {
        console.log(`  [seed ${status}] ${seed}  (could not harvest links)`)
        return
      }
      const html = await res.text()
      const hrefs = extractHrefs(html)
      for (const h of hrefs) register(h, seed)
      console.log(`  [seed 200] ${seed}  -> ${hrefs.size} links`)
    } catch (e) {
      console.log(`  [seed ERR] ${seed}  ${e.message}`)
    }
  })

  const allPaths = [...linkSources.keys()].sort()
  console.log(`\n[link-crawl] verifying ${allPaths.length} unique internal links...\n`)

  // 2) Request every unique link, following redirects; record final status.
  const dead = []
  const redirects = []
  const results = await pool(allPaths, CONCURRENCY, async path => {
    try {
      const res = await fetchWithTimeout(BASE + path, { headers: { 'user-agent': 'eventlinqs-link-crawl' } })
      const finalPath = res.url.startsWith(BASE) ? res.url.slice(BASE.length) : res.url
      const redirected = res.redirected || finalPath.split('#')[0].replace(/\/$/, '') !== path
      return { path, status: res.status, finalPath, redirected }
    } catch (e) {
      return { path, status: 0, error: e.message }
    }
  })

  for (const r of results) {
    if (r.status !== 200) {
      dead.push(r)
    } else if (r.redirected) {
      redirects.push(r)
    }
  }

  // 3) Report.
  if (redirects.length) {
    console.log(`[link-crawl] ${redirects.length} link(s) resolved via redirect to 200 (OK):`)
    for (const r of redirects) console.log(`    ${r.path}  ->  ${r.finalPath}`)
    console.log('')
  }

  if (dead.length === 0) {
    console.log(`\n✅ ZERO DEAD LINKS. ${allPaths.length} internal links all resolve to 200 on ${BASE}\n`)
    process.exit(0)
  }

  console.log(`\n❌ ${dead.length} DEAD LINK(S) on ${BASE}:\n`)
  for (const r of dead.sort((a, b) => b.status - a.status)) {
    const sources = [...(linkSources.get(r.path) || [])].filter(s => s !== '(seed)')
    const via = sources.length ? `  (linked from: ${sources.slice(0, 4).join(', ')})` : ''
    console.log(`   ${r.status || 'ERR'}  ${r.path}${via}${r.error ? '  ' + r.error : ''}`)
  }
  console.log('')
  process.exit(1)
}

main().catch(e => { console.error('[link-crawl] fatal:', e); process.exit(2) })
