/**
 * THE LANE C ARTIST FIXTURE, SO THE FOURTH SITEMAP FAMILY IS NOT PROVEN EMPTY.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * `scripts/guards/sitemap-covers-the-catalogue.mjs` judges four row-derived
 * sitemap families by asking the database twice, two different ways, and
 * comparing. On 19 September 2026 the fourth family, artists, answered ZERO on
 * both sides: every event carrying a confirmed lineup on TEST had ended, the
 * most recent the day before.
 *
 * TWO EMPTY SETS ARE EQUAL, AND THAT IS NOT A PASS WORTH HAVING. A comparison
 * over nothing exercises neither query, so the guard could have shipped with the
 * expected side quietly broken and reported "0 artists URL(s), and the database
 * agrees" for as long as the lineup stayed cold. That is precisely the shape of
 * the defect it was written to catch: the venue block published nothing for its
 * whole life and looked exactly like a platform with no venues.
 *
 * So this puts ONE artist on the confirmed lineup of ONE lane C event that has
 * not happened yet, which makes both sides non-empty and makes the agreement
 * mean something.
 *
 * ============================================================================
 * WHAT IT WILL NOT DO
 * ============================================================================
 *
 *   - It refuses any project that is not TEST vkapkibzokmfaxqogypq, by name,
 *     before it writes anything.
 *   - It never creates an event. It ENUMERATES an existing lane C event that is
 *     published, public and still inside the listing window, and attaches to
 *     that. Nothing tagged for another lane is read, written or reused.
 *   - It never prints a key.
 *   - It is idempotent: fixed ids, upserted, so a second run changes nothing.
 *   - It verifies by OBSERVING, through the shipped reader
 *     (`readArtistCatalogue`), rather than by trusting its own two writes.
 *
 * Run:
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/ops/seed-artist-sitemap-fixture.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { readArtistCatalogue } from '@/lib/seo/sitemap-catalogue'
import { isStillListed } from '@/lib/events/listing-window'

/*
 * THE SHARED PREFLIGHT RUNS FIRST, BEFORE THIS FILE'S OWN REFUSAL.
 *
 * The named check below is stricter about WHICH non-production project it will
 * accept (it demands TEST by ref), but the shared one is stricter in the
 * direction that matters more: it fails CLOSED when it cannot tell what it is
 * pointed at, and it strips VERCEL_ENV so a stray variable in a shell cannot buy
 * a script the production exemption. A hand-rolled refusal is a second copy of a
 * rule that already exists, and this repository has the scar to prove what those
 * cost. `no-unguarded-production-write` caught the first version of this file
 * for exactly that reason and it was right to.
 */
assertNotProduction()

const TAG = '[seed-artist-sitemap-fixture]'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_REF = 'gndnldyfudbytbboxesk'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/* -------------------------------------------------------------- the refusal */

if (!URL_BASE || !KEY) {
  console.error(`${TAG} REFUSED: no NEXT_PUBLIC_SUPABASE_URL or no SUPABASE_SERVICE_ROLE_KEY in this environment.`)
  process.exit(2)
}
if (URL_BASE.includes(PROD_REF)) {
  console.error(`${TAG} REFUSED: that is PRODUCTION (${PROD_REF}). This script writes rows and production writes are the owner's.`)
  process.exit(2)
}
if (!URL_BASE.includes(TEST_REF)) {
  console.error(`${TAG} REFUSED: the project is not TEST ${TEST_REF}. Nothing was written.`)
  process.exit(2)
}

/**
 * The fixture's own identity. FIXED, so re-running is a no-op rather than a
 * second artist, and `lane-c` so it is this lane's on sight.
 */
const ARTIST_ID = 'c1a11e0c-1a11-4c11-9c11-5171e0c0a571'
const ARTIST_SLUG = 'lane-c-sitemap-proof'
const ARTIST_NAME = 'Lane C Sitemap Proof'
const LINEUP_ID = 'c1a11e0c-1a11-4c11-9c11-5171e0c0a572'

const headers = {
  apikey: KEY,
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
}

async function read(query) {
  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, { headers })
  const body = await res.text()
  if (!res.ok) throw new Error(`read ${query.split('?')[0]} answered ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}

async function upsert(table, row) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`upsert ${table} answered ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}

/* ------------------------------------------------- enumerate, never guess */

/*
 * THE EVENT IS FOUND, NOT NAMED. The standing rule in CLOSE-OUT.md is that a
 * slug, a route or an id is enumerated from the database and never guessed,
 * because guessing one once produced both a 404 and a false pass. So this asks
 * for lane C's published public events and picks the first one the platform's
 * OWN listing rule still considers listed. If none is, it says so and stops
 * rather than attaching an artist to a night that has already happened, which
 * would seed the exact orphan the guard exists to refuse.
 */
const candidates = await read(
  'events?select=id,slug,start_date,end_date,timezone&status=eq.published&visibility=eq.public&slug=like.*lane-c*&order=start_date.asc',
)
const now = new Date()
const host = candidates.find(e => typeof e.start_date === 'string' && isStillListed(e, now))

if (!host) {
  console.error(
    `${TAG} REFUSED: none of the ${candidates.length} published public lane-c event(s) is still inside the listing ` +
      `window, so there is no event a visitor could reach an artist through. Seed a future-dated lane-c event first. ` +
      `Nothing was written.`,
  )
  process.exit(1)
}

console.log(`${TAG} host event enumerated: ${host.slug} (starts ${host.start_date})`)

/* ------------------------------------------------------------- the two writes */

await upsert('artists', {
  id: ARTIST_ID,
  slug: ARTIST_SLUG,
  name: ARTIST_NAME,
  bio: 'A lane C fixture performer. Exists so the artist family of the sitemap guard compares two non-empty sets.',
  genres: ['electronic'],
  performance_types: ['dj'],
  available_for_booking: false,
  draw_consent: false,
})

await upsert('event_artists', {
  id: LINEUP_ID,
  event_id: host.id,
  artist_id: ARTIST_ID,
  status: 'confirmed',
  billing_order: 0,
})

/* ----------------------------------------------------- verify by observing */

/*
 * THE WRITES ARE NOT THE PROOF. Two 201s mean two requests were accepted; they
 * say nothing about whether the shipped reader now publishes this artist, which
 * is the only fact this fixture exists to create. So the reader is run and its
 * answer is read.
 */
const published = await readArtistCatalogue()
if (published.error) {
  console.error(`${TAG} FAIL: the shipped reader errored after the writes: ${published.error}`)
  process.exit(1)
}
const wanted = `/artists/${ARTIST_SLUG}`
const paths = published.rows.map(r => r.path)
if (!paths.includes(wanted)) {
  console.error(`${TAG} FAIL: the writes were accepted and ${wanted} is STILL not published. Reader returned: ${paths.join(', ') || '(nothing)'}`)
  process.exit(1)
}

console.log(`${TAG} OK: ${wanted} is published by readArtistCatalogue, from ${published.rows.length} artist row(s) total.`)
console.log(`${TAG} observed, not assumed: ${paths.join(', ')}`)
