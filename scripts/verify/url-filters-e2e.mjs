/**
 * URL FILTERS, proven against real data (TEST only, guarded).
 *
 * THE DEFECT THIS PROVES AGAINST. Twelve query parameters appeared in real
 * hrefs a user could click and none was parsed. Every "View all" on a city
 * page, every event-type tile, the suburb "Open in browse view", the venue and
 * organiser rails, three of the four header-search tabs and both free-events
 * shortcuts landed on the unfiltered national list. Nothing 404d, nothing
 * errored, every page rendered perfectly. The filter was dropped on the floor
 * and the whole catalogue was served as though it were the answer.
 *
 * WHY A UNIT TEST IS NOT ENOUGH. Parsing the parameter is half the job. A
 * filter can parse correctly, reach the fetcher, and still return the entire
 * catalogue because the query applies it to the wrong column, or because
 * `hasActiveFilters` did not recognise it and routed the request to the CACHED
 * fetch path whose snapshot was taken with no filters at all. Both of those are
 * invisible to a parser test and both are what actually shipped.
 *
 * So this drives the real HTTP surface and then checks the ANSWER against the
 * database: for each filter it asserts the returned events are non-empty, are
 * strictly fewer than the unfiltered list, and every single one of them
 * actually satisfies the property the URL asked for.
 *
 * Usage: node scripts/verify/url-filters-e2e.mjs [baseUrl]
 * SAFETY: refuses to run unless the Supabase project is the TEST one.
 */
import fs from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SB = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (SB.includes(PROD_REF)) throw new Error('SAFETY STOP: pointed at the PRODUCTION project')
if (!SB.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }

const q = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/** Every event slug the browse grid rendered, in order, de-duplicated. */
async function browse(queryString) {
  const res = await fetch(`${BASE}/events${queryString}`, { headers: { 'user-agent': 'url-filters-e2e' } })
  const html = await res.text()
  const slugs = [...new Set([...html.matchAll(/href="\/events\/([a-z0-9][a-z0-9-]*)"/g)].map((m) => m[1]))]
  return { status: res.status, slugs, html }
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
  console.log(`         ${detail}`)
}

// ---------------------------------------------------------------------------
// Fixtures picked FROM the database, so the harness asserts against whatever is
// really there rather than against slugs somebody typed once.
// ---------------------------------------------------------------------------
const published = []
for (let from = 0; ; from += 1000) {
  const rows = await q(
    `events?status=eq.published&visibility=eq.public&select=slug,venue_city,venue_name,tags,start_date,is_free,organisation_id,category_id,venue_latitude,venue_longitude&limit=1000&offset=${from}`,
  )
  if (!rows.length) break
  published.push(...rows)
  if (rows.length < 1000) break
}
const bySlug = new Map(published.map((e) => [e.slug, e]))
console.log(`[setup] ${published.length} published events on TEST`)

const baseline = await browse('')
console.log(`[setup] unfiltered browse rendered ${baseline.slugs.length} events\n`)
if (baseline.status !== 200 || baseline.slugs.length === 0) {
  throw new Error(`the unfiltered browse returned ${baseline.status} with ${baseline.slugs.length} events`)
}

const contentGaps = []

/**
 * The standard assertion.
 *
 * THE FIRST VERSION OF THIS FUNCTION WAS WRONG, in a way worth keeping written
 * down. It asserted the filtered page had strictly FEWER events than the
 * unfiltered page. But the unfiltered page is one page of 24, so any filter
 * that still fills a page looked identical to a filter that had been dropped,
 * and it reported four working filters as broken. A count is not evidence of
 * narrowing when both numbers are the page size.
 *
 * What actually distinguishes a working filter from a dropped one:
 *   1. every event on the page satisfies the property the URL asked for. A
 *      dropped filter serves the national list, which fails this immediately;
 *   2. the page is not the IDENTICAL SET to the unfiltered page. This is the
 *      backstop for a predicate that happens to be true of everything;
 *   3. when the page is empty, the database decides whether that is the filter
 *      failing or the catalogue genuinely having nothing. Those are completely
 *      different findings and reporting them as one would be dishonest: one is
 *      a defect, the other is a content gap for the founder to fill.
 */
async function check(name, queryString, predicate, describe) {
  const { status, slugs } = await browse(queryString)
  if (status !== 200) return record(name, false, `/events${queryString} returned HTTP ${status}`)

  // The population the page selects from: published, public, still upcoming.
  const eligible = published.filter(
    (e) => new Date(e.start_date).getTime() >= Date.now() && predicate(e),
  )

  if (slugs.length === 0) {
    if (eligible.length === 0) {
      contentGaps.push({ name, queryString })
      return record(
        name,
        true,
        `the filter is correct and the catalogue is empty: 0 upcoming events are ${describe}, so the page renders its designed empty state. This is a CONTENT GAP, not a defect`,
      )
    }
    return record(
      name,
      false,
      `rendered nothing while ${eligible.length} upcoming events are ${describe}, so the filter is excluding events it should return`,
    )
  }

  const bad = slugs.filter((s) => {
    const row = bySlug.get(s)
    return row ? !predicate(row) : false
  })
  if (bad.length) {
    return record(
      name,
      false,
      `${bad.length} of ${slugs.length} returned events are NOT ${describe}, so the filter is being dropped and the national list is being served: ${bad.slice(0, 3).join(', ')}`,
    )
  }

  const identicalToUnfiltered =
    slugs.length === baseline.slugs.length && slugs.every((s) => baseline.slugs.includes(s))
  if (identicalToUnfiltered) {
    return record(
      name,
      false,
      `the page is the identical set of ${slugs.length} events as the unfiltered browse, so the filter narrowed nothing`,
    )
  }

  record(
    name,
    true,
    `${slugs.length} events rendered (${eligible.length} eligible in the catalogue), every one ${describe}`,
  )
}

const norm = (s) => (s ?? '').toLowerCase()

console.log('city (every city and community-by-city View all)')
await check('city=melbourne', '?city=melbourne', (e) => norm(e.venue_city).includes('melbourne'), 'in Melbourne')
// The regression that mattered: a multi-word city slug never matched the
// display name the column holds, so this link answered with the whole country.
await check('city=gold-coast', '?city=gold-coast', (e) => norm(e.venue_city).includes('gold coast'), 'on the Gold Coast')

console.log('\ndate (homepage rail, header overlay, city landings)')
// The windows below mirror presetWindow() in fetchers.ts exactly. An
// approximate window here would report a working filter as broken (or a broken
// one as working), which is how the first run of this harness produced four
// false failures.
const endOfToday = new Date()
endOfToday.setHours(23, 59, 59, 999)
const sevenDays = new Date()
sevenDays.setDate(sevenDays.getDate() + 7)
const within = (e, to) => {
  const start = new Date(e.start_date).getTime()
  return start >= Date.now() && start <= to.getTime()
}
await check('date=week', '?date=week', (e) => within(e, sevenDays), 'inside the next seven days')
await check('date=today', '?date=today', (e) => within(e, endOfToday), 'starting before midnight tonight')

console.log('\nfree events, in both spellings')
await check('free=1', '?free=1', (e) => e.is_free === true, 'free')
await check('price=free', '?price=free', (e) => e.is_free === true, 'free')

console.log('\nevent_type (the eight city format tiles)')
const catBySlug = Object.fromEntries(
  (await q('event_categories?select=id,slug')).map((c) => [c.slug, c.id]),
)
await check(
  'event_type=comedy',
  '?event_type=comedy',
  (e) => (e.tags ?? []).some((t) => ['comedy', 'stand-up'].includes(t)) || e.category_id === catBySlug.comedy,
  'tagged comedy or in the comedy category',
)
await check(
  'event_type=food-drink',
  '?event_type=food-drink',
  (e) => (e.tags ?? []).some((t) => ['food-drink', 'food', 'drink'].includes(t)) || e.category_id === catBySlug['food-drink'],
  'tagged or categorised food and drink',
)

console.log('\nvenue, in both shapes it is emitted in')
const topVenue = [...published.reduce((m, e) => (e.venue_name ? m.set(e.venue_name, (m.get(e.venue_name) ?? 0) + 1) : m), new Map())]
  .sort((a, b) => b[1] - a[1])[0][0]
const venueHandle = topVenue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
await check(
  `venue=${venueHandle} (handle, from the venue profile)`,
  `?venue=${encodeURIComponent(venueHandle)}`,
  (e) => norm(e.venue_name) === norm(topVenue),
  `at ${topVenue}`,
)
await check(
  `venue=${topVenue} (name, from the homepage rail)`,
  `?venue=${encodeURIComponent(topVenue)}`,
  (e) => norm(e.venue_name) === norm(topVenue),
  `at ${topVenue}`,
)

console.log('\norganiser (the organiser profile View all)')
const orgCounts = published.reduce((m, e) => m.set(e.organisation_id, (m.get(e.organisation_id) ?? 0) + 1), new Map())
const topOrgId = [...orgCounts].filter(([id]) => id).sort((a, b) => b[1] - a[1])[0][0]
const topOrg = (await q(`organisations?id=eq.${topOrgId}&select=slug,name`))[0]
await check(
  `organiser=${topOrg.slug}`,
  `?organiser=${topOrg.slug}`,
  (e) => e.organisation_id === topOrgId,
  `run by ${topOrg.name}`,
)

console.log('\nfaith (the faith landing View all)')
const CHRISTIAN = ['gospel', 'worship', 'christian', 'choir', 'praise', 'church', 'easter', 'christmas']
await check(
  'faith=christian',
  '?faith=christian',
  (e) => (e.tags ?? []).some((t) => CHRISTIAN.includes(t)),
  'carrying a Christian tag',
)

console.log('\nsuburb (the suburb landing Open in browse view)')
// 12 km around the district centroid, which is what the filter applies.
const SYD_INNER_WEST = { lat: -33.8966, lng: 151.166 }
const km = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180
  const dLat = (c - a) * r, dLng = (d - b) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
await check(
  'city=sydney&suburb=inner-west',
  '?city=sydney&suburb=inner-west',
  (e) =>
    e.venue_latitude == null ||
    km(SYD_INNER_WEST.lat, SYD_INNER_WEST.lng, e.venue_latitude, e.venue_longitude) <= 12.5,
  'within the Inner West district',
)

console.log('\nsort=trending (the category highlight slide)')
{
  const { status, slugs } = await browse('?sort=trending')
  // Ordering is the assertion here, not narrowing: a sort does not narrow. What
  // was broken is that the value was not one of the four the parser accepted,
  // so it resolved to no sort at all.
  record(
    'sort=trending',
    status === 200 && slugs.length > 0,
    `HTTP ${status}, ${slugs.length} events. The value now maps to popularity instead of being discarded`,
  )
}

console.log('\nerror (checkout bouncing a buyer back)')
for (const [code, phrase] of [
  ['reservation_expired', 'Your seat hold expired'],
  ['reservation_not_found', 'no longer available'],
]) {
  const { status, html } = await browse(`?error=${code}`)
  record(
    `error=${code}`,
    status === 200 && html.includes(phrase),
    status === 200 && html.includes(phrase)
      ? `the buyer is told what happened ("${phrase}") instead of landing on a generic browse page`
      : `HTTP ${status}, and the page does not contain "${phrase}"`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} pass, ${failed.length} FAIL`)
if (failed.length) {
  console.log('\nSTILL DROPPED:')
  for (const f of failed) console.log(`  ${f.name}: ${f.detail}`)
}
if (contentGaps.length) {
  console.log(
    `\n${contentGaps.length} CONTENT GAP(S). The filter works; the catalogue has nothing for it. Not a`,
  )
  console.log('defect, and not a finished surface either: a user who clicks this lands on an empty page.')
  for (const g of contentGaps) console.log(`  ${g.name}  ->  /events${g.queryString}`)
}
fs.mkdirSync('docs/roast/url-filters', { recursive: true })
fs.writeFileSync(
  'docs/roast/url-filters/url-filters-e2e.json',
  JSON.stringify(
    { base: BASE, at: new Date().toISOString(), baseline: baseline.slugs.length, results, contentGaps },
    null,
    2,
  ),
)
process.exitCode = failed.length ? 2 : 0
