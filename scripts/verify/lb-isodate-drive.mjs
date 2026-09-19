/**
 * LB-ISODATE DRIVEN PROOF, at 390, 768 and 1440.
 *
 * TWO DEFECTS, ONE SCREEN, found in the same hour on 19 September 2026 and
 * proven here on the real screens rather than in a unit test.
 *
 *   1. EVERY DATE ON THE MATCHER AND THE FEE-OVERRIDE PICKER WAS THE UTC ONE.
 *      Four renderings sliced the first ten characters off an ISO string, which
 *      is the UTC calendar date. The guard written the day before for exactly
 *      this class read three getters and two formatters and could not see a
 *      slice at all.
 *
 *   2. THE MATCHER'S PICKER OFFERED THE FORTY OLDEST EVENTS THE PLATFORM HAD
 *      EVER PUBLISHED. The read had no bound on time, under a comment claiming
 *      it listed the soonest. On TEST, 101 of 276 published public events were
 *      already over and the list began in June.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THIS DRIVE HONEST, and it is the whole design of it.
 *
 * A date defect only shows when the two calendars DISAGREE, so a drive that
 * uses whatever events happen to be on TEST proves nothing: it passes or fails
 * by luck. This one creates its own events at CHOSEN instants and computes the
 * expectation independently, zone-pinned, rather than asking the code under
 * test what it thinks:
 *
 *   2026-09-22T14:30:00Z   an event at that instant is
 *                            Wed, 23 Sept 2026 in SYDNEY
 *                            Tue, 22 Sept 2026 in PERTH
 *                            2026-09-22 in UTC, which is Perth's date and not
 *                            Sydney's
 *                          So one instant proves both halves of the rule: the
 *                          UTC slice is wrong, AND swapping UTC for the
 *                          PLATFORM zone is still wrong for the Perth event.
 *
 *   2026-09-18T21:20:02Z   a match run started then is 19 Sept 2026 in
 *                          Australia and 18 September in UTC.
 *
 *   2026-06-10T08:00:00Z   an event that is OVER. It is published and public,
 *                          so the old picker would have offered it FIRST; the
 *                          bounded one must not offer it at all.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EVENTS ARE CREATED RATHER THAN BORROWED. The instant has to be chosen
 * and the zone has to be Perth for one of them, and editing another lane's rows
 * on a shared TEST project is not something this drive will do. Everything it
 * creates is tagged `lane-b-isodate-` and is deleted in teardown, which is then
 * VERIFIED by asking the database the same question
 * scripts/guards/no-published-lane-b-fixture-on-test.mjs asks.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/lb-isodate-drive.mjs --out C:/dev/EVIDENCE/LB-ISODATE
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/** Independently computed, zone-pinned: the expectation is never the code under test. */
const fmt = (iso, zone, options) =>
  new Intl.DateTimeFormat('en-AU', { ...options, timeZone: zone }).format(new Date(iso))
const eventDate = (iso, zone) =>
  fmt(iso, zone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const platformDate = iso => fmt(iso, 'Australia/Sydney', { day: 'numeric', month: 'short', year: 'numeric' })

const EVENT_INSTANT = '2026-09-22T14:30:00Z'
const RUN_INSTANT = '2026-09-18T21:20:02Z'
const OVER_START = '2026-06-10T08:00:00Z'
const OVER_END = '2026-06-10T11:00:00Z'

const STAMP = Date.now().toString(36)
const TAG = `lane-b-isodate-${STAMP}`

let browser = null
let admin = null
let orgId = null
const eventIds = []

/** Everything this drive created, removed children first. Called in `finally`. */
async function teardown() {
  const problems = []
  const del = async (label, builder) => {
    const { error } = await builder
    if (error) problems.push(`${label}: ${error.code} ${error.message}`)
  }
  if (eventIds.length) {
    const { data: runs } = await db.from('marketing_match_run').select('id').in('event_id', eventIds)
    const runIds = (runs ?? []).map(r => r.id)
    if (runIds.length) {
      await del('marketing_match_score', db.from('marketing_match_score').delete().in('run_id', runIds))
      await del('marketing_match_run', db.from('marketing_match_run').delete().in('id', runIds))
    }
    const { data: links } = await db.from('share_links').select('id').in('event_id', eventIds)
    const linkIds = (links ?? []).map(l => l.id)
    if (linkIds.length) await del('share_links', db.from('share_links').delete().in('id', linkIds))
    await del('events', db.from('events').delete().in('id', eventIds))
  }
  if (orgId) {
    const { data: orgLinks } = await db.from('share_links').select('id').eq('organisation_id', orgId)
    const orgLinkIds = (orgLinks ?? []).map(l => l.id)
    if (orgLinkIds.length) await del('share_links (org)', db.from('share_links').delete().in('id', orgLinkIds))
    await del('organisations', db.from('organisations').delete().eq('id', orgId))
  }
  await removeProofAdmin(db, admin)

  /*
   * THE TEARDOWN IS VERIFIED BY ASKING, not by trusting the deletes. A cleanup
   * that cannot fail loudly is worse than none, because the next person
   * believes the database is clean. This is the same question
   * scripts/guards/no-published-lane-b-fixture-on-test.mjs puts.
   */
  const { count: left } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: orgsLeft } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  check(
    'isodate.teardown.left-as-found',
    (left ?? 0) === 0 && (orgsLeft ?? 0) === 0 && problems.length === 0,
    problems.length ? problems.join(' | ') : `${left ?? 0} event(s), ${orgsLeft ?? 0} organisation(s) remaining`,
  )
}

try {
  // ------------------------------------------------------------------ setup
  admin = await createProofAdmin(db, { label: 'Lane B ISODATE Proof' })
  check('isodate.setup.a-throwaway-admin-exists', Boolean(admin.id), admin.email)

  const { data: coverDonor } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .not('cover_image_url', 'ilike', 'https://picsum.photos/%')
    .limit(1)
    .maybeSingle()
  if (!coverDonor?.cover_image_url) throw new Error('no published TEST event with a real cover to copy')

  const { data: category } = await db.from('event_categories').select('id').limit(1).maybeSingle()

  const { data: org, error: orgError } = await db
    .from('organisations')
    .insert({
      name: `Lane B ISODATE ${STAMP}`,
      slug: `${TAG}-org`,
      owner_id: admin.id,
      email: admin.email,
      /*
       * PENDING, NOT ACTIVE. `active` publishes /organisers/<slug> into the
       * sitemap three lanes read (scripts/guards/fixtures-are-not-published.mjs),
       * and nothing this drive opens needs an organiser profile to resolve: the
       * matcher picker and the fee-override picker both read events. Half the
       * hazard removed for nothing.
       */
      status: 'pending',
    })
    .select('id')
    .single()
  if (orgError) throw new Error(`organisation: ${orgError.message}`)
  orgId = org.id

  const makeEvent = async (suffix, title, timezone, startIso, endIso) => {
    const { data, error } = await db
      .from('events')
      .insert({
        title,
        slug: `${TAG}-${suffix}`,
        description: 'Lane B ISODATE proof fixture.',
        summary: 'Lane B ISODATE proof fixture',
        organisation_id: orgId,
        created_by: admin.id,
        category_id: category?.id ?? null,
        start_date: startIso,
        end_date: endIso,
        timezone,
        event_type: 'in_person',
        venue_name: `Lane B ISODATE Hall ${STAMP}`,
        venue_address: '1 Proof St',
        venue_city: 'Geelong',
        venue_state: 'VIC',
        venue_country: 'Australia',
        status: 'published',
        /*
         * PUBLIC, AND IT CANNOT BE ANYTHING ELSE. The picker under test reads
         * through applyPublicEventVisibility, which is `.eq('visibility',
         * 'public')`, so an `unlisted` fixture would be invisible to the thing
         * being proven rather than merely quieter. Baselined by name in
         * scripts/guards/fixtures-are-not-published.mjs with that premise, and
         * the teardown below VERIFIES the rows are gone by asking the database
         * the same question that guard asks.
         */
        visibility: 'public',
        published_at: new Date().toISOString(),
        cover_image_url: coverDonor.cover_image_url,
        is_age_restricted: false,
        max_capacity: 10,
        is_free: true,
        fee_pass_type: 'pass_to_buyer',
      })
      .select('id, title, slug')
      .single()
    if (error) throw new Error(`event ${suffix}: ${error.message}`)
    eventIds.push(data.id)
    return data
  }

  const endOf = iso => new Date(Date.parse(iso) + 3 * 60 * 60 * 1000).toISOString()

  const sydney = await makeEvent(
    'sydney',
    `Lane B ISODATE Sydney ${STAMP}`,
    'Australia/Sydney',
    EVENT_INSTANT,
    endOf(EVENT_INSTANT),
  )
  const perth = await makeEvent(
    'perth',
    `Lane B ISODATE Perth ${STAMP}`,
    'Australia/Perth',
    EVENT_INSTANT,
    endOf(EVENT_INSTANT),
  )
  const over = await makeEvent(
    'over',
    `Lane B ISODATE Finished ${STAMP}`,
    'Australia/Sydney',
    OVER_START,
    OVER_END,
  )

  const sydneyDate = eventDate(EVENT_INSTANT, 'Australia/Sydney')
  const perthDate = eventDate(EVENT_INSTANT, 'Australia/Perth')
  const utcSlice = EVENT_INSTANT.slice(0, 10)
  check(
    'isodate.setup.one-instant-is-two-different-days',
    sydneyDate !== perthDate && utcSlice === '2026-09-22' && !sydneyDate.includes('22'),
    `Sydney "${sydneyDate}" | Perth "${perthDate}" | UTC slice ${utcSlice}`,
  )

  const { data: run, error: runError } = await db
    .from('marketing_match_run')
    .insert({
      event_id: sydney.id,
      method_name: 'lane-b-isodate',
      method_version: 'v1',
      requested_cap: 5,
      audience_considered: 0,
      returned_count: 0,
      truncated: false,
      suppressed_by_reason: {},
      config_snapshot: {},
      started_at: RUN_INSTANT,
      finished_at: RUN_INSTANT,
    })
    .select('id')
    .single()
  if (runError) throw new Error(`match run: ${runError.message}`)
  check('isodate.setup.a-run-exists-at-a-chosen-instant', Boolean(run.id), `started_at ${RUN_INSTANT}`)

  const runDate = platformDate(RUN_INSTANT)

  // ------------------------------------------------- the screens, all widths
  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`isodate.${vp.label}.signed-in-to-the-console`, signedIn, page.url())
    if (!signedIn) {
      await context.close()
      continue
    }

    // ------------------------------------------------------ /admin/matches
    await page.goto(`${BASE}/admin/matches?event=${sydney.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(out, `matches-${vp.label}.png`), fullPage: true })

    const optionText = await page.locator('#event_nav option').allInnerTexts()
    const options = optionText.join(' | ')

    check(
      `isodate.${vp.label}.matcher-picker-dates-a-sydney-event-in-sydney`,
      options.includes(`${sydney.title} (${sydneyDate})`),
      `expected "${sydney.title} (${sydneyDate})"`,
    )
    check(
      `isodate.${vp.label}.matcher-picker-dates-a-perth-event-in-perth`,
      options.includes(`${perth.title} (${perthDate})`),
      `expected "${perth.title} (${perthDate})", the SAME instant on a different day`,
    )
    check(
      `isodate.${vp.label}.matcher-picker-never-prints-the-utc-date`,
      !options.includes(utcSlice),
      `must not print "${utcSlice}", which is what the ten-character slice produced`,
    )
    check(
      `isodate.${vp.label}.matcher-picker-does-not-offer-an-event-that-is-over`,
      !options.includes(over.title),
      `"${over.title}" ended on ${OVER_END} and is published and public, so the unbounded read offered it first`,
    )

    const body = await page.locator('body').innerText()
    check(
      `isodate.${vp.label}.matcher-run-carries-the-australian-date`,
      body.includes(`run ${runDate}`),
      `expected "run ${runDate}" under How the score is worked out`,
    )
    check(
      `isodate.${vp.label}.matcher-run-never-prints-the-utc-date`,
      !body.includes(RUN_INSTANT.slice(0, 10)),
      `must not print "${RUN_INSTANT.slice(0, 10)}"`,
    )

    // ------------------------------------------------------ /admin/pricing
    await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2000)
    await page.locator('#ov-scope').selectOption('event')
    await page.locator('#ov-search').fill('Lane B ISODATE')

    /*
     * WAIT FOR THE ANSWER, DO NOT SLEEP FOR IT.
     *
     * The first version slept 2.5 seconds after a 250ms debounce, and the drive
     * reported 0 results at 390 while 768 and 1440 passed. That read as a
     * product defect at the narrow width and was not one: the server log shows
     * /admin/pricing/targets took 2.7s on its FIRST request, because `next dev`
     * compiles a route handler on demand, and 453ms and 492ms after that. The
     * 390 pass was simply the one that paid for the compile. The capture settled
     * it rather than the report: the form was fully rendered, the query was in
     * the field, and the dev overlay in the corner still said "Compiling".
     */
    let rows = []
    try {
      await page.waitForSelector('#ov-search ~ ul li button', { timeout: 60000 })
      rows = await page.locator('#ov-search ~ ul li').allInnerTexts()
    } catch {
      rows = []
    }
    await page.screenshot({ path: join(out, `pricing-${vp.label}.png`), fullPage: true })

    const listed = rows.join(' | ')
    check(
      `isodate.${vp.label}.fee-override-picker-returned-the-fixture`,
      rows.length >= 2,
      `${rows.length} result(s): ${listed.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
    check(
      `isodate.${vp.label}.fee-override-picker-dates-a-sydney-event-in-sydney`,
      listed.includes(sydneyDate),
      `expected "${sydneyDate}" beside ${sydney.title}`,
    )
    check(
      `isodate.${vp.label}.fee-override-picker-dates-a-perth-event-in-perth`,
      listed.includes(perthDate),
      `expected "${perthDate}" beside ${perth.title}`,
    )
    check(
      `isodate.${vp.label}.fee-override-picker-never-prints-the-utc-date`,
      // rows.length is in the condition deliberately: an empty list prints no
      // UTC date either, and a check that passes on nothing is not a check.
      rows.length >= 2 && !listed.includes(utcSlice),
      `must not print "${utcSlice}", judged against ${rows.length} result(s)`,
    )

    check(
      `isodate.${vp.label}.fee-override-picker-says-pick-an-event-not-a-event`,
      (await page.locator('#ov-search ~ p').last().innerText().catch(() => '')).includes('an event') ||
        (await page.locator('body').innerText()).includes('Selected:'),
      'the hint under the field read "Pick a event from the list" until 19 September 2026',
    )

    await context.close()
  }
} catch (error) {
  check('isodate.drive.ran-to-completion', false, error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => {})
  await teardown().catch(e => check('isodate.teardown.completed', false, String(e)))
}

const passed = checks.filter(c => c.ok).length
writeFileSync(
  join(out, 'result.json'),
  JSON.stringify({ base: BASE, tag: TAG, passed, total: checks.length, checks }, null, 2),
)
console.log('')
console.log(`=== ${passed}/${checks.length} checks passed ===`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
