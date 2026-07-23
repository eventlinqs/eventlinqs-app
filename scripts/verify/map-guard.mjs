/**
 * BROWSER-LEVEL MAP GUARD.
 *
 * A map can silently die in ways a key-string check never catches (no
 * coordinates, a referer block, a disabled API, a code regression). This loads
 * the real map surfaces in a real browser and asserts a genuine Google map
 * CANVAS renders, not merely that a key exists. Wired into the post-deploy
 * check so a deployment that ships a dead map is caught within minutes.
 *
 * Uses a real Chrome user-agent so the app's headless kill-switch does not
 * defer the map (that switch keys off a headless/bot UA).
 *
 * Run:  node scripts/verify/map-guard.mjs <baseUrl> [--drill]
 *   --drill loads a deliberately coordless surface to prove the guard fails
 *           loudly when a map is dead (the break drill).
 * Exit 1 if any required surface renders no map canvas.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const DRILL = process.argv.includes('--drill')
if (!BASE) {
  console.error('usage: node scripts/verify/map-guard.mjs <baseUrl> [--drill]')
  process.exit(2)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// The surfaces every map guard run must prove. Paths are configurable via env
// so this works against any deployment / dataset.
const SURFACES = [
  { name: 'event detail (venue map)', path: process.env.MAP_GUARD_EVENT || '/events/cat-folk-and-roots-night-brisbane' },
  { name: 'events grid map', path: process.env.MAP_GUARD_GRID || '/events?view=map' },
  { name: 'city map', path: process.env.MAP_GUARD_CITY || '/city/brisbane' },
  { name: 'venue map', path: process.env.MAP_GUARD_VENUE || '/venues/the-triffid' },
]

async function mapRenders(page, url) {
  const gmaps = []
  page.on('response', r => { if (/maps\.googleapis\.com/.test(r.url())) gmaps.push(r.status()) })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  // Scroll DOWN THE PAGE IN STEPS so every lazy IntersectionObserver (the maps
  // sit mid to lower page) fires - a single jump to the bottom can skip a
  // mid-page observer. Poll up to 25s for a real Google canvas (the geocode
  // fallback adds a round-trip before the map paints).
  let canvas = 0
  for (let i = 0; i < 25; i++) {
    await page.evaluate(y => window.scrollTo(0, y), i * 600).catch(() => {})
    canvas = await page.locator('.gm-style, canvas.mapboxgl-canvas, gmp-map').count().catch(() => 0)
    if (canvas > 0) break
    await page.waitForTimeout(1000)
  }
  return { canvas, googleRequests: gmaps.length, anyGoogleError: gmaps.some(s => s >= 400) }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA })

const results = []
for (const s of SURFACES) {
  const page = await ctx.newPage()
  const r = await mapRenders(page, `${BASE}${s.path}`)
  const ok = r.canvas > 0 && !r.anyGoogleError
  results.push({ ...s, ...r, ok })
  console.log(`${ok ? 'OK  ' : 'DEAD'} ${s.name.padEnd(28)} canvas=${r.canvas} googleReqs=${r.googleRequests}${r.anyGoogleError ? ' (Google error status seen)' : ''}`)
  await page.close()
}

if (DRILL) {
  // A URL that should have NO map, proving the guard reports DEAD rather than
  // false-green. /organisers has no geo map surface.
  const page = await ctx.newPage()
  const r = await mapRenders(page, `${BASE}/organisers`)
  console.log(`DRILL: /organisers canvas=${r.canvas} -> guard would report ${r.canvas > 0 ? 'OK (unexpected)' : 'DEAD (correct: no map here)'}`)
  await page.close()
}

await ctx.close()
await browser.close()

const dead = results.filter(r => !r.ok)
if (dead.length > 0) {
  console.error(`\nMAP GUARD FAILED: ${dead.length} surface(s) render no live map: ${dead.map(d => d.name).join(', ')}`)
  console.error('A map degraded to its static fallback. Check: event coordinates present, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY baked in the build, and the Google key referer allow-list + enabled APIs (Maps JavaScript, Geocoding).')
  process.exit(1)
}
console.log('\nMAP GUARD PASSED: every map surface renders a live Google canvas.')
process.exit(0)
