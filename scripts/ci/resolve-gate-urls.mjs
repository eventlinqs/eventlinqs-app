// Resolve the Lighthouse gate URL list against a deployed Vercel preview.
//
// The previous gate hardcoded a seed event slug
// (/events/afrobeats-melbourne-summer-sessions) in lighthouserc.json. When the
// local seed no longer produced that exact slug the event-detail URL returned
// 404, and LHCI treats any 404 in the URL set as a hard `collect` failure
// (ERRORED_DOCUMENT_REQUEST) - failing the whole gate regardless of scores.
//
// This resolver keeps the SAME public URL set the gate has always covered, but
// discovers a real, resolvable /events/<slug> from the preview's own sitemap so
// the detail surface can never be a stale hand-picked slug. If discovery fails
// it falls back to the historical slug (the gate then reports honestly rather
// than silently dropping the detail page).
//
// Usage: PREVIEW_URL=https://<preview>.vercel.app node scripts/ci/resolve-gate-urls.mjs
// Prints one absolute URL per line on stdout.

const base = (process.env.PREVIEW_URL || '').replace(/\/+$/, '')
if (!base) {
  console.error('PREVIEW_URL is required')
  process.exit(1)
}

// The public, no-auth URL set this gate has always measured (parity with the
// committed lighthouserc.json). Auth-gated surfaces stay excluded - they need a
// recorded-session gate. The event-detail slug is NOT listed here; it is
// discovered below so it always resolves on whatever data the preview is wired
// to.
const STATIC_PATHS = [
  '/',
  '/events',
  '/events/browse/melbourne',
  '/culture/african',
  '/organisers',
  '/pricing',
  '/help',
  '/legal/terms',
  '/login',
  '/signup',
]

// Historical fallback slug, used only if sitemap discovery fails.
const FALLBACK_DETAIL_PATH = '/events/afrobeats-melbourne-summer-sessions'

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

const detailPath = (await discoverEventDetailPath()) || FALLBACK_DETAIL_PATH

// Insert the discovered detail page right after the listing/culture surfaces,
// preserving the original gate ordering (detail came after /culture/african).
const paths = [...STATIC_PATHS]
paths.splice(4, 0, detailPath)

for (const p of paths) {
  process.stdout.write(`${base}${p}\n`)
}
