/**
 * LB-PROOFCOUNT. THE PLATFORM'S OWN SOCIAL PROOF COUNTED A THOUSAND-ROW SAMPLE
 * AND PRINTED IT BESIDE A TRUE TOTAL.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and why it has to seed before it can drive.
 *
 * `/organisers` carries a live proof strip: "N events live right now, across C
 * Australian cities, from O organisers". Until this item, `getPlatformStats`
 * asked the server for `{ count: 'exact' }` and then deduped the BODY of that
 * same response for C and O. The header is true at any size; the body stops at
 * the project's row ceiling, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * So past a thousand published events that one sentence describes two different
 * catalogues, and CLAUDE.md Law 4 governs this surface by name: "Social proof
 * uses real platform truths only. Never fabricate numbers."
 *
 * THE DEFECT IS INVISIBLE UNDER THE CEILING. TEST holds 285 published events,
 * so every number on the page is correct today and no drive against the
 * catalogue as it stands could tell the two versions apart. This one therefore
 * SEEDS past the ceiling, drives, and tears down in a finally.
 *
 * THE SEED IS BUILT SO TRUNCATION MUST SHOW, with no assumption about WHICH
 * rows the server drops. Every seeded event carries its own organisation and
 * its own city, and enough are added that all three totals pass 1,000. A
 * 1,000-row sample can hold at most 1,000 distinct values, so a short read is
 * arithmetically forced to under-report, whatever order the rows come back in.
 *
 * IT DOES NOT TAKE THE DEFECT ON TRUST EITHER. Before driving, it reads the
 * events table through the REST endpoint with no bound, exactly as the old
 * resolver did, and dedupes what comes back. That is the number the page WOULD
 * have printed, measured on the real server rather than argued.
 *
 * BLAST RADIUS, kept small on purpose. Two other lanes build against this same
 * TEST project. Every seeded row is named lane-b-proofcount-* and every seeded
 * event is dated more than a year in the past, so the discovery surfaces, which
 * all filter on start_date, do not show them. The window is the length of one
 * drive and the teardown runs in a finally.
 *
 * RUN IT:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/lb-proofcount-drive.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-PROOFCOUNT'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

/** How many events and organisations to add so all three totals pass 1,000. */
const SEED = 1000
const TAG = 'lane-b-proofcount'
const CEILING = 1000
const OWNER = '00000000-0000-4000-8000-000000000001'
/** A cover this project already serves; see the note at the seed's use of it. */
const COVER =
  'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/' +
  '42c2dd5e-95ab-41dd-9aaf-2adbeaa25289/eb7f0fc7-dcc4-48d9-b525-735bfaddc179/1788535239380-7904517a.jpg'

const results = []
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' - ' + detail : ''))
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  throw new Error('refusing to run: this is not the TEST project, it is ' + url)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * The catalogue as the anon client sees it, which is what the page counts:
 * the RLS policies on `events` grant SELECT on published rows whose visibility
 * is public or unlisted. Read through the same paging the product uses, so the
 * ground truth is not itself capped at a thousand.
 */
async function truth() {
  const rows = []
  let from = 0
  for (;;) {
    const page = await db
      .from('events')
      .select('organisation_id, venue_city')
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .order('id', { ascending: true })
      .range(from, from + CEILING - 1)
    if (page.error) throw new Error('truth read failed: ' + page.error.message)
    const batch = page.data ?? []
    if (batch.length === 0) break
    rows.push(...batch)
    from += batch.length
  }
  return {
    events: rows.length,
    organisers: new Set(rows.map(r => r.organisation_id).filter(Boolean)).size,
    cities: new Set(rows.map(r => (r.venue_city ?? '').trim().toLowerCase()).filter(Boolean)).size,
  }
}

/** Exactly what the old resolver did: one unbounded read, dedupe the body. */
async function whatTheOldShapeWouldPrint() {
  const endpoint =
    url +
    '/rest/v1/events?select=organisation_id,venue_city&status=eq.published&visibility=in.(public,unlisted)'
  const res = await fetch(endpoint, {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, Prefer: 'count=exact' },
  })
  const body = await res.json()
  const range = res.headers.get('content-range') ?? ''
  return {
    status: res.status,
    rowsInBody: Array.isArray(body) ? body.length : -1,
    contentRange: range,
    headerTotal: Number(range.split('/')[1] ?? 'NaN'),
    organisers: new Set(body.map(r => r.organisation_id).filter(Boolean)).size,
    cities: new Set(body.map(r => (r.venue_city ?? '').trim().toLowerCase()).filter(Boolean)).size,
  }
}

/**
 * THE ROW LITERALS SIT AT THE `.insert(` CALL, INSIDE THE `.map(`, ON PURPOSE.
 * `scripts/guards/fixtures-are-not-published.mjs` judges the row a drive writes
 * and reports a write it cannot read rather than trusting it. A seed built into
 * a variable and inserted by name is exactly that unreadable write, so the
 * shape stays where the guard can see the `status` and the `visibility` it
 * cares about.
 */
async function seed() {
  for (let i = 0; i < SEED; i += 500) {
    const batch = Array.from({ length: Math.min(500, SEED - i) }, (_, k) => i + k + 1)
    const { error } = await db
      .from('organisations')
      .insert(
        batch.map(n => ({
          name: 'lane-b proofcount org ' + n,
          slug: TAG + '-org-' + n,
          owner_id: OWNER,
          status: 'pending',
        })),
      )
      .select('id')
    if (error) throw new Error('org seed failed: ' + error.message)
  }
  const { data: made, error: readBack } = await db
    .from('organisations')
    .select('id, slug')
    .like('slug', TAG + '-org-%')
    .order('slug', { ascending: true })
    .range(0, SEED - 1)
  if (readBack) throw new Error('org read-back failed: ' + readBack.message)

  const start = new Date(Date.now() - 400 * 86400000).toISOString()
  const end = new Date(Date.now() - 399 * 86400000).toISOString()
  for (let i = 0; i < made.length; i += 500) {
    const batch = made.slice(i, i + 500)
    const { error } = await db
      .from('events')
      .insert(
        batch.map((o, k) => ({
          title: 'lane-b proofcount event ' + (i + k + 1),
          slug: TAG + '-event-' + (i + k + 1),
          organisation_id: o.id,
          created_by: OWNER,
          start_date: start,
          end_date: end,
          status: 'published',
          /*
     * UNLISTED, NOT PUBLIC, AND IT IS THE RIGHT VISIBILITY RATHER THAN A WAY
     * ROUND A GUARD. `scripts/guards/fixtures-are-not-published.mjs` refuses a
     * drive that creates public fixtures because `src/app/sitemap.ts` publishes
     * them and the drive then deletes them, which is how lane B's own PL1 drive
     * refused lane A's push on 14 September over URLs lane A had never heard
     * of. A thousand of them would have been a thousand such URLs.
     *
     * It costs this drive nothing, because the thing under test is what the
     * anon client COUNTS, and the RLS policy "Unlisted published events are
     * viewable" grants anon SELECT on exactly these rows. `PUBLIC_EVENT_MATCH`
           * excludes them, so the sitemap never sees them: the seed is counted
           * and not indexed, which is precisely what this drive wants.
           */
          visibility: 'unlisted',
          venue_city: 'Lane B Proofcount City ' + (i + k + 1),
          /*
           * `events_published_real_cover` only binds a PUBLIC row, so an
           * unlisted fixture does not need one. It carries a real cover anyway,
           * one this project already serves for 31 of its own published events,
           * so the seeded rows differ from real ones only in being unlisted.
           */
          cover_image_url: COVER,
        })),
      )
      .select('id')
    if (error) throw new Error('event seed failed: ' + error.message)
  }
  return { orgs: made.length, events: made.length }
}

/**
 * A TEARDOWN IS BATCHED AND VERIFIED, NOT ONE BIG DELETE.
 *
 * The first version issued `delete().like('slug', ...)` once per table and
 * trusted the absence of an error. On 21 September 2026 two of the three came
 * back "canceling statement due to statement timeout" and the drive left a
 * thousand events and a thousand organisations on a TEST project two other
 * lanes were building against, having already printed its own teardown as
 * done. A thousand rows is one statement to Postgres and it is not a small
 * one: deleting an event fires `events_record_tombstone`, and an organisation
 * has cascades behind it, which is why organisations need a far smaller batch
 * than events do. Those sizes are measured, not guessed: 100 organisations in
 * one statement timed out and 10 did not.
 *
 * Deleting an event WRITES a tombstone, so the teardown has to clear what its
 * own deletes produced, and `event_tombstones` is keyed by slug because it has
 * no id column.
 *
 * Every purge ends by asking the database, and a purge that cannot finish says
 * so instead of returning quietly.
 */
async function purge(table, key, matchOn, pattern, batch) {
  for (let round = 0; round < 500; round += 1) {
    const { data, error } = await db.from(table).select(key).like(matchOn, pattern).limit(batch)
    if (error) return table + ': SELECT FAILED ' + error.message
    if (!data || data.length === 0) return table + ': clear after ' + round + ' batch(es) of ' + batch
    const { error: delErr } = await db.from(table).delete().in(key, data.map(r => r[key]))
    if (delErr) return table + ': DELETE FAILED ' + delErr.message
  }
  return table + ': NOT CLEAR after 500 batches'
}

async function teardown() {
  return [
    await purge('events', 'id', 'slug', TAG + '-event-%', 100),
    await purge('event_tombstones', 'slug', 'slug', TAG + '-event-%', 150),
    await purge('organisations', 'id', 'slug', TAG + '-org-%', 10),
  ]
}

/** The strip sentence, found by its own words rather than by a class name. */
async function readStrip(page) {
  const text = await page.locator('p', { hasText: 'events live right now' }).first().innerText()
  const numbers = (text.match(/[0-9][0-9,]*/g) ?? []).map(n => Number(n.split(',').join('')))
  return { text: text.split(/[ \t\r\n]+/).join(' ').trim(), numbers }
}

appendFileSync(LOG, '\n===== LB-PROOFCOUNT drive ' + new Date().toISOString() + ' =====\n')
log('base ' + BASE)
log('supabase ' + url)

const browser = await chromium.launch()
let seeded = false
try {
  // ---- preflight ---------------------------------------------------------
  const { count: strays } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('slug', TAG + '-%')
  check('TEST carries no lane-b-proofcount rows before this drive', (strays ?? 0) === 0, 'found ' + (strays ?? 0))

  const before = await truth()
  log('  BEFORE: ' + before.events + ' events, ' + before.organisers + ' organisers, ' + before.cities + ' cities')
  check(
    'the catalogue starts BELOW the row ceiling, so the defect is invisible without a seed',
    before.events < CEILING,
    before.events + ' published events, ceiling ' + CEILING,
  )

  /*
   * ---- seed --------------------------------------------------------------
   * ARMED BEFORE THE SEED RUNS, NOT AFTER IT. The first run of this drive set
   * this flag after both inserts returned, so when the second insert was
   * refused by `events_published_real_cover` the finally decided nothing had
   * been seeded and left a thousand organisations on a TEST project two other
   * lanes are building against. A teardown that only runs on the happy path is
   * not a teardown.
   */
  seeded = true
  const made = await seed()
  log('  seeded ' + made.orgs + ' organisations and ' + made.events + ' published events, each with its own city')

  const after = await truth()
  log('  AFTER : ' + after.events + ' events, ' + after.organisers + ' organisers, ' + after.cities + ' cities')
  const totals = [['events', after.events], ['organisers', after.organisers], ['cities', after.cities]]
  for (const [what, value] of totals) {
    check(
      "the catalogue's " + what + ' total is past the ceiling, so a short read must under-report',
      value > CEILING,
      value + ' > ' + CEILING,
    )
  }

  // ---- measure the defect on the real server -----------------------------
  const old = await whatTheOldShapeWouldPrint()
  log('  UNBOUNDED READ: HTTP ' + old.status + ', ' + old.rowsInBody + ' rows in body, Content-Range ' + old.contentRange)
  check(
    'an unbounded read of events really is truncated by the server, silently',
    old.rowsInBody === CEILING && old.headerTotal === after.events,
    old.rowsInBody + ' rows in the body, ' + old.headerTotal + ' in the header',
  )
  log(
    '  the old shape would have printed: ' + old.headerTotal + ' events, ' + old.cities + ' cities, ' + old.organisers + ' organisers',
  )
  check(
    'the old shape under-reports organisers against the truth it would print beside',
    old.organisers < after.organisers,
    'would print ' + old.organisers + ', truth ' + after.organisers + ', short by ' + (after.organisers - old.organisers),
  )
  check(
    'the old shape under-reports cities against the truth it would print beside',
    old.cities < after.cities,
    'would print ' + old.cities + ', truth ' + after.cities + ', short by ' + (after.cities - old.cities),
  )

  /*
   * WAIT OUT THE PAGE'S OWN CACHE BEFORE JUDGING IT. /organisers declares
   * `revalidate = 60`, so a render from before the seed is a CORRECT answer
   * about a catalogue that has since changed, and reading it would accuse the
   * resolver of a staleness the product is entitled to. This polls until the
   * page has re-read, with a ceiling well past the window, and fails if it
   * never does rather than driving on and blaming the wrong thing.
   */
  const deadline = Date.now() + 150000
  let sawFresh = false
  let waited = 0
  while (Date.now() < deadline) {
    const probe = await fetch(BASE + '/organisers', { headers: { 'cache-control': 'no-cache' } })
    const html = await probe.text()
    const m = html.match(/([0-9][0-9,]*) events live right now/)
    const shown = m ? Number(m[1].split(',').join('')) : -1
    if (shown === after.events) {
      sawFresh = true
      break
    }
    waited += 5
    await new Promise(r => setTimeout(r, 5000))
  }
  check(
    'the page re-reads the catalogue within its own revalidate window',
    sawFresh,
    sawFresh ? 'fresh after about ' + waited + 's' : 'still stale after 150s',
  )

  // ---- drive the page ----------------------------------------------------
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const res = await page.goto(BASE + '/organisers', { waitUntil: 'domcontentloaded', timeout: 120000 })
    check('/organisers answers 200 at ' + vp.name, res?.status() === 200, 'HTTP ' + res?.status())
    await page.waitForSelector('text=events live right now', { timeout: 60000 })
    const strip = await readStrip(page)
    log('  ' + vp.name + ' strip: "' + strip.text + '"')

    /*
     * THE PICTURE HAS TO SHOW THE NUMBER BEING ASSERTED. The first version of
     * this drive screenshotted the viewport at load, which on /organisers is
     * the hero and the top of the live-event band: the strip sits below both,
     * so every saved image showed a page with none of the evidence on it. The
     * assertions were reading the strip through innerText and were correct, and
     * the screenshots beside them proved nothing to anybody reading later.
     */
    const stripEl = page.locator('p', { hasText: 'events live right now' }).first()
    await stripEl.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, 'organisers-strip-' + vp.name + '.png') })
    await stripEl.screenshot({ path: join(SHOTS, 'organisers-strip-closeup-' + vp.name + '.png') })

    const [events, cities, organisers] = strip.numbers
    check(vp.name + ': the events count on the page is the catalogue own total', events === after.events, 'page ' + events + ', truth ' + after.events)
    check(vp.name + ': the cities count on the page is the catalogue own total', cities === after.cities, 'page ' + cities + ', truth ' + after.cities)
    check(vp.name + ': the organisers count on the page is the catalogue own total', organisers === after.organisers, 'page ' + organisers + ', truth ' + after.organisers)
    check(
      vp.name + ': the page does NOT print the truncated organisers number',
      organisers !== old.organisers,
      'page ' + organisers + ', the truncated answer would be ' + old.organisers,
    )
    check(
      vp.name + ': the page does NOT print the truncated cities number',
      cities !== old.cities,
      'page ' + cities + ', the truncated answer would be ' + old.cities,
    )
    await context.close()
  }
} finally {
  if (seeded) {
    const steps = await teardown()
    for (const s of steps) log('  teardown ' + s)
    const { count: left } = await db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .like('slug', TAG + '-%')
    const { count: orgsLeft } = await db
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .like('slug', TAG + '-%')
    const { count: tombsLeft } = await db
      .from('event_tombstones')
      .select('slug', { count: 'exact', head: true })
      .like('slug', TAG + '-%')
    check('TEST is left as it was found, no lane-b-proofcount events', (left ?? 0) === 0, (left ?? 0) + ' left')
    check('TEST is left as it was found, no lane-b-proofcount organisations', (orgsLeft ?? 0) === 0, (orgsLeft ?? 0) + ' left')
    /*
     * THE TOMBSTONES THIS DRIVE'S OWN DELETES WROTE. Checked because the first
     * teardown cleared them while failing on the two tables either side, so the
     * one table that looked clean proved nothing about the other two.
     */
    check('TEST is left as it was found, no lane-b-proofcount tombstones', (tombsLeft ?? 0) === 0, (tombsLeft ?? 0) + ' left')
    const restored = await truth()
    log('  RESTORED: ' + restored.events + ' events, ' + restored.organisers + ' organisers, ' + restored.cities + ' cities')
  }
  await browser.close()
}

const passed = results.filter(r => r.ok).length
writeFileSync(
  join(EVIDENCE, 'results.json'),
  JSON.stringify({ when: new Date().toISOString(), base: BASE, passed, total: results.length, results }, null, 1),
)
log('\n=== ' + passed + '/' + results.length + ' checks passed ===')
if (passed !== results.length) process.exit(1)
