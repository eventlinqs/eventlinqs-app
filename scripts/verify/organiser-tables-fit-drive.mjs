/**
 * THE ORGANISER'S OTHER DATA TABLES, ON A PHONE, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHAT IT IS NOT
 * ============================================================================
 *
 * On 21 September 2026 the organiser's EVENTS list was rebuilt because a
 * publish refusal rendered inside a five-column table at 390 and the event's
 * own title sat off the left edge of the phone. That item closed with a
 * sentence in C:\dev\REVIEW-QUEUE-C.md naming what it had NOT done: the
 * organiser dashboard has five tables and only one of them had ever been
 * measured. The other four "carry fewer columns and none of them renders a
 * server-action refusal", which is a reason to expect them to be better, not
 * evidence that they are.
 *
 * So this measures them. It is an instrument first: nothing here assumes a
 * defect, and the numbers it prints for a passing table are as much the point
 * as the ones it prints for a failing one.
 *
 * ============================================================================
 * THE ONE THING THE EXISTING CHECKS CANNOT SEE
 * ============================================================================
 *
 * scripts/verify/mobile-viewport-width-drive.mjs already proves no dashboard
 * screen makes the DOCUMENT wider than the phone, and it passes. It cannot see
 * this class, and the reason is written into its own exemption list: a box with
 * `overflow-x: auto` is allowed to be wider than the phone, because a person
 * can swipe it. That exemption is correct and it is also the hiding place.
 *
 *   - `overflow-x: auto` means a finger CAN reach the rest of the row. What it
 *     does not mean is that the row still says WHOSE row it is once the finger
 *     gets there: the identifying first column scrolls off the left.
 *   - `overflow: hidden` is not an exemption and looks like one in a class
 *     list. A table wider than a box that hides its overflow is CLIPPED, with
 *     no scrollbar and no swipe, and anything past the edge is unreachable by
 *     any means a person has. If that anything is a button, the control is
 *     dead: the same defect as a 404 behind a tile, and Law 5's affordance
 *     clause is explicit that a control a finger cannot land on is a defect.
 *
 * ============================================================================
 * THE CLAUSES, AND WHY EACH IS A RATIO OR A RULE RATHER THAN A PIXEL
 * ============================================================================
 *
 * CLAUSE 1, THE TABLE IS THERE AND IT IS THE SEEDED ONE. The anti-false-pass.
 * Every surface asserts a string this drive itself wrote into the database, so
 * an empty table, a redirect to the login form, or a feature switched off
 * fails loudly instead of passing four clauses about nothing.
 *
 * CLAUSE 2, NOTHING IS CLIPPED BY A BOX A FINGER CANNOT SCROLL. Walking up
 * from the table, any ancestor whose computed `overflow-x` is `hidden` or
 * `clip` must not be narrower than the table it contains. `auto` and `scroll`
 * are not failures here: they are clause 4's subject.
 *
 * CLAUSE 3, EVERY CONTROL IS REACHABLE. For each `a` and `button` inside the
 * table, measured at the scroll position the organiser ARRIVES at: the control
 * must not sit outside a clipping ancestor's box. Deliberately NOT implemented
 * with `scrollIntoView`, and that is the subtlety worth writing down:
 * `overflow: hidden` still scrolls PROGRAMMATICALLY, so a script can bring a
 * clipped button into view and report it visible, while the person holding the
 * phone has no gesture that will do it. Measuring after a scroll the user
 * cannot perform is how this check would have passed a dead button.
 *
 * CLAUSE 4, A ROW KEEPS ITS NAME. Where a user-scrollable ancestor exists, the
 * drive scrolls it to its right edge, exactly as a thumb would, and the first
 * cell of a data row must still be on screen. A table fitting its width passes
 * this trivially and correctly. A number with no noun beside it is not a fact
 * an organiser can use: "18" in a column whose heading and row label have both
 * scrolled away is the same defect as an unattributed refusal.
 *
 * AND THIS CLAUSE WAS TOO LENIENT ON ITS FIRST RUN, which is recorded here
 * rather than quietly tightened. It asked whether the first cell OVERLAPPED
 * the scroller at all, so the GST report at 390 passed it with "Jul-Sep 2026"
 * sitting at -66..23: twenty-three pixels of an eighty-nine pixel label, which
 * renders as "Jul" against four numbers. A sliver of a row label is not a row
 * that says whose row it is. Containment is now total, both edges, which is
 * the same test clause 2 of the events-list drive already used on a title.
 *
 * CLAUSE 5, A CONTROL IS AT LEAST 44px ON ITS SMALLER SIDE. The constitution's
 * standing minimum, applied to the controls inside these tables rather than to
 * the page around them.
 *
 * ============================================================================
 * WHAT THIS DRIVE DOES NOT COVER, SAID HERE RATHER THAN OMITTED
 * ============================================================================
 *
 * The LINEUP table (`/dashboard/events/[id]/lineup`) renders only when the
 * `broadcast_artists` flag is on, and that flag is OFF by a dated founder
 * decision recorded in src/lib/flags/broadcast.ts: "OFF at launch,
 * deliberately". The row lives in a TEST database three build lanes share.
 * Flipping a founder-decided switch to make a drive greener is not this lane's
 * to do, so the lineup table is fixed in source and covered by the registered
 * guard, and it is NOT driven. That is stated in the report rather than left
 * for a reader to infer from a surface missing off the list.
 *
 * TEST ONLY, checked twice: assertNotProduction() from the one module that
 * owns that decision, then an explicit TEST-ref check on the URL. Every row it
 * creates carries `lane-c` and is removed at the end.
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/organiser-tables-fit-drive.mjs \
 *       --serve --port=3200 --label=before
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { measureTable, scrollRightAndReadTheRowName } from './lib/table-fit.mjs'

assertNotProduction()

const TAG = '[organiser-tables-fit]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'organiser-tables')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null, orgId: null, eventIds: [], orderIds: [], linkIds: [] }

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

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

let stopServer = null
try {
  /* ----------------------------------------------------------------------
   * THE FIXTURE. One organiser, one organisation, one event, and real rows
   * behind each of the three drivable tables. Every column name below was
   * read out of src/types/database.ts and every filter out of the module
   * that builds the surface; none of it is guessed.
   * -------------------------------------------------------------------- */
  const password = randomBytes(12).toString('base64url') + '-Aa1'
  const email = `lane-c-tables-${stamp}@eventlinqs.test`
  const owner = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create the organiser').user
  created.userId = owner.id

  // `gst_registered` true and a real-shaped ABN, because buildGstReport
  // answers `notApplicableReason` and renders NO TABLE otherwise. `pending`
  // so nothing here is published into a sitemap three lanes read.
  const org = must(
    await admin
      .from('organisations')
      .insert({
        name: `Lane C Tables ${stamp}`,
        slug: `lane-c-tables-${stamp}`,
        owner_id: owner.id,
        status: 'pending',
        gst_registered: true,
        abn: '51824753556',
      })
      .select('id')
      .single(),
    'create the organisation',
  )
  created.orgId = org.id

  const start = new Date(Date.now() + 21 * 864e5).toISOString()
  const end = new Date(Date.now() + 21 * 864e5 + 3 * 36e5).toISOString()
  const event = must(
    await admin
      .from('events')
      .insert({
        title: `Lane C Tables Night ${stamp}`,
        slug: `lane-c-tables-night-${stamp}`,
        organisation_id: org.id,
        created_by: owner.id,
        start_date: start,
        end_date: end,
        timezone: 'Australia/Melbourne',
        status: 'draft',
        visibility: 'unlisted',
        is_free: false,
        cover_image_url: 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/proof/cover.jpg',
        venue_name: 'The Wool Exchange',
        venue_address: '44 Moorabool Street',
        venue_city: 'Geelong',
      })
      .select('id, slug, title')
      .single(),
    'create the event',
  )
  created.eventIds.push(event.id)

  /*
   * DISCOUNTS. Three codes, chosen to make the row as WIDE as a real one gets
   * rather than as narrow as a fixture can be: a percentage code, a fixed
   * amount in dollars, and an expiring code with a use cap. A fixture that
   * seeds "AB1" and no expiry measures a table nobody has.
   */
  const CODES = [
    { code: `LANECEARLYBIRD${stamp}`.toUpperCase().slice(0, 20), discount_type: 'percentage', discount_percentage: 15, max_uses: 50, current_uses: 0, is_active: true, valid_until: new Date(Date.now() + 14 * 864e5).toISOString() },
    { code: `LANECMATES${stamp}`.toUpperCase().slice(0, 20), discount_type: 'fixed_amount', discount_amount_cents: 1000, currency: 'AUD', max_uses: null, current_uses: 0, is_active: true, valid_until: null },
    { code: `LANECCLOSED${stamp}`.toUpperCase().slice(0, 20), discount_type: 'percentage', discount_percentage: 100, max_uses: 5, current_uses: 0, is_active: false, valid_until: new Date(Date.now() + 3 * 864e5).toISOString() },
  ]
  const firstCode = CODES[0].code
  must(
    await admin.from('discount_codes').insert(CODES.map((c) => ({ ...c, event_id: event.id, organisation_id: org.id }))).select('id'),
    'create the discount codes',
  )

  /*
   * REACH. Tracked links on three channels with views, clicks and one
   * conversion each, plus the confirmed orders those conversions point at.
   * `fetchReachSummary` renders no table at all when there is no link, and
   * only counts a conversion's TICKETS when the order is in a sold status.
   */
  const CHANNELS = ['whatsapp', 'instagram', 'email']
  const orderIds = []
  for (const [index, channel] of CHANNELS.entries()) {
    const link = must(
      await admin
        .from('share_links')
        .insert({ event_id: event.id, channel, code: `lc${stamp}${index}`, created_by: owner.id })
        .select('id')
        .single(),
      `create the ${channel} share link`,
    )
    created.linkIds.push(link.id)

    const order = must(
      await admin
        .from('orders')
        .insert({
          event_id: event.id,
          organisation_id: org.id,
          order_number: `LC-${stamp}-${index}`.toUpperCase(),
          status: 'confirmed',
          subtotal_cents: 4500 * (index + 1),
          total_cents: 4500 * (index + 1),
          currency: 'AUD',
          confirmed_at: new Date(Date.now() - (index + 1) * 864e5).toISOString(),
          guest_email: `lane-c-buyer-${stamp}-${index}@eventlinqs.test`,
        })
        .select('id')
        .single(),
      `create the ${channel} order`,
    )
    orderIds.push(order.id)
    created.orderIds.push(order.id)

    const events = []
    for (let i = 0; i < 4 + index; i += 1) events.push({ link_id: link.id, kind: 'view', visitor_hash: `lc-${stamp}-v${index}-${i}` })
    for (let i = 0; i < 2 + index; i += 1) events.push({ link_id: link.id, kind: 'click', visitor_hash: `lc-${stamp}-c${index}-${i}` })
    events.push({ link_id: link.id, kind: 'conversion', order_id: order.id, visitor_hash: `lc-${stamp}-x${index}` })
    must(await admin.from('share_link_events').insert(events).select('id'), `create the ${channel} link events`)
  }

  /* ----------------------------------------------------------------------
   * THE SERVER.
   * -------------------------------------------------------------------- */
  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the organiser tables drive server was started', 'pass --port= for one this lane owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), `.tmp/organiser-tables-server-${LABEL}.log`, { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }

  /*
   * THE SURFACES. `identity` is a string this drive wrote into the database,
   * so clause 1 cannot be satisfied by an empty table or a login form.
   */
  const SURFACES = [
    { key: 'discounts', title: 'discount codes', path: `/dashboard/events/${event.id}/discounts`, identity: firstCode, expectsControls: true },
    { key: 'reach', title: 'reach by channel', path: `/dashboard/events/${event.id}/reach`, identity: 'WhatsApp', expectsControls: false },
    { key: 'gst', title: 'the GST report', path: '/dashboard/reports/gst', identity: 'All time', expectsControls: false },
  ]

  /*
   * THE SECOND DEFECT, FOUND IN THE SCREENSHOT OF THE FIRST ONE'S FIX.
   *
   * Every organiser event sub-page opens with the same header row: a back
   * link, an h1, a separator dot, and the event's title. Five of the eight
   * write it `flex flex-wrap items-center gap-3` and three write it `flex
   * items-center gap-3`. With no wrap the four items compete for 356px, so
   * "Discount Codes" broke over two lines beside an event title also broken
   * over two, with the separator dot orphaned between them at mid-height.
   *
   * The clause counts LINE BOXES over the heading's own text with a Range,
   * rather than guessing from its height, and it needs no threshold: these
   * headings are one or two short words and fit a phone with room to spare.
   * One line is the correct answer at every width, and two means the row
   * could not wrap.
   *
   * The order pages are in this list and not in SURFACES because they carry
   * the same header and no table at all. A defect is fixed where it is, not
   * only where the item that found it was looking.
   */
  const HEADINGS = [
    { key: 'discounts', heading: 'Discount Codes', path: `/dashboard/events/${event.id}/discounts` },
    { key: 'orders', heading: 'Orders', path: `/dashboard/events/${event.id}/orders` },
    { key: 'order', heading: 'Order', path: `/dashboard/events/${event.id}/orders/${orderIds[0]}` },
    { key: 'reach', heading: 'Reach', path: `/dashboard/events/${event.id}/reach` },
  ]

  const browser = await chromium.launch()
  const measurements = []
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      })
      const page = await context.newPage()

      await page.goto(`${BASE}/login`, { waitUntil: 'load' })
      await answerTheCookieBanner(page)
      await page.fill('input[name="email"]', email)
      await page.fill('input[name="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })

      for (const surface of SURFACES) {
        await page.goto(`${BASE}${surface.path}`, { waitUntil: 'load' })
        await answerTheCookieBanner(page)

        // CLAUSE 1. The seeded row is on screen, so every clause below is
        // about a table that actually rendered this fixture's data.
        const seeded = page.getByText(surface.identity, { exact: false }).first()
        const found = await seeded
          .waitFor({ state: 'attached', timeout: 30000 })
          .then(() => true)
          .catch(() => false)
        check(`${vp.label} ${surface.title}: the seeded row rendered`, found, found ? `found "${surface.identity}"` : `"${surface.identity}" never appeared on ${surface.path}`)
        if (!found) {
          await page.screenshot({ path: join(OUT, `${LABEL}-${vp.label}-${surface.key}-MISSING.png`), fullPage: false })
          continue
        }

        const table = seeded.locator('xpath=ancestor::table[1]')
        const measured = await table.evaluate(measureTable)
        const rowName = await table.evaluate(scrollRightAndReadTheRowName)

        // CLAUSE 2. Nothing clipped by a box a finger cannot scroll.
        check(
          `${vp.label} ${surface.title}: nothing is clipped by a box a finger cannot scroll`,
          measured.clipped.length === 0,
          measured.clipped.length === 0
            ? `${measured.ancestors.filter((a) => a.userScrollable).length} swipeable ancestor(s), 0 clipping`
            : measured.clipped.map((c) => `${c.tag} shows ${c.clientWidth} of ${c.scrollWidth} and hides the rest`).join('; '),
        )

        // CLAUSE 3. Every control reachable.
        const dead = measured.controls.filter((c) => c.unreachable)
        check(
          `${vp.label} ${surface.title}: every control in the table can be reached`,
          dead.length === 0,
          dead.length === 0
            ? `${measured.controls.length} control(s), all reachable`
            : dead.map((c) => `"${c.label}" at ${c.left}..${c.right} is outside ${c.unreachable}`).join('; '),
        )

        // CLAUSE 4. A row keeps its name.
        check(
          `${vp.label} ${surface.title}: a row still says whose row it is`,
          rowName.onScreen === true,
          rowName.scrolled
            ? `swiped to ${rowName.scrollLeft}px, "${rowName.name}" at ${rowName.left}..${rowName.right}`
            : `nothing to swipe, first cell at ${rowName.left}..${rowName.right}`,
        )

        // CLAUSE 5. Touch targets.
        const small = measured.controls.filter((c) => Math.min(c.width, c.height) < 44)
        check(
          `${vp.label} ${surface.title}: every control is at least 44px on its smaller side`,
          small.length === 0,
          small.length === 0
            ? `${measured.controls.length} control(s) at 44px or more`
            : small.map((c) => `"${c.label}" ${c.width}x${c.height}`).join('; '),
        )

        // The anti-false-pass on the controls themselves: a surface that
        // declares controls and renders none has lost them.
        if (surface.expectsControls) {
          check(
            `${vp.label} ${surface.title}: the row's controls are present at all`,
            measured.controls.length > 0,
            `${measured.controls.length} control(s)`,
          )
        }

        measurements.push({ viewport: vp.label, surface: surface.key, path: surface.path, ...measured, rowName })
        await page.screenshot({ path: join(OUT, `${LABEL}-${vp.label}-${surface.key}.png`), fullPage: false })
      }

      // CLAUSE 6. The page heading is not squeezed by a header that cannot wrap.
      for (const header of HEADINGS) {
        await page.goto(`${BASE}${header.path}`, { waitUntil: 'load' })
        await answerTheCookieBanner(page)
        const h1 = page.locator('h1').first()
        const present = await h1
          .waitFor({ state: 'attached', timeout: 30000 })
          .then(() => true)
          .catch(() => false)
        if (!present) {
          check(`${vp.label} ${header.key}: the page has a heading to measure`, false, `no <h1> on ${header.path}`)
          continue
        }
        /*
         * DISTINCT LINE POSITIONS, NOT THE NUMBER OF RECTS, AND THIS DRIVE
         * ACCUSED THE PRODUCT ONCE BEFORE IT WAS CORRECTED.
         *
         * `Range.getClientRects()` returns a rect per TEXT NODE as well as per
         * line box. The order detail heading is `Order {order_number}`, which
         * is two text nodes, so a heading sitting comfortably on one line at
         * 1440 was reported as two lines and failed. The screenshot said so in
         * a second; the report did not. Counting distinct rounded `top` values
         * is the same technique the events-list drive uses to tell a row of
         * actions from a column of them, and it cannot be fooled by how the
         * markup happens to be split.
         */
        const lines = await h1.evaluate((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const rects = [...range.getClientRects()]
          return {
            lines: new Set(rects.map((r) => Math.round(r.top))).size,
            rects: rects.length,
            text: (el.textContent ?? '').trim().slice(0, 40),
          }
        })
        check(
          `${vp.label} ${header.key}: the page heading sits on one line`,
          lines.lines === 1,
          `"${lines.text}" over ${lines.lines} line(s), from ${lines.rects} text rect(s)`,
        )
        /*
         * CLAUSE 7, ON THE ONE PAGE THAT CAN SHOW IT. The orders this drive
         * seeds are GUEST orders with an email and no name, which is the exact
         * state that rendered "Name: :" after the em-dash scrub turned a
         * placeholder dash into a colon. The assertion is on what the page
         * says, not on what the source says, because the source was changed by
         * a sweep that never looked at a screen.
         */
        if (header.key === 'order') {
          const buyer = await page
            .getByText(/^Name:/)
            .first()
            .evaluate((el) => (el.parentElement?.textContent ?? '').trim())
            .catch(() => null)
          check(
            `${vp.label} order: a buyer with no name is described in words`,
            typeof buyer === 'string' && /Name:\s*[A-Za-z]/.test(buyer),
            buyer === null ? 'no Name: line on the page' : `"${buyer}"`,
          )
        }

        measurements.push({ viewport: vp.label, surface: `${header.key}-heading`, path: header.path, heading: lines })
        // Always, pass or fail. A closure block cites images, and an image that
        // exists only when something is broken cannot show that it is fixed.
        await page.screenshot({ path: join(OUT, `${LABEL}-${vp.label}-${header.key}-heading.png`), fullPage: false })
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  // The anti-false-pass on the run: five clauses on every surface at every
  // width, plus the sixth on the one surface that declares controls.
  // The last term is clause 7, which runs on the order detail page only.
  const EXPECTED = VIEWPORTS.length * (SURFACES.length * 5 + SURFACES.filter((s) => s.expectsControls).length + HEADINGS.length + 1)
  if (results.length < EXPECTED) {
    check('the drive performed every check it set out to perform', false, `${results.length} checks, expected ${EXPECTED}`)
  }
  writeFileSync(
    join(OUT, `organiser-tables-${LABEL}.json`),
    JSON.stringify({ base: BASE, stamp, surfaces: SURFACES.map((s) => s.path), measurements, results }, null, 2),
  )
} finally {
  if (stopServer) await stopServer()
  try {
    if (created.linkIds.length) await admin.from('share_link_events').delete().in('link_id', created.linkIds)
    if (created.linkIds.length) await admin.from('share_links').delete().in('id', created.linkIds)
    if (created.orderIds.length) await admin.from('orders').delete().in('id', created.orderIds)
    for (const id of created.eventIds) {
      const r = await admin.from('events').delete().eq('id', id)
      if (r.error) console.error(`${TAG} cleanup: could not delete event ${id}: ${r.error.message}`)
    }
    await admin.from('event_tombstones').delete().like('slug', `lane-c-tables-%-${stamp}`)
    if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
    if (created.userId) await tearDownAccountOrFailTheRun(admin, created.userId)
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
  }
}

if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
