/**
 * DRIVEN PROOF: THE ADMIN ORGANISER SCREENS AGREE WITH THE DATABASE, ROW BY ROW,
 * AND THE FIGURE MOVES WHEN THE ROWS MOVE.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by creating a real organisation with no events, reading the
 * real screen signed in at the real /admin/login, then giving it events and
 * reading the screen again.
 *
 *   1. EVERY organiser on page one shows the event count the database gives
 *      when asked independently and PAGED, not just the fixture
 *   2. a new organisation with nothing to its name shows 0
 *   3. three events later it shows 3, at 390, 768 and 1440
 *   4. its detail page shows the same count and a lifetime volume equal to the
 *      sum of its confirmed orders, asked of Postgres independently
 *   5. zero axe violations at every impact level on both screens, all three
 *      viewports
 *   6. the fixture is removed and page one agrees with the database again
 *
 * WHY 1 IS THE CHECK THAT MATTERS. `countEventsAndVolume` exists because a
 * STORED COUNTER DRIFTED: its header records that 9 of 9 organisations carrying
 * a non-zero counter disagreed with their own rows, one reading 5 against 76
 * real events. Checking one fixture would prove the fixture. Checking all 25
 * rows against a paged read of the database is the same census that found the
 * drift, run against the screen instead of against the column.
 *
 * WHAT IT CANNOT PROVE, stated rather than implied: the 1,000-row ceiling.
 * TEST holds 293 organisations and 285 published events, so an unbounded read
 * returns everything and no drive can tell the fixed tree from the broken one.
 * The ceiling is proven by tests/unit/admin/the-organiser-screens-count-every-row.test.ts,
 * which drives 2,500 events through a faked 1,000-row cap, 1,200 through a
 * 250-row cap, and 1,500 orders through the same. Seeding a thousand events to
 * strengthen a drive would leave a thousand fabricated events in the catalogue.
 *
 * NO ORDER IS EVER WRITTEN BY THIS DRIVE. Lifetime volume is checked by
 * agreement against whatever confirmed orders already exist, because `orders`
 * is lane A's territory and a drive that writes money rows to make its own
 * figure move is a drive that has changed the thing it is measuring.
 *
 * ---------------------------------------------------------------------------
 * USAGE. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     node --env-file=.env.local scripts/verify/lb-orgwhole-drive.mjs \
 *       --out C:/dev/EVIDENCE/LB-ORGWHOLE
 *
 * TEST IS LEFT AS FOUND. One organisation and three events, all carrying lane-b
 * in the name and the slug, all removed in the teardown and counted back
 * afterwards rather than assumed gone.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3100').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url || '(no url)'}`)
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

const STAMP = Date.now()
const TAG = `lane-b-orgwhole-${STAMP}`
const ORG_NAME = `Lane B ORGWHOLE ${STAMP}`
const EVENTS_TO_CREATE = 3

/**
 * THE DRIVE PAGES ITS OWN READS TOO. Without this they would hit the identical
 * server ceiling and would then agree with a truncated screen for the wrong
 * reason. Two wrong numbers that match are the most convincing false pass there
 * is.
 */
async function everyRow(table, columns, shape) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns)
    if (shape) q = shape(q)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`the drive could not read ${table}: ${error.message}`)
    if (!data || data.length === 0) return rows
    rows.push(...data)
  }
}

/**
 * What the admin organisers table renders, keyed by organiser name.
 *
 * THE NAME IS TAKEN FROM ITS OWN ANCHOR, not from the cell's text. The first
 * cell holds the name, the slug and the email as three block elements, and
 * `textContent` concatenates them with NO separator, so the first version of
 * this function produced keys like
 * "Lane B ORGWHOLEâ€¦lane-b-orgwholeâ€¦-orgadmin@example.test". Not one of them
 * matched a row in the database, and the census below still reported PASS for
 * twenty-five organisers, because it only compared the names it had managed to
 * resolve and it had resolved none. A check that judges nothing must never
 * report PASS, so the resolution is now asserted as well.
 */
async function listOnScreen(page) {
  return page.evaluate(() => {
    const out = {}
    for (const tr of document.querySelectorAll('tbody tr')) {
      const cells = [...tr.querySelectorAll('td')]
      const link = cells[0]?.querySelector('a')
      if (!link || cells.length < 5) continue
      out[link.textContent.trim()] = { events: Number(cells[3].textContent.trim()) }
    }
    return out
  })
}

async function axeVerdict(page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return {
    clean: axe.violations.length === 0,
    detail:
      axe.violations.length === 0
        ? '0 violations at any impact level'
        : axe.violations.map(v => `${v.impact}: ${v.id} x${v.nodes.length}`).join(' | '),
  }
}

let exitCode = 0
let browser = null
let admin = null
let orgId = null
const eventIds = []

try {
  admin = await createProofAdmin(db, { label: 'Lane B organiser counts proof' })
  check('orgwhole.setup.a-throwaway-owner-exists', Boolean(admin?.email), admin?.email ?? 'MISSING')

  const { data: org, error: orgError } = await db
    .from('organisations')
    .insert({
      name: ORG_NAME,
      slug: `${TAG}-org`,
      owner_id: admin.id,
      email: admin.email,
      // Pending, so nothing here reaches a public surface. The admin list does
      // not filter on status by default.
      status: 'pending',
    })
    .select('id, name, created_at')
    .single()
  if (orgError) throw new Error(`organisation: ${orgError.message}`)
  orgId = org.id
  check('orgwhole.setup.a-lane-b-organisation-exists-with-nothing-to-its-name', Boolean(orgId), `${ORG_NAME} (${orgId})`)

  /*
   * THE BUSIEST REAL ORGANISER, ENUMERATED RATHER THAN CHOSEN.
   *
   * The fixture has no orders, so checking ITS lifetime volume compares zero to
   * zero and proves nothing about the read that sums money. The organisation
   * with the most confirmed orders on TEST is the one whose figure would move
   * first if that read were truncated, so the detail check is run against it as
   * well, read-only. No order is ever written by this drive.
   */
  const everyConfirmed = await everyRow('orders', 'organisation_id, total_cents', q =>
    q.eq('status', 'confirmed'),
  )
  const volumeByOrg = new Map()
  for (const o of everyConfirmed) {
    const bucket = volumeByOrg.get(o.organisation_id) ?? { orders: 0, cents: 0 }
    bucket.orders += 1
    bucket.cents += Number(o.total_cents ?? 0)
    volumeByOrg.set(o.organisation_id, bucket)
  }
  const busiest = [...volumeByOrg.entries()].sort((a, b) => b[1].orders - a[1].orders)[0] ?? null
  check(
    'orgwhole.setup.the-busiest-real-organiser-was-enumerated-not-chosen',
    Boolean(busiest) && busiest[1].orders > 0,
    busiest
      ? `${busiest[0]} carries ${busiest[1].orders} confirmed order(s) worth ${busiest[1].cents} cents, the most on TEST`
      : 'NO organisation on TEST has a confirmed order, so the volume figure cannot be proven against a real one',
  )

  browser = await chromium.launch({ headless: true })

  // -------------------------------------------- the list, before any events
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await signInAsOwner(page, BASE, admin)
    const res = await page.goto(`${BASE}/admin/organisers`, { waitUntil: 'networkidle', timeout: 180_000 })
    check('orgwhole.before.the-list-answers-200', res?.status() === 200, `HTTP ${res?.status()}`)

    const shown = await listOnScreen(page)
    check(
      'orgwhole.before.a-new-organisation-shows-no-events',
      shown[ORG_NAME]?.events === 0,
      `${ORG_NAME}: screen ${shown[ORG_NAME]?.events}, database 0`,
    )
    await page.screenshot({ path: join(out, 'desktop-1440-1-before.png'), fullPage: true })
    await context.close()
  }

  // ------------------------------------------------ give it three real events
  const { data: category } = await db.from('event_categories').select('id').limit(1).maybeSingle()
  const start = new Date(Date.now() + 30 * 864e5)
  for (let i = 0; i < EVENTS_TO_CREATE; i += 1) {
    const { data: event, error: eventError } = await db
      .from('events')
      .insert({
        title: `${ORG_NAME} Night ${i + 1}`,
        slug: `${TAG}-event-${i + 1}`,
        description: 'Lane B ORGWHOLE proof fixture.',
        summary: 'Lane B ORGWHOLE proof fixture',
        organisation_id: orgId,
        created_by: admin.id,
        category_id: category?.id ?? null,
        start_date: start.toISOString(),
        end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
        timezone: 'Australia/Melbourne',
        event_type: 'in_person',
        venue_name: `Lane B ORGWHOLE Hall ${STAMP}`,
        venue_city: 'Geelong',
        venue_country: 'Australia',
        // Draft and unlisted: the admin count does not filter on either, and a
        // fixture that is never published cannot be left published.
        status: 'draft',
        visibility: 'unlisted',
      })
      .select('id')
      .single()
    if (eventError) throw new Error(`event ${i + 1}: ${eventError.message}`)
    eventIds.push(event.id)
  }
  check(
    'orgwhole.setup.three-real-events-belong-to-it',
    eventIds.length === EVENTS_TO_CREATE,
    `${eventIds.length} event(s) created for ${orgId}`,
  )

  // ------------------------------------------------- the screens, at each width
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()

    const signedIn = await signInAsOwner(page, BASE, admin)
    check(`orgwhole.${vp.label}.signed-in-at-the-real-admin-login`, signedIn, page.url())

    const res = await page.goto(`${BASE}/admin/organisers`, { waitUntil: 'networkidle', timeout: 180_000 })
    check(`orgwhole.${vp.label}.the-list-answers-200`, res?.status() === 200, `HTTP ${res?.status()}`)
    await page.screenshot({ path: join(out, `${vp.label}-2-list.png`), fullPage: true })

    const shown = await listOnScreen(page)
    check(
      `orgwhole.${vp.label}.the-fixtures-count-rose-to-three`,
      shown[ORG_NAME]?.events === EVENTS_TO_CREATE,
      `${ORG_NAME}: screen ${shown[ORG_NAME]?.events}, database ${EVENTS_TO_CREATE}`,
    )

    /*
     * THE CENSUS. Every organiser rendered on page one, against a paged read of
     * `events` asked of Postgres independently. This is the check that would
     * have caught the drift the counter had, and it is the one a single fixture
     * cannot stand in for.
     */
    const names = Object.keys(shown)
    const ids = await everyRow('organisations', 'id, name', q => q.in('name', names))
    const eventsOfThose = await everyRow('events', 'organisation_id', q =>
      q.in('organisation_id', ids.map(o => o.id)),
    )
    const trueCount = new Map(ids.map(o => [o.name, 0]))
    const nameById = new Map(ids.map(o => [o.id, o.name]))
    for (const e of eventsOfThose) {
      const name = nameById.get(e.organisation_id)
      if (name !== undefined) trueCount.set(name, (trueCount.get(name) ?? 0) + 1)
    }
    // AN UNRESOLVED NAME IS A FAILURE, NOT A ROW TO SKIP. See listOnScreen.
    const unresolved = names.filter(name => !trueCount.has(name))
    const disagreements = names
      .filter(name => trueCount.has(name) && shown[name].events !== trueCount.get(name))
      .map(name => `${name}: screen ${shown[name].events}, database ${trueCount.get(name)}`)
    check(
      `orgwhole.${vp.label}.every-organiser-on-the-page-agrees-with-the-database`,
      disagreements.length === 0 && unresolved.length === 0 && names.length > 0,
      unresolved.length > 0
        ? `${unresolved.length} of ${names.length} name(s) on the screen could not be found in the database, so this check judged nothing: ${unresolved.slice(0, 2).join(' | ')}`
        : disagreements.length === 0
          ? `${names.length} organiser(s) on page one, every event count equal to a paged read of the database`
          : disagreements.join(' | '),
    )

    const listAxe = await axeVerdict(page)
    check(`orgwhole.${vp.label}.the-list-has-no-axe-violation-at-any-impact-level`, listAxe.clean, listAxe.detail)

    // ------------------------------------------------------------ the detail
    const detailRes = await page.goto(`${BASE}/admin/organisers/${orgId}`, {
      waitUntil: 'networkidle',
      timeout: 180_000,
    })
    check(`orgwhole.${vp.label}.the-detail-answers-200`, detailRes?.status() === 200, `HTTP ${detailRes?.status()}`)
    await page.screenshot({ path: join(out, `${vp.label}-3-detail.png`), fullPage: true })

    const detailText = await page.locator('body').innerText()
    const confirmed = await everyRow('orders', 'total_cents', q =>
      q.eq('organisation_id', orgId).eq('status', 'confirmed'),
    )
    const trueVolume = confirmed.reduce((sum, o) => sum + Number(o.total_cents ?? 0), 0)
    const expectedVolume = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
      trueVolume / 100,
    )
    check(
      `orgwhole.${vp.label}.the-detail-shows-the-lifetime-volume-the-database-gives`,
      detailText.includes(expectedVolume),
      `${confirmed.length} confirmed order(s) summing to ${expectedVolume}; ${detailText.includes(expectedVolume) ? 'on the screen' : 'NOT on the screen'}`,
    )
    check(
      `orgwhole.${vp.label}.the-detail-names-the-organiser-it-was-asked-for`,
      detailText.includes(ORG_NAME),
      detailText.includes(ORG_NAME) ? ORG_NAME : `${ORG_NAME} is NOT on its own detail page`,
    )

    const detailAxe = await axeVerdict(page)
    check(`orgwhole.${vp.label}.the-detail-has-no-axe-violation-at-any-impact-level`, detailAxe.clean, detailAxe.detail)

    // ------------------------- and the same figure on an organiser with money
    if (busiest) {
      const [busiestId, busiestTotals] = busiest
      const busyRes = await page.goto(`${BASE}/admin/organisers/${busiestId}`, {
        waitUntil: 'networkidle',
        timeout: 180_000,
      })
      const busyText = await page.locator('body').innerText()
      const expected = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
        busiestTotals.cents / 100,
      )
      await page.screenshot({ path: join(out, `${vp.label}-5-busiest.png`), fullPage: false })
      check(
        `orgwhole.${vp.label}.the-busiest-organisers-lifetime-volume-equals-the-database`,
        busyRes?.status() === 200 && busyText.includes(expected),
        `${busiestTotals.orders} confirmed order(s) summing to ${expected}; ${busyText.includes(expected) ? 'on the screen' : 'NOT on the screen'}`,
      )
    }

    await context.close()
  }
} catch (err) {
  check('orgwhole.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  // ------------------------------------------------------------------ teardown
  let removedEvents = 0
  let removedOrgs = 0
  try {
    const { count: e, error: eError } = await db.from('events').delete({ count: 'exact' }).eq('organisation_id', orgId)
    if (eError) console.error(`teardown could not remove the events: ${eError.message}`)
    removedEvents = e ?? 0
    const { count: o, error: oError } = await db.from('organisations').delete({ count: 'exact' }).eq('id', orgId)
    if (oError) console.error(`teardown could not remove the organisation: ${oError.message}`)
    removedOrgs = o ?? 0
  } catch (err) {
    console.error(`teardown threw: ${err}`)
  }

  if (browser && admin) {
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      await signInAsOwner(page, BASE, admin)
      await page.goto(`${BASE}/admin/organisers`, { waitUntil: 'networkidle', timeout: 180_000 })
      const shown = await listOnScreen(page)
      await page.screenshot({ path: join(out, 'desktop-1440-4-after.png'), fullPage: true })
      check(
        'orgwhole.after.the-fixture-is-gone-from-the-list',
        shown[ORG_NAME] === undefined,
        shown[ORG_NAME] === undefined ? 'the fixture organisation is no longer rendered' : 'it is STILL on the list',
      )
      await context.close()
    } catch (err) {
      console.error(`could not re-read the list after teardown: ${err}`)
    }
  }

  if (browser) await browser.close().catch(() => {})

  let removedAdmin = false
  try {
    if (admin) {
      await removeProofAdmin(db, admin)
      removedAdmin = true
    }
  } catch (err) {
    console.error(`teardown could not remove the throwaway owner: ${err}`)
  }

  const { count: leftEvents } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: leftOrgs } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  check(
    'orgwhole.teardown.test-is-left-as-found-observed-not-claimed',
    (leftEvents ?? 0) === 0 && (leftOrgs ?? 0) === 0 && removedAdmin,
    `removed ${removedEvents} event(s) and ${removedOrgs} organisation(s); ${leftEvents ?? 0} event(s) and ${leftOrgs ?? 0} organisation(s) remain; throwaway owner removed: ${removedAdmin}`,
  )

  const passed = checks.filter(c => c.ok).length
  console.log(`\n${passed} of ${checks.length} checks passed`)
  for (const f of failures) console.log(`  FAILED: ${f}`)
  writeFileSync(
    join(out, 'orgwhole-report.json'),
    JSON.stringify({ base: BASE, organisation: orgId, events: eventIds.length, passed, total: checks.length, checks }, null, 2),
  )
  process.exit(failures.length > 0 ? 1 : exitCode)
}
