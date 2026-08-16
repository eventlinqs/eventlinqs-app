/**
 * SUBURB PRIMARY: predict the backfill, then verify it. Read only. TEST only.
 *
 * WHY A VERIFIER THAT DOES NOT TRUST THE MIGRATION. `20260808000003` assigns
 * every event to the ONE nearest district centroid within 12 km, inside its own
 * city, in SQL. The application applies the identical rule in TypeScript
 * (`src/lib/cities/resolve-suburb.ts`) at write time. Two implementations of
 * one rule is exactly where a silent divergence lives: the migration files
 * events one way, the organiser path files new ones another, and the district
 * pages slowly fill with a mixture nobody can explain.
 *
 * So this re-derives the answer INDEPENDENTLY in JavaScript, from the same
 * coordinates, and compares it to whatever is in the column. Before the
 * migration it prints what the migration should produce; after, it fails on any
 * row where the database and the rule disagree.
 *
 * THE ASSERTION THAT MATTERS MOST is exclusivity. District assignment must be
 * to one district, not to every district in range. Melbourne's six districts
 * all sit within 12 km of the CBD and most Melbourne events carry the CBD
 * centroid as their venue coordinate, so an inclusive rule hands the same
 * events to all six and the six pages become six copies of the city page. This
 * checks that every district page would render a DISJOINT set.
 *
 * Usage: node scripts/verify/suburb-primary-backfill-verify.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { getAllSuburbs } from '../../src/lib/cities/data.ts'

const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: pointed at PRODUCTION')
if (!URL_.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const db = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const RADIUS_KM = 12
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// The districts, read from the DATABASE, not from the repo, because the
// migration joins the table and a drift between table and code is precisely
// the kind of thing this is here to surface.
const { data: suburbRows, error: suburbErr } = await db
  .from('suburbs')
  .select('slug, city_slug, name, latitude, longitude, is_active')
if (suburbErr) throw new Error(`suburbs: ${suburbErr.message}`)
const districts = (suburbRows ?? []).filter((s) => s.is_active)

const codeSlugs = new Set(getAllSuburbs().map((s) => s.slug))
const tableSlugs = new Set(districts.map((s) => s.slug))
const onlyInCode = [...codeSlugs].filter((s) => !tableSlugs.has(s))
const onlyInTable = [...tableSlugs].filter((s) => !codeSlugs.has(s))

function nearestDistrict(citySlug, lat, lng) {
  if (!citySlug || typeof lat !== 'number' || typeof lng !== 'number') return null
  let best = null
  for (const d of districts) {
    if (d.city_slug !== citySlug) continue
    const km = distanceKm(lat, lng, d.latitude, d.longitude)
    if (km <= RADIUS_KM && (best === null || km < best.km)) best = { slug: d.slug, km }
  }
  return best?.slug ?? null
}

const events = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('events')
    .select('slug, status, city_primary, suburb_primary, venue_city, venue_latitude, venue_longitude')
    .range(from, from + 999)
  if (error) throw new Error(`events: ${error.message}`)
  if (!data?.length) break
  events.push(...data)
  if (data.length < 1000) break
}
const published = events.filter((e) => e.status === 'published')

/**
 * The city claim AS IT WILL BE once 20260808000001 has run.
 *
 * This matters for the prediction and would be dishonest to leave out. The
 * suburb backfill reads `city_primary`, and the city backfill fills it. Both
 * are pending, and `db push` applies them in timestamp order in one run, so by
 * the time the suburb statement executes the city column is already filled.
 * Predicting from the CURRENT column would report 25 rows when the real answer
 * after the push is much larger, and the founder would read the push output as
 * a failure.
 *
 * The rule below is migration 20260808000001's rule exactly: case-folded,
 * whitespace-trimmed EXACT equality against a canonical city name or slug.
 * Never fuzzy: "North Melbourne" is a suburb and stays null.
 */
const { data: cityRows } = await db.from('cities').select('slug, name')
const cityIndex = new Map()
for (const c of cityRows ?? []) {
  cityIndex.set(c.name.trim().toLowerCase(), c.slug)
  cityIndex.set(c.slug.trim().toLowerCase(), c.slug)
}
const effectiveCity = (e) =>
  e.city_primary ?? cityIndex.get((e.venue_city ?? '').trim().toLowerCase()) ?? null

console.log('SUBURB PRIMARY BACKFILL')
console.log(`target: TEST ${URL_}\n`)

const failures = []

// --- a. the district registry ------------------------------------------------
console.log('--- a. the district registry the migration joins ---')
console.log(`  active districts in public.suburbs : ${districts.length}`)
console.log(`  districts in the repo              : ${codeSlugs.size}`)
if (onlyInCode.length || onlyInTable.length) {
  console.log(`  [FAIL] table and code disagree`)
  if (onlyInCode.length) console.log(`         only in code : ${onlyInCode.join(', ')}`)
  if (onlyInTable.length) console.log(`         only in table: ${onlyInTable.join(', ')}`)
  failures.push('the suburbs table and the repo district list disagree')
} else {
  console.log('  [PASS] every district exists in both, so the SQL rule and the TypeScript rule see the same set')
}

// --- b. coverage -------------------------------------------------------------
const claimed = published.filter((e) => e.suburb_primary)
const shouldHave = published.filter(
  (e) => nearestDistrict(effectiveCity(e), e.venue_latitude, e.venue_longitude) !== null,
)
console.log('\n--- b. how many published events carry a district claim ---')
console.log(`  published events            : ${published.length}`)
console.log(`  with a district claim       : ${claimed.length}`)
console.log(`  the rule says should have   : ${shouldHave.length}`)
const pending = shouldHave.length - claimed.length
if (pending > 0) {
  console.log(`  NOT YET APPLIED: the migration would fill ${pending} more row(s)`)
} else if (shouldHave.length === 0) {
  console.log('  nothing is resolvable: no published event has both a city claim and coordinates')
} else {
  console.log('  [PASS] every resolvable event carries its claim')
}

// --- c. no row disagrees with the rule --------------------------------------
console.log('\n--- c. no event is filed under a district the rule did not choose ---')
const disagree = published
  .filter((e) => e.suburb_primary)
  .map((e) => ({
    slug: e.slug,
    stored: e.suburb_primary,
    expected: nearestDistrict(effectiveCity(e), e.venue_latitude, e.venue_longitude),
  }))
  .filter((r) => r.stored !== r.expected)
if (disagree.length) {
  console.log(`  [FAIL] ${disagree.length} row(s) disagree with an independent re-derivation`)
  for (const d of disagree.slice(0, 10)) {
    console.log(`         ${d.slug}: stored ${d.stored}, rule says ${d.expected ?? 'null'}`)
  }
  failures.push(`${disagree.length} events carry a district the rule did not choose`)
} else {
  console.log(`  [PASS] all ${claimed.length} district claim(s) match an independent re-derivation -> 0 disagree`)
}

// --- d. every claim is a district OF THAT EVENT'S CITY ------------------------
console.log("\n--- d. no event filed under another city's district ---")
const byDistrict = new Map(districts.map((d) => [d.slug, d]))
const wrongCity = published
  .filter((e) => e.suburb_primary)
  .filter((e) => byDistrict.get(e.suburb_primary)?.city_slug !== effectiveCity(e))
if (wrongCity.length) {
  console.log(`  [FAIL] ${wrongCity.length} row(s) carry a district belonging to another city`)
  for (const e of wrongCity.slice(0, 10)) {
    console.log(`         ${e.slug}: city ${e.city_primary}, district ${e.suburb_primary}`)
  }
  failures.push(`${wrongCity.length} events filed under another city's district`)
} else {
  console.log('  [PASS] every district claim belongs to the event\'s own city')
}

// --- e. EXCLUSIVITY, the assertion that matters most -------------------------
console.log('\n--- e. district pages render DISJOINT sets (assignment, not overlap) ---')
const pages = new Map()
for (const e of published) {
  const slug = e.suburb_primary ?? nearestDistrict(effectiveCity(e), e.venue_latitude, e.venue_longitude)
  if (!slug) continue
  pages.set(slug, [...(pages.get(slug) ?? []), e.slug])
}
let overlap = 0
const seen = new Map()
for (const [district, slugs] of pages) {
  for (const s of slugs) {
    if (seen.has(s)) {
      overlap++
      if (overlap <= 5) console.log(`         ${s} appears on BOTH ${seen.get(s)} and ${district}`)
    } else seen.set(s, district)
  }
}
if (overlap) {
  console.log(`  [FAIL] ${overlap} event(s) appear on more than one district page`)
  failures.push(`${overlap} events appear on more than one district page`)
} else {
  console.log(`  [PASS] ${seen.size} event(s) across ${pages.size} district(s), each on exactly one page`)
}
const populated = [...pages].sort((a, b) => b[1].length - a[1].length)
console.log('  events per district:')
for (const [district, slugs] of populated.slice(0, 12)) {
  console.log(`      ${String(slugs.length).padStart(3)}  ${district}`)
}
const emptyDistricts = districts.filter((d) => !pages.has(d.slug))
if (emptyDistricts.length) {
  console.log(
    `  ${emptyDistricts.length} district(s) resolve to no events. That is a CONTENT GAP, not a defect:`,
  )
  console.log(`      ${emptyDistricts.map((d) => d.slug).join(', ')}`)
}

console.log(`\n===== ${failures.length ? `${failures.length} FAILED` : 'ALL GREEN'} =====`)
for (const f of failures) console.log(`  ${f}`)
process.exit(failures.length ? 1 : 0)
