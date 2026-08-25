/**
 * DISCOVERY VISIBILITY DRILL: can any public surface show an event it should not?
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * On 25 August 2026, after the demo catalogue was purged from production,
 * /events rendered a page that disagreed with itself on ONE render:
 *
 *     header count             "2 events available"    correct
 *     "All events" section      2 events               correct
 *     "Popular this week" rail  8 events, ALL DELETED   wrong
 *
 * A visitor clicking any of the eight got a 404 on a live ticketing platform.
 *
 * Unit tests could not have caught it. The predicate was correct in every file;
 * what was wrong was that a SERVER-SIDE DATA CACHE held event ROWS, and a cached
 * row outlives the row it copied. That is only visible by changing a row and
 * then LOADING THE PAGE, which is what this script does.
 *
 * It is also why the natural diagnosis was wrong. `unstable_cache` is keyed by
 * cache key, not by URL, so loading `/events?x=1` in a private tab, a URL never
 * requested before, still served the deleted rows. Eliminating CDN and browser
 * caching does not eliminate this layer.
 *
 * ============================================================================
 * WHAT IT DOES
 * ============================================================================
 *
 * For each state change, it polls every surface that showed the event at
 * BASELINE until that surface stops showing it, and reports how long it took.
 *
 * A surface that did not show the event at baseline is reported n/a, never as a
 * pass: proving a page dropped something it never had proves nothing.
 *
 * Polling rather than sampling once is deliberate. Next.js time-based
 * revalidation is stale-while-revalidate, so the FIRST request after expiry
 * still serves the old value; a single post-change snapshot cannot tell "leaks
 * forever" from "leaks for one window", and reporting the first as the second is
 * exactly the false certainty this work exists to remove.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   1. Build and serve against TEST:
 *        npm run build           (with .env.test loaded into the shell)
 *        npx next start -p 3210
 *   2. node scripts/verify/discovery-visibility-drill.mjs --project test
 *
 * TEST ONLY. It mutates rows. Original values are captured before any write and
 * restored in a finally block, and the restore is printed so an interrupted run
 * is visible rather than silent.
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import { refForAlias } from '../lib/db-credentials.mjs'

const BASE = process.env.DRIVE_BASE || 'http://127.0.0.1:3210'
const MAX_WAIT_MS = Number(process.env.DRILL_MAX_WAIT_MS ?? 90000)
const POLL_MS = 3000

const target = assertNotProductionDatabase()
const TEST_REF = refForAlias('test')
if (!TEST_REF || target.ref !== TEST_REF) {
  console.error(`REFUSED: this drill writes to events and runs on TEST only. Resolved ${target.ref}.`)
  process.exit(1)
}

const db = await target.connect()
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Every /events/<slug> link a page renders, deduped. */
export function eventSlugsIn(html) {
  const seen = new Set()
  for (const m of String(html).matchAll(/\/events\/([a-z0-9][a-z0-9-]{2,})/gi)) {
    seen.add(m[1].toLowerCase())
  }
  return [...seen]
}

async function body(path) {
  try {
    const r = await fetch(BASE + path, { headers: { 'user-agent': 'visibility-drill' } })
    return await r.text()
  } catch {
    return ''
  }
}

const shows = async (path, slug) => eventSlugsIn(await body(path)).includes(slug)

async function latencyToDrop(path, slug) {
  const t0 = Date.now()
  while (Date.now() - t0 < MAX_WAIT_MS) {
    if (!(await shows(path, slug))) return Date.now() - t0
    await sleep(POLL_MS)
  }
  return null
}

// Surfaces: the fixed three plus a sample of every family the sitemap publishes,
// so a new discovery family is picked up without anyone registering it here.
const sitemap = await body('/sitemap.xml')
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => { try { return new URL(m[1]).pathname } catch { return null } })
  .filter(Boolean)

const FAMILIES = ['/city/', '/categories/', '/community/', '/organisers/', '/venues/', '/events/browse/']
const sampled = []
for (const fam of FAMILIES) {
  for (const p of sitemapPaths.filter(p => p.startsWith(fam)).slice(0, 3)) {
    if (!sampled.includes(p)) sampled.push(p)
  }
}
const SURFACES = ['/', '/events', '/sitemap.xml', ...sampled]

const candidates = eventSlugsIn(await body('/events'))
if (candidates.length === 0) {
  console.error('No events rendered on /events. Seed TEST or check the server.')
  process.exit(1)
}
const slug = candidates[0]

const { rows } = await db.query(
  'select id, slug, title, status::text as status, visibility::text as visibility from public.events where slug=$1',
  [slug],
)
if (rows.length === 0) {
  console.error(`DEFECT: /events renders ${slug} but no such row exists in public.events.`)
  process.exit(1)
}
const ev = rows[0]

console.log('')
console.log('='.repeat(78))
console.log('DISCOVERY VISIBILITY DRILL')
console.log('='.repeat(78))
console.log(`target   : ${ev.title}  (${ev.slug})`)
console.log(`state    : status=${ev.status} visibility=${ev.visibility}`)
console.log(`surfaces : ${SURFACES.length} (3 fixed + ${sampled.length} sampled from the sitemap)`)
console.log(`max wait : ${MAX_WAIT_MS / 1000}s per surface, polling every ${POLL_MS / 1000}s`)
console.log('')

const baseline = []
for (const p of SURFACES) {
  if (await shows(p, slug)) baseline.push(p)
}
console.log(`shows it at baseline: ${baseline.length} surface(s)`)
for (const p of baseline) console.log('   ' + p)
if (baseline.length === 0) {
  console.error('Target appears on no surface; nothing to measure.')
  process.exit(1)
}

const SCENARIOS = [
  ['UNPUBLISHED', "update public.events set status='draft' where id=$1"],
  ['CANCELLED', "update public.events set status='cancelled' where id=$1"],
  ['PRIVATE', "update public.events set visibility='private' where id=$1"],
]

const results = []
try {
  for (const [name, sql] of SCENARIOS) {
    console.log('')
    console.log(`--- ${name} ---`)
    await db.query(sql, [ev.id])
    for (const p of baseline) {
      const ms = await latencyToDrop(p, slug)
      console.log('   ' + p.padEnd(40) + (ms === null ? 'NEVER' : ms < 1500 ? 'immediate' : Math.round(ms / 1000) + 's'))
      results.push({ name, path: p, ms })
    }
    await db.query(
      'update public.events set status=$2::event_status, visibility=$3::event_visibility where id=$1',
      [ev.id, ev.status, ev.visibility],
    )
    await sleep(2500)
  }
} finally {
  await db.query(
    'update public.events set status=$2::event_status, visibility=$3::event_visibility where id=$1',
    [ev.id, ev.status, ev.visibility],
  )
  const c = await db.query('select status::text as s, visibility::text as v from public.events where id=$1', [ev.id])
  console.log('')
  console.log(`RESTORED: status=${c.rows[0].s} visibility=${c.rows[0].v}`)
  await db.end()
}

/*
 * THE SITEMAP IS A KNOWN, ACCEPTED RESIDUAL under a DIRECT DATABASE change.
 *
 * /sitemap.xml is a STATIC route with initialRevalidateSeconds 3600. An event
 * mutated through the app clears it immediately, because revalidateEventSurfaces
 * calls revalidatePath('/sitemap.xml') and has done since before this drill
 * existed (tests/unit/events/revalidate-event.test.ts covers it). A row changed
 * by direct SQL, as a purge does, reaches no application code and therefore
 * waits out the hour.
 *
 * It is listed here rather than silently tolerated, so that if it ever needs to
 * become immediate the decision is a visible one.
 */
const ACCEPTED_RESIDUAL = new Set(['/sitemap.xml'])

console.log('')
console.log('='.repeat(78))
console.log('MATRIX (time until the surface stopped rendering the row)')
console.log('='.repeat(78))
console.log('SCENARIO'.padEnd(14) + baseline.map(c => c.slice(0, 22).padEnd(24)).join(''))
for (const [name] of SCENARIOS) {
  const cells = baseline.map(c => {
    const hit = results.find(r => r.name === name && r.path === c)
    if (!hit) return '-'.padEnd(24)
    return (hit.ms === null ? 'NEVER' : hit.ms < 1500 ? 'immediate' : Math.round(hit.ms / 1000) + 's').padEnd(24)
  })
  console.log(name.padEnd(14) + cells.join(''))
}

const leaks = results.filter(r => r.ms === null && !ACCEPTED_RESIDUAL.has(r.path))
const residual = results.filter(r => r.ms === null && ACCEPTED_RESIDUAL.has(r.path))

console.log('')
if (residual.length > 0) {
  console.log(`accepted residual: ${residual.length} pair(s) on ${[...ACCEPTED_RESIDUAL].join(', ')}`)
  console.log('  static route, 1h revalidate, cleared immediately by an in-app mutation.')
}
if (leaks.length > 0) {
  console.error('')
  console.error(`FAIL - ${leaks.length} surface/scenario pair(s) never stopped showing the row:`)
  for (const l of leaks) console.error(`   ${l.name}  ${l.path}`)
  process.exit(1)
}
console.log('PASS - every surface dropped the row, apart from the accepted residual.')
