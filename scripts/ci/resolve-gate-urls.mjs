// Resolve the full Lighthouse/axe gate URL list against a deployed Vercel
// preview. Static marketing/legal/buyer surfaces are fixed paths; the event
// detail surface is discovered from the live sitemap so the gate always
// measures a real, resolvable detail page on whatever data source the
// preview is wired to (rather than a hand-picked seed slug that may 404 -
// exactly the failure mode the workshop inspection flagged as BLOCKER-1).
//
// Usage: PREVIEW_URL=https://<preview>.vercel.app node scripts/ci/resolve-gate-urls.mjs
// Prints one absolute URL per line on stdout.

const base = (process.env.PREVIEW_URL || '').replace(/\/+$/, '')
if (!base) {
  console.error('PREVIEW_URL is required')
  process.exit(1)
}

// Fixed gate paths. Buyer-critical + marketing + legal. The marketing/legal
// set (/about, /blog, /careers, /press, /legal/privacy) was added so those
// surfaces are axe + Lighthouse gated and can never silently regress; the
// workshop inspection found they had been omitted entirely.
const STATIC_PATHS = [
  '/',
  '/events',
  '/events/browse/melbourne',
  '/culture/african',
  '/organisers',
  '/pricing',
  '/help',
  '/about',
  '/blog',
  '/careers',
  '/press',
  '/legal/terms',
  '/legal/privacy',
  '/login',
  '/signup',
]

async function discoverEventDetailPath() {
  try {
    const res = await fetch(`${base}/sitemap.xml`, {
      headers: { Cookie: 'el-audit=1' },
    })
    if (!res.ok) {
      console.error(`sitemap.xml returned ${res.status}; falling back to seed slug`)
      return null
    }
    const xml = await res.text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    for (const loc of locs) {
      let path
      try {
        path = new URL(loc).pathname
      } catch {
        path = loc
      }
      // /events/<slug> exactly (two segments), excluding /events/browse/*
      const m = path.match(/^\/events\/([^/]+)\/?$/)
      if (m && m[1] !== 'browse') return path.replace(/\/$/, '')
    }
    console.error('No /events/<slug> entry found in sitemap; falling back to seed slug')
    return null
  } catch (err) {
    console.error(`sitemap fetch failed (${err?.message}); falling back to seed slug`)
    return null
  }
}

const detailPath =
  (await discoverEventDetailPath()) || '/events/afrobeats-melbourne-summer-sessions'

// Insert the discovered detail page right after the listing surfaces.
const paths = [...STATIC_PATHS]
paths.splice(2, 0, detailPath)

for (const p of paths) {
  process.stdout.write(`${base}${p}\n`)
}
