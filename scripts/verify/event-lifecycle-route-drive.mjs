/**
 * EVERY LIFECYCLE STATE OF AN EVENT, DRIVEN AT ITS OWN URL, AGAINST THE SERVED
 * BUILD, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHAT DID NOT COVER IT
 * ============================================================================
 *
 * `docs/EVENT-LIFECYCLE.md` is AUTHORITY over what each status answers, and
 * until now two things stood behind it and neither drove a URL:
 *
 *   - `scripts/guards/event-lifecycle-total.mjs` reads the source and proves
 *     the table is total and that both route surfaces consult the one door. It
 *     cannot tell you what the server sends back.
 *   - `scripts/verify/event-lifecycle-proof.mjs` asks the DATABASE directly,
 *     which is the right way to prove an archived row is invisible to anon and
 *     that a delete is refused. It never makes an HTTP request.
 *
 * So the sentence "a paused event answers a full page with a banner" had never
 * been observed. It was written on 14 September 2026 after all four
 * after-the-fact states were found to be answering a real 404, which is exactly
 * the kind of defect a driven check catches and a static one does not.
 *
 * It was written on 21 September 2026 because close-out C8 collapsed this
 * route's three resolutions of one row into one memoised resolver, and the
 * riskiest part of that change is the lifecycle: the layout's archived branch
 * moved from `viewerMayReachArchivedEvent` (a boolean) to the row-returning
 * reader beside it. Both are `archivedEventForViewer` underneath, so the truth
 * value cannot differ - and "cannot differ" is an argument, not a measurement.
 *
 * ============================================================================
 * WHAT IT ASSERTS
 * ============================================================================
 *
 * For a set of events created for this run, one per status, every one of them
 * tagged `lane-c` in its slug so it is this lane's on sight:
 *
 *   published                            200, no lifecycle banner
 *   paused, postponed, cancelled,        200, AND the banner for that state,
 *   completed                            because the page and not just the
 *                                        route is what the buyer reads
 *   archived, to a stranger              404
 *   archived, to a ticket holder         200, with the archived banner
 *   draft                                404
 *   a slug that was never used           404
 *
 * THE HOLDER IS REAL. Not a planted cookie: a confirmed TEST account signed in
 * through the platform's own login form, holding an order for the archived
 * event. `el-signed-in` on its own is only a marker - with no Supabase session
 * behind it `auth.getUser()` returns nobody and the page renders anonymously -
 * so a drive that planted the marker would pass against a tree with the defect
 * still in it (scripts/verify/lib/lane-c-proof-user.mjs records that reasoning).
 *
 * TEST ONLY, and it checks twice: `assertNotProduction()` from the one module
 * that owns that decision, then an explicit TEST-ref check, because this writes
 * rows with a service-role credential. Every row it creates is removed at the
 * end, money records first, which is itself the delete trigger working.
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/event-lifecycle-route-drive.mjs --serve --port=3200
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { ensureLaneCProofUser, LANE_C_PROOF_EMAIL } from './lib/lane-c-proof-user.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

assertNotProduction()

const TAG = '[event-lifecycle-route]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'lifecycle-route')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null, orgId: null, events: [], orderId: null, itemId: null, ticketId: null }

mkdirSync(OUT, { recursive: true })
const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

/**
 * The banner each after-the-fact state paints, taken from the component the
 * page renders rather than invented here, so a copy change fails this drive
 * loudly instead of letting it pass on a page with no banner at all.
 */
const BANNER = {
  paused: /paused/i,
  postponed: /postponed/i,
  cancelled: /cancelled/i,
  completed: /(has ended|finished|completed)/i,
  archived: /(archived|no longer listed|not listed)/i,
}

let stopServer = null
try {
  /* ----------------------------------------------------------------------
   * The rows. One event per status, all lane-C tagged.
   * -------------------------------------------------------------------- */
  const viewer = await ensureLaneCProofUser()
  const owner = must(
    await admin.auth.admin.createUser({
      email: `lane-c-lifecycle-owner-${stamp}@eventlinqs.test`,
      password: randomBytes(12).toString('base64url') + '-Aa1',
      email_confirm: true,
    }),
    'create the lane-C organiser',
  ).user
  created.userId = owner.id
  const org = must(
    await admin
      .from('organisations')
      /*
       * `pending`, NOT `active`, and `unlisted` below for the same reason:
       * three lanes share this database and one of them reads the sitemap. An
       * active organisation publishes /organisers/<slug> and a public event
       * publishes /events/<slug> AND the /venues/<handle> derived from its
       * venue name, into a sitemap another lane's indexing drive will follow
       * while this one is mid-run. `scripts/guards/fixtures-are-not-published.mjs`
       * refused this file for exactly that, and it was right.
       *
       * Neither changes what is under test. `PUBLIC_VISIBILITIES` in
       * src/lib/events/after-the-fact-view.ts is ['public', 'unlisted'], so
       * every lifecycle branch answers identically; what `unlisted` loses is
       * PUBLIC_EVENT_MATCH, which is discovery and not the page.
       */
      .insert({ name: `Lane C Lifecycle ${stamp}`, slug: `lane-c-lifecycle-${stamp}`, owner_id: owner.id, status: 'pending' })
      .select('id')
      .single(),
    'create the lane-C organisation',
  )
  created.orgId = org.id

  const start = new Date(Date.now() + 14 * 864e5).toISOString()
  const end = new Date(Date.now() + 14 * 864e5 + 3 * 36e5).toISOString()
  const madeBySlug = new Map()
  async function makeEvent(status) {
    const slug = `lane-c-lifecycle-${status}-${stamp}`
    /*
     * `events_archived_pair_consistent` refuses an archived row that does not
     * also carry `archived_at` and the status it came FROM, which is how
     * `restoreTarget()` knows where to put it back. The database holds the pair
     * together; a fixture that set only the status would be a row the product
     * cannot create.
     */
    const archivedPair =
      status === 'archived' ? { archived_at: new Date().toISOString(), archived_from_status: 'published' } : {}
    const ev = must(
      await admin
        .from('events')
        .insert({
          ...archivedPair,
          title: `Lane C Lifecycle ${status} ${stamp}`,
          slug,
          organisation_id: org.id,
          created_by: owner.id,
          start_date: start,
          end_date: end,
          timezone: 'Australia/Melbourne',
          status,
          visibility: 'unlisted',
          is_free: true,
          // `events_published_real_cover` refuses a published event with no real
          // cover, which is the platform's own rule that a live page never shows
          // a blank tile. The same object the database proof uses.
          cover_image_url: 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/proof/cover.jpg',
          venue_name: 'The Wool Exchange',
          venue_address: '44 Moorabool Street',
          venue_city: 'Geelong',
        })
        .select('id, slug')
        .single(),
      `create the ${status} event`,
    )
    created.events.push(ev.id)
    const tier = must(
      await admin
        .from('ticket_tiers')
        .insert({ event_id: ev.id, name: 'General admission', total_capacity: 50, price: 0, currency: 'AUD', tier_type: 'free', is_active: true, is_visible: true })
        .select('id')
        .single(),
      `tier for ${status}`,
    )
    madeBySlug.set(status, { ...ev, tierId: tier.id })
    return madeBySlug.get(status)
  }

  const STATUSES = ['published', 'paused', 'postponed', 'cancelled', 'completed', 'archived', 'draft']
  for (const status of STATUSES) await makeEvent(status)

  // The holder's ticket to the ARCHIVED event: an order carrying the viewer's
  // user_id, plus a ticket carrying their email. viewerHoldsTicket accepts
  // either, and this drive supplies both so a failure names the page rather
  // than the fixture.
  const archived = madeBySlug.get('archived')
  const order = must(
    await admin
      .from('orders')
      .insert({
        event_id: archived.id,
        organisation_id: org.id,
        order_number: `EL-LANEC-${stamp.toUpperCase()}`,
        status: 'confirmed',
        subtotal_cents: 0,
        total_cents: 0,
        currency: 'AUD',
        user_id: viewer.id,
        guest_email: LANE_C_PROOF_EMAIL,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'create the holder order',
  )
  created.orderId = order.id
  const item = must(
    await admin
      .from('order_items')
      .insert({ order_id: order.id, item_name: 'General admission', item_type: 'ticket', quantity: 1, unit_price_cents: 0, total_cents: 0, ticket_tier_id: archived.tierId })
      .select('id')
      .single(),
    'create the holder order item',
  )
  created.itemId = item.id
  const ticket = must(
    await admin
      .from('tickets')
      .insert({
        event_id: archived.id,
        order_id: order.id,
        order_item_id: item.id,
        idx_in_item: 0,
        ticket_code: `EL-LC${stamp.slice(-4).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
        secret: randomUUID(),
        holder_email: LANE_C_PROOF_EMAIL,
        holder_name: 'Lane C Proof Holder',
        status: 'valid',
        ticket_tier_id: archived.tierId,
      })
      .select('id')
      .single(),
    'create the holder ticket',
  )
  created.ticketId = ticket.id

  /* ----------------------------------------------------------------------
   * The server.
   * -------------------------------------------------------------------- */
  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the lifecycle drive server was started', 'pass --port= for one this lane owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/lifecycle-route-server.log', { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }

  /* ----------------------------------------------------------------------
   * ANONYMOUS. The status code first, because a page that 500s can still
   * contain the word "paused".
   * -------------------------------------------------------------------- */
  const EXPECTED = {
    published: 200,
    paused: 200,
    postponed: 200,
    cancelled: 200,
    completed: 200,
    archived: 404,
    draft: 404,
  }
  for (const status of STATUSES) {
    const path = `/events/lane-c-lifecycle-${status}-${stamp}`
    const res = await fetch(BASE + path, { redirect: 'manual' })
    const html = res.status === 200 ? await res.text() : ''
    check(`${status} answers ${EXPECTED[status]} to a stranger`, res.status === EXPECTED[status], `got ${res.status} at ${path}`)
    if (EXPECTED[status] === 200 && BANNER[status]) {
      check(`${status} paints its lifecycle banner`, BANNER[status].test(html), BANNER[status].source)
    }
    if (status === 'published') {
      check('published paints no lifecycle banner', !/this event has been (paused|postponed|cancelled)/i.test(html), 'no after-the-fact copy')
    }
  }
  const unknown = await fetch(`${BASE}/events/lane-c-lifecycle-never-existed-${stamp}`, { redirect: 'manual' })
  check('a slug that was never used answers 404', unknown.status === 404, `got ${unknown.status}`)

  /* ----------------------------------------------------------------------
   * THE HOLDER, in a real browser, at three widths.
   * -------------------------------------------------------------------- */
  const browser = await chromium.launch()
  try {
    for (const vp of [
      { label: '390', width: 390, height: 844 },
      { label: '768', width: 768, height: 1024 },
      { label: '1440', width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      })
      const page = await context.newPage()

      await page.goto(`${BASE}/login`, { waitUntil: 'load' })
      await page.fill('input[name="email"]', LANE_C_PROOF_EMAIL)
      await page.fill('input[name="password"]', viewer.password)
      await page.click('button[type="submit"]')
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
      const cookies = await context.cookies()
      check(`${vp.label} the holder is signed in with the marker cookie`, cookies.some((c) => c.name === 'el-signed-in'), cookies.map((c) => c.name).join(','))

      const archivedPath = `/events/lane-c-lifecycle-archived-${stamp}`
      const response = await page.goto(BASE + archivedPath, { waitUntil: 'load' })
      const status = response?.status() ?? 0
      const text = await page.evaluate(() => document.body?.innerText ?? '')
      check(`${vp.label} a ticket holder reaches the archived event`, status === 200, `status ${status} at ${archivedPath}`)
      check(`${vp.label} the archived page names the event`, text.includes(`Lane C Lifecycle archived ${stamp}`), text.slice(0, 80).replace(/\s+/g, ' '))
      await page.screenshot({ path: join(OUT, `holder-archived-${vp.label}.png`), fullPage: false })

      // And one after-the-fact page at the same width, so the banner is read by
      // a browser and not only by a regular expression over the bytes.
      const cancelled = `/events/lane-c-lifecycle-cancelled-${stamp}`
      const cancelledResponse = await page.goto(BASE + cancelled, { waitUntil: 'load' })
      check(`${vp.label} the cancelled event renders`, (cancelledResponse?.status() ?? 0) === 200, `status ${cancelledResponse?.status()}`)
      await page.screenshot({ path: join(OUT, `cancelled-${vp.label}.png`), fullPage: false })

      await context.close()
    }
  } finally {
    await browser.close()
  }

  /* CLAUSE: a drive that measured nothing is not a drive that passed. */
  const MINIMUM = STATUSES.length + 1 + 3 * 4
  if (results.length < MINIMUM) {
    check('the drive performed every check it set out to perform', false, `${results.length} checks, expected at least ${MINIMUM}`)
  }
} finally {
  if (stopServer) await stopServer()
  try {
    if (created.ticketId) await admin.from('tickets').delete().eq('id', created.ticketId)
    if (created.itemId) await admin.from('order_items').delete().eq('id', created.itemId)
    if (created.orderId) await admin.from('orders').delete().eq('id', created.orderId)
    for (const id of created.events) {
      const r = await admin.from('events').delete().eq('id', id)
      if (r.error) console.error(`${TAG} cleanup: could not delete event ${id}: ${r.error.message}`)
    }
    await admin.from('event_tombstones').delete().like('slug', `lane-c-lifecycle-%-${stamp}`)
    if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
    // One door for account removal: it is the only one that can tell an account
    // that was already gone from a deletion that was REFUSED
    // (scripts/verify/lib/teardown-account.mjs, and the guard that holds it).
    if (created.userId) await tearDownAccountOrFailTheRun(admin, created.userId)
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
  }
}

writeFileSync(join(OUT, 'lifecycle-route-drive.json'), JSON.stringify({ base: BASE, stamp, results }, null, 2))
if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
