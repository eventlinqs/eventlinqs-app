/**
 * LB-SEATWHOLE, DRIVEN: A ROOM BIGGER THAN THE CEILING, AND AN ORGANISER WHO
 * HAS TO SEAT EVERY PERSON IN IT.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO EVENTS AND NOT ONE, WHICH IS THE WHOLE POINT OF THE FIXTURE.
 *
 * The My Events sold count was produced by reading ONE ROW PER SOLD SEAT across
 * every reserved-seating event at once and tallying the rows in JavaScript.
 * Supabase caps a RESPONSE at 1,000 rows in silence (HTTP 200, `error` null, a
 * full-looking array; https://supabase.com/docs/reference/javascript/select,
 * fetched 2026-09-19), so the ceiling was SHARED BETWEEN EVENTS.
 *
 * A single event with 1,500 sold seats would prove a ceiling exists and would
 * not prove that. Two events with 800 sold each does: neither is near the
 * ceiling on its own, their sum is 1,600, and the old code could return at most
 * 1,000 of those rows. So the defect is visible only because the fixture has
 * two events in it, which is also the ordinary case for any organiser who has
 * run more than one show.
 *
 * ---------------------------------------------------------------------------
 * THE THREE CEILINGS, AND THE NUMBER CHOSEN TO CROSS EACH.
 *
 *   1,000  the PostgREST default. Crossed by the Grand Hall chart (2,150
 *          seats), by the door list (1,150 people waiting for a seat), and by
 *          the two events' sold seats added together (1,600).
 *   2,000  the launch kit's `.range(0, 1999)`. Crossed by the Grand Hall chart
 *          and by nothing else, which is why the Grand Hall is 2,150 rather
 *          than the 1,150 that would have been enough for the other two.
 *  10,000  the seat manager's old loop bound. NOT crossed by this fixture and
 *          deliberately so: writing ten thousand seats to the shared TEST
 *          project to prove an arithmetic bound would cost the other two lanes
 *          more than the proof is worth. It is proven instead by the drill that
 *          plants the loop back and by the unit test that names the literal.
 *          Stated here rather than left for a reader to notice.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH IS A NUMBER RATHER THAN A SCREENSHOT.
 *
 *   My Events         the Sold cell of BOTH events, read out of the table, each
 *                     against a count the DATABASE performed. Under the old
 *                     read their sum could not exceed 1,000.
 *   Seat Management   the Total tile equals every seat in the room, and the
 *                     "Awaiting seat assignment (n)" heading equals every
 *                     person waiting. The second is the one that costs
 *                     somebody a seat.
 *   the option count  the assignment selects render O(rows) options and not
 *                     rows TIMES seats, which is the defect uncapping the read
 *                     exposed on the same screen.
 *   the launch kit    the seat count and the open-seat count in its own
 *                     sentence, which is the artefact the organiser promotes
 *                     the event with.
 *   the chart list    the venue's charts and the protected-seat figure beside
 *                     each, the number an organiser checks before editing a
 *                     chart people already hold seats on.
 *   axe               zero violations at every impact level, on each screen,
 *                     signed in and POPULATED. An empty seat manager has
 *                     nothing on it to fail.
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off one disposable
 * organisation under `lane-b-seatwhole-presents-`, deleted by id and then
 * RE-READ rather than assumed.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-seatwhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-SEATWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-SEATWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-seatwhole-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const HALL_SEATS = 2150 // past the launch kit's old 2,000 bound
const DOOR_SEATS = 1200 // past the 1,000 default on its own chart
const SOLD_EACH = 800 // neither event near the ceiling; 1,600 between them
const WAITING = 1150 // people who have paid and have no seat yet
/* A few of every other status on the hall, so axe judges every badge. */
const HALL_SPREAD = { reserved: 100, held: 50, blocked: 30, accessible: 20 }
const PRICE_CENTS = 2500
const FEE_CENTS = 100

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

/** A count the SERVER performed. Never one accumulated here. */
async function serverCount(table, build) {
  const { count, error } = await build(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

/*
 * BATCHES OF 200, AND A RETRY, BECAUSE THE FIRST RUN LOST ONE.
 *
 * Run 1 wrote 3,350 seats and then failed with `TypeError: fetch failed` on the
 * second batch of 500 orders. That is the harness talking to Supabase over the
 * network, not the product: nothing under test was involved, and the run was
 * reported as a FATAL rather than quietly retried, which is the right default.
 * Recorded here rather than tidied away, because a harness that fails loudly
 * and is then believed has cost this project a day before.
 */
async function insertInBatches(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    let lastError = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await db.from(table).insert(batch)
      if (!error) {
        lastError = null
        break
      }
      lastError = error
      log(`  retrying ${table} at offset ${i} after ${error.message} (attempt ${attempt} of 3)`)
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
    if (lastError) throw new Error(`writing ${table} at offset ${i}: ${lastError.message}`)
  }
}

/** Ids in bites PostgREST can carry in a query string. */
function chunked(ids, size = 100) {
  const out = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/**
 * Every order row this drive wrote, deleted by its own lane tag, in chunks.
 * Tagged deletes rather than id lists wherever the tag is on the row itself,
 * because a tag cannot be too long for a URL.
 */
async function purgeOwnRows() {
  /*
   * THE READ THAT FINDS THEM IS PAGED, AND I NEEDED TELLING.
   *
   * The first version of this cleanup read the order ids with one unbounded
   * select and printed "orders to remove 1000" against 1,150 rows it had
   * written itself moments before. The harness for the item about silent row
   * ceilings had a silent row ceiling in it. It is recorded rather than quietly
   * corrected, because it is the best evidence in this run of how invisible the
   * default is: I knew the number, I had just written it, and I still read 1,000
   * and moved on.
   */
  const ids = []
  for (let from = 0; ; ) {
    const { data, error } = await db
      .from('orders')
      .select('id')
      .like('order_number', 'LBSW-%')
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`reading own orders: ${error.message}`)
    if (!data || data.length === 0) break
    ids.push(...data.map(o => o.id))
    from += data.length
  }
  log(`removing ${ids.length} of this drive's own orders and everything hanging off them`)
  for (const table of ['tickets', 'payments', 'order_items']) {
    for (const chunk of chunked(ids)) {
      const { error: e } = await db.from(table).delete().in('order_id', chunk)
      if (e) throw new Error(`deleting ${table}: ${e.message}`)
    }
  }
  for (const chunk of chunked(ids)) {
    const { error: e } = await db.from('orders').delete().in('id', chunk)
    if (e) throw new Error(`deleting orders: ${e.message}`)
  }
}

async function axeViolations(page) {
  await page.addScriptTag({ path: AXE_PATH })
  return page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return r.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.target?.join(' ') ?? '',
    }))
  })
}

function describeViolations(found) {
  if (found.length === 0) return 'zero violations at every impact level'
  return found.map(v => `${v.impact}:${v.id}(${v.nodes}) ${v.sample.slice(0, 60)}`).join(' | ')
}

/**
 * Build a chart of `total` seats laid out in rows of 50, with `sold` of them
 * marked sold. Rows are labelled AA, AB ... so that many seats SHARE a row
 * label, which is what makes `row_label` a non-total paging order and is the
 * condition the guard's clause 3 exists for.
 */
function seatRows(eventId, sectionId, tierId, total, sold, spread = {}) {
  /*
   * EVERY STATUS IS REPRESENTED WHERE THE CALLER ASKS FOR IT, and the reason is
   * axe rather than realism. Run 3 of this drive found a serious
   * colour-contrast failure on the "Move attendee" button, which renders once
   * per SOLD seat, and found it 800 times. It could NOT find the identical
   * failure on the Reserved badge, because the fixture had no reserved seats: a
   * scan of a populated screen is only as broad as the states the fixture puts
   * on it. So the hall now carries a few of each.
   */
  const PER_ROW = 50
  const plan = []
  for (let i = 0; i < sold; i += 1) plan.push('sold')
  for (const [status, n] of Object.entries(spread)) {
    for (let i = 0; i < n; i += 1) plan.push(status)
  }
  while (plan.length < total) plan.push('available')

  const rows = []
  for (let i = 0; i < total; i += 1) {
    const r = Math.floor(i / PER_ROW)
    rows.push({
      id: randomUUID(),
      event_id: eventId,
      seat_map_section_id: sectionId,
      ticket_tier_id: tierId,
      row_label: `${String.fromCharCode(65 + Math.floor(r / 26))}${String.fromCharCode(65 + (r % 26))}`,
      seat_number: String((i % PER_ROW) + 1),
      seat_type: 'standard',
      status: plan[i],
      held_reason: plan[i] === 'held' ? 'comp' : null,
      x: (i % PER_ROW) * 20,
      y: r * 20,
      price_cents: PRICE_CENTS,
    })
  }
  return rows
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-seatwhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-seatwhole+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`

  const { ownerId, org, event: hall, tier: hallTier } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: HALL_SEATS,
    priceCents: PRICE_CENTS,
    log,
    brand: {
      org: 'Lane B Seatwhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Seatwhole Grand Hall',
      eventSlug: 'lane-b-seatwhole-grand-hall',
      owner: 'Lane B Seatwhole Owner',
    },
  })
  const orgId = org.id
  log(`organisation ${orgId}, grand hall ${hall.id}, organiser ${ownerId}`)

  // buildFixture returns the event narrow; the cover is copied so the second
  // event is not the one bare tile on a screen this item is photographing.
  const { data: hallRow } = await db
    .from('events')
    .select('cover_image_url')
    .eq('id', hall.id)
    .maybeSingle()

  let venueId = null
  try {
    // ---------------------------------------------------------------- the venue
    const { data: venue, error: venueError } = await db
      .from('venues')
      .insert({
        organisation_id: orgId,
        name: `Lane B Seatwhole Hall ${stamp}`,
        address: '1 Seatwhole Street',
        city: 'Geelong',
        state: 'VIC',
        country: 'Australia',
        is_active: true,
      })
      .select('id')
      .single()
    if (venueError) throw new Error(`venue: ${venueError.message}`)
    venueId = venue.id

    const { data: chart, error: chartError } = await db
      .from('seat_maps')
      .insert({
        venue_id: venueId,
        name: `Lane B Seatwhole Chart ${stamp}`,
        total_seats: HALL_SEATS,
        layout: { totalSeats: HALL_SEATS, sections: [], areas: [] },
        is_active: true,
      })
      .select('id')
      .single()
    if (chartError) throw new Error(`seat map: ${chartError.message}`)

    const { data: section, error: sectionError } = await db
      .from('seat_map_sections')
      /*
       * THE SECTION CARRIES THE LANE TAG TOO. Three lanes share this TEST
       * project and the protocol is that a row says whose it is ON SIGHT.
       * `seat_map_sections` has a name column, so a bare "Stalls" was the one
       * row this fixture wrote that a neighbour could not identify, even though
       * it cascades away with the chart.
       */
      .insert({
        seat_map_id: chart.id,
        name: `Lane B Seatwhole Stalls ${stamp}`,
        color: '#1F5673',
        sort_order: 0,
      })
      .select('id')
      .single()
    if (sectionError) throw new Error(`section: ${sectionError.message}`)

    // ------------------------------------------------- the second event, the door
    const startDate = new Date(Date.now() + 28 * 864e5)
    const { data: door, error: doorError } = await db
      .from('events')
      .insert({
        title: `Lane B Seatwhole Door List ${stamp}`,
        slug: `${SLUG_PREFIX}-door-list-${stamp}`,
        description: 'Fixture event for the organiser-assigns seating list.',
        summary: 'Lane B Seatwhole door list fixture',
        organisation_id: orgId,
        created_by: ownerId,
        start_date: startDate.toISOString(),
        end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
        timezone: 'Australia/Sydney',
        event_type: 'in_person',
        venue_name: 'Lane B Seatwhole Hall',
        venue_address: '1 Seatwhole Street',
        venue_city: 'Geelong',
        venue_state: 'VIC',
        venue_country: 'Australia',
        status: 'published',
        /*
         * UNLISTED, NOT PUBLIC. `fixtures-are-not-published` caught this on its
         * first run over the drive: a public fixture event enters the sitemap
         * that three lanes read and one lane deletes from, and derives a
         * /venues/<handle> page from its venue name as well. Unlisted is
         * excluded by PUBLIC_EVENT_MATCH and the event page still renders in
         * full, which is all this drive needs since every screen it visits is
         * behind the organiser login.
         */
        visibility: 'unlisted',
        published_at: new Date().toISOString(),
        cover_image_url: hallRow?.cover_image_url ?? null,
        is_age_restricted: false,
        max_capacity: DOOR_SEATS,
        is_free: false,
        fee_pass_type: 'pass_to_buyer',
        has_reserved_seating: true,
        organiser_assigns_seats: true,
        seat_map_id: chart.id,
        venue_id: venueId,
      })
      .select('id, slug, title')
      .single()
    if (doorError) throw new Error(`door event: ${doorError.message}`)

    const { data: doorTier, error: doorTierError } = await db
      .from('ticket_tiers')
      .insert({
        event_id: door.id,
        name: 'Reserved Seat',
        description: 'Lane B Seatwhole door tier',
        tier_type: 'general_admission',
        price: PRICE_CENTS,
        currency: 'AUD',
        total_capacity: DOOR_SEATS,
        sold_count: 0,
        reserved_count: 0,
        min_per_order: 1,
        max_per_order: 10,
        sort_order: 0,
        is_visible: true,
        is_active: true,
        dynamic_pricing_enabled: false,
        requires_access_code: false,
      })
      .select('id')
      .single()
    if (doorTierError) throw new Error(`door tier: ${doorTierError.message}`)

    // The Grand Hall becomes reserved seating on the same chart.
    const { error: hallUpdateError } = await db
      .from('events')
      .update({
        has_reserved_seating: true,
        organiser_assigns_seats: false,
        seat_map_id: chart.id,
        venue_id: venueId,
      })
      .eq('id', hall.id)
    if (hallUpdateError) throw new Error(`hall reserved seating: ${hallUpdateError.message}`)

    // -------------------------------------------------------------- the seats
    await insertInBatches(
      'seats',
      seatRows(hall.id, section.id, hallTier.id, HALL_SEATS, SOLD_EACH, HALL_SPREAD),
    )
    log(`wrote ${HALL_SEATS} seats on the grand hall, ${SOLD_EACH} of them sold`)
    await insertInBatches('seats', seatRows(door.id, section.id, doorTier.id, DOOR_SEATS, SOLD_EACH))
    log(`wrote ${DOOR_SEATS} seats on the door list event, ${SOLD_EACH} of them sold`)

    // ------------------------------------------- the people waiting for a seat
    /*
     * ORDER, ITEM AND TICKET for every one of them, written OLDEST FIRST, which
     * matches the read the defect lived in. The read was `.order('created_at')`
     * ascending with no bound, so the people a capped read dropped were the
     * LAST to buy. Waiting attendee 01149 is therefore the single most useful
     * row here: an uncapped read has to reach the end to find them.
     */
    const now = Date.now()
    const orderRows = []
    for (let i = 0; i < WAITING; i += 1) {
      orderRows.push({
        id: randomUUID(),
        organisation_id: orgId,
        event_id: door.id,
        order_number: `LBSW-${stamp}-${String(i).padStart(5, '0')}`,
        guest_email: `lane-b-seatwhole+${stamp}-${String(i).padStart(5, '0')}@eventlinqs.test`,
        guest_name: `Waiting ${i}`,
        status: 'confirmed',
        subtotal_cents: PRICE_CENTS,
        discount_cents: 0,
        platform_fee_cents: FEE_CENTS,
        processing_fee_cents: 0,
        total_cents: PRICE_CENTS,
        currency: 'AUD',
        created_at: new Date(now - (WAITING - i) * 60_000).toISOString(),
      })
    }
    await insertInBatches('orders', orderRows)

    const itemRows = orderRows.map(o => ({
      id: randomUUID(),
      order_id: o.id,
      item_type: 'ticket',
      item_name: 'Reserved Seat',
      ticket_tier_id: doorTier.id,
      quantity: 1,
      unit_price_cents: PRICE_CENTS,
      total_cents: PRICE_CENTS,
      created_at: o.created_at,
    }))
    await insertInBatches('order_items', itemRows)

    const ticketRows = itemRows.map((item, i) => ({
      event_id: door.id,
      order_id: item.order_id,
      order_item_id: item.id,
      ticket_tier_id: doorTier.id,
      idx_in_item: 0,
      ticket_code: `LBSW-${stamp}-${String(i).padStart(5, '0')}`,
      holder_name: `Waiting ${String(i).padStart(5, '0')}`,
      holder_email: `lane-b-seatwhole+${stamp}-${String(i).padStart(5, '0')}@eventlinqs.test`,
      status: 'valid',
      // No seat_id: that is what "awaiting seat assignment" means.
      created_at: item.created_at,
    }))
    await insertInBatches('tickets', ticketRows)
    log(`wrote ${ticketRows.length} paid ticket holders with no seat yet`)

    // ------------------------------------------- what the database itself says
    const hallSeats = await serverCount('seats', q => q.eq('event_id', hall.id))
    const doorSeatsCount = await serverCount('seats', q => q.eq('event_id', door.id))
    const hallSold = await serverCount('seats', q => q.eq('event_id', hall.id).eq('status', 'sold'))
    const doorSold = await serverCount('seats', q => q.eq('event_id', door.id).eq('status', 'sold'))
    const hallAvailable = await serverCount('seats', q =>
      q.eq('event_id', hall.id).eq('status', 'available'),
    )
    const hallProtected = await serverCount('seats', q =>
      q.eq('event_id', hall.id).in('status', ['reserved', 'sold', 'held']),
    )
    const doorProtected = await serverCount('seats', q =>
      q.eq('event_id', door.id).in('status', ['reserved', 'sold', 'held']),
    )
    const doorAvailable = await serverCount('seats', q =>
      q.eq('event_id', door.id).eq('status', 'available'),
    )
    const protectedTogether = hallProtected + doorProtected
    const waiting = await serverCount('tickets', q =>
      q.eq('event_id', door.id).eq('status', 'valid').is('seat_id', null),
    )
    const soldTogether = hallSold + doorSold
    log(
      `database says: hall ${hallSeats} seats (${hallSold} sold), door ${doorSeatsCount} seats ` +
        `(${doorSold} sold), ${waiting} waiting; ${soldTogether} sold between the two events`,
    )

    check(
      'lb-seatwhole.fixture.crosses-every-ceiling-it-claims-to',
      hallSeats === HALL_SEATS &&
        doorSeatsCount === DOOR_SEATS &&
        soldTogether === SOLD_EACH * 2 &&
        waiting === WAITING &&
        hallSeats > 2000 &&
        soldTogether > 1000 &&
        hallSold < 1000 &&
        doorSold < 1000 &&
        waiting > 1000,
      `hall ${hallSeats} seats (${hallAvailable} available, ${hallProtected} reserved, sold or ` +
        `held) is ${hallSeats - 2000} past the launch kit's old 2,000 bound; ` +
        `${waiting} waiting is ${waiting - 1000} past the 1,000 default; and ${soldTogether} sold ` +
        `between two events NEITHER of which reaches the ceiling alone (${hallSold} and ${doorSold}), ` +
        'which is the shared-response ceiling the old tally could not survive',
    )

    // -------------------------------------------------------- the RPC directly
    const { data: rpcMany, error: rpcError } = await db.rpc('event_seat_status_counts_many', {
      p_event_ids: [hall.id, door.id],
    })
    if (rpcError) throw new Error(`event_seat_status_counts_many: ${rpcError.message}`)
    check(
      'lb-seatwhole.rpc.counts-both-events-past-the-shared-ceiling',
      rpcMany?.[hall.id]?.sold === hallSold &&
        rpcMany?.[door.id]?.sold === doorSold &&
        rpcMany?.[hall.id]?.total === hallSeats &&
        rpcMany?.[door.id]?.total === doorSeatsCount,
      `the function returned hall ${rpcMany?.[hall.id]?.sold}/${rpcMany?.[hall.id]?.total} and door ` +
        `${rpcMany?.[door.id]?.sold}/${rpcMany?.[door.id]?.total} in one round trip, matching the ` +
        'counts the database performed independently above',
    )

    // ------------------------------------------------------------- the driving
    const browser = await chromium.launch()
    try {
      const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const signInPage = await signIn.newPage()
      await signInPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(signInPage)
      await signInPage.getByLabel(/email/i).first().fill(ownerEmail)
      await signInPage.getByLabel(/password/i).first().fill(ownerPassword)
      await Promise.all([
        signInPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
        signInPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
      ])
      await signInPage.waitForTimeout(2000)
      const state = await signIn.storageState()
      await signIn.close()
      check(
        'lb-seatwhole.signin.organiser-is-signed-in',
        state.cookies.some(c => /sb-.*-auth-token/.test(c.name)),
        `${state.cookies.length} cookies, session present`,
      )

      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: state,
        })
        const page = await context.newPage()
        const shot = async name =>
          page.screenshot({ path: join(OUT, 'drive', `${name}-${vp.label}.png`), fullPage: false })

        // ------------------------------------------------------- My Events
        await page.goto(`${BASE}/dashboard/events?organisation=${orgId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await answerTheCookieBanner(page)
        await page.getByRole('heading', { name: /my events/i }).first().waitFor({ timeout: 60000 })
        await shot('my-events')

        const soldCellFor = async title => {
          const row = page.locator('tr', { hasText: title }).first()
          const cells = row.locator('td')
          return (await cells.nth(3).innerText()).trim()
        }
        const hallCell = await soldCellFor(hall.title)
        const doorCell = await soldCellFor(door.title)
        check(
          `lb-seatwhole.my-events.both-sold-counts-are-whole.${vp.label}`,
          hallCell === `${hallSold} / ${HALL_SEATS}` && doorCell === `${doorSold} / ${DOOR_SEATS}`,
          `grand hall reads "${hallCell}", door list reads "${doorCell}"; they sum to ` +
            `${soldTogether}, and the tally they replaced could return at most 1,000 rows in total`,
        )
        check(
          `lb-seatwhole.my-events.no-count-reads-unknown.${vp.label}`,
          !(await page.locator('td', { hasText: /^Unknown$/ }).first().isVisible().catch(() => false)),
          'no row falls back to Unknown, so the count was read rather than defaulted',
        )
        check(
          `lb-seatwhole.my-events.is-accessible.${vp.label}`,
          (await axeViolations(page)).length === 0,
          describeViolations(await axeViolations(page)),
        )

        // ------------------------------------------------- Seat Management, hall
        await page.goto(`${BASE}/dashboard/events/${hall.id}/seats`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await page.getByText('Seat Management').first().waitFor({ timeout: 120000 })
        await shot('seats-grand-hall')

        /*
         * THE STAT TILE, FOUND BY ITS LABEL AND READ FROM ITS CARD.
         *
         * Run 2 timed out here on a `locator('div', { hasText: /^Total$/ })`.
         * `hasText` matches a node's whole text content, and the tile's card
         * reads "2150 Total", so an anchored pattern matched nothing and the
         * drive reported a 30-second timeout on a page that had rendered
         * correctly. The label is its own <p>; the number is its sibling; the
         * card is their parent.
         */
        const tileValue = async label => {
          const card = page.getByText(label, { exact: true }).first().locator('xpath=..')
          await card.waitFor({ timeout: 60000 })
          return (await card.innerText()).replace(/[^0-9]/g, '')
        }
        const total = await tileValue('Total')
        const sold = await tileValue('Sold')
        check(
          `lb-seatwhole.seats.chart-shows-every-seat.${vp.label}`,
          total === String(HALL_SEATS) && sold === String(hallSold),
          `the Total tile reads ${total} and the Sold tile ${sold} against ${HALL_SEATS} and ` +
            `${hallSold} in the database; the pager this replaced stopped at a short page and, ` +
            'past ten thousand, at a loop bound',
        )
        check(
          `lb-seatwhole.seats.is-accessible.${vp.label}`,
          (await axeViolations(page)).length === 0,
          describeViolations(await axeViolations(page)),
        )

        // ------------------------------------- Seat Management, the waiting list
        await page.goto(`${BASE}/dashboard/events/${door.id}/seats`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await page.getByText(/Awaiting seat assignment/i).first().waitFor({ timeout: 120000 })
        await shot('seats-door-list')

        const heading = await page.getByText(/Awaiting seat assignment/i).first().innerText()
        check(
          `lb-seatwhole.seats.every-paid-holder-is-listed.${vp.label}`,
          heading.includes(`(${WAITING})`),
          `"${heading.trim()}" against ${waiting} people who have paid and have no seat; the read ` +
            `this replaced returned 1,000 of them and the other ${waiting - 1000} could not be seated`,
        )

        const rendered = await page.locator('li select[aria-label^="Seat for"]').count()
        const options = await page.locator('li select[aria-label^="Seat for"] option').count()
        check(
          `lb-seatwhole.seats.the-assignment-list-does-not-square-itself.${vp.label}`,
          rendered === WAITING && options <= rendered * 2,
          `${rendered} assignment selects carrying ${options} options between them. Every row's ` +
            `list is filled on focus, so the page holds about one option per row instead of rows ` +
            `times available seats, which here would have been ${rendered * (HALL_SEATS - hallSold)}`,
        )

        // The control still works: focus one and the seats appear.
        /*
         * POLLED, NOT SLEPT. At 1440 with 1,150 rows on the page a fixed 300ms
         * wait read the select BEFORE React had re-rendered it, and the drive
         * reported 1 option where there are 401, while the identical code
         * passed at 768 and 390. That is the harness racing the product, and a
         * fixed sleep long enough today is a flake tomorrow.
         */
        const firstSelect = page.locator('li select[aria-label^="Seat for"]').first()
        await firstSelect.focus()
        let afterFocus = 0
        for (let attempt = 0; attempt < 60; attempt += 1) {
          afterFocus = await firstSelect.locator('option').count()
          if (afterFocus > 1) break
          await page.waitForTimeout(250)
        }
        check(
          `lb-seatwhole.seats.the-focused-row-offers-every-free-seat.${vp.label}`,
          afterFocus === doorAvailable + 1,
          `focusing one row's select fills it with ${afterFocus} entries against the placeholder ` +
            `plus all ${doorAvailable} free seats on that chart`,
        )
        check(
          `lb-seatwhole.seats.waiting-list-is-accessible.${vp.label}`,
          (await axeViolations(page)).length === 0,
          describeViolations(await axeViolations(page)),
        )

        // --------------------------------------------------------- the launch kit
        await page.goto(`${BASE}/dashboard/events/${hall.id}/launch-kit`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await page.getByText(/open right now/i).first().waitFor({ timeout: 120000 })
        await shot('launch-kit')

        const kitBody = await page.locator('body').innerText()
        check(
          `lb-seatwhole.launch-kit.its-own-sentence-is-true.${vp.label}`,
          kitBody.includes(`${HALL_SEATS} seats`) &&
            kitBody.includes(`${hallAvailable} open right now`),
          `it says "${HALL_SEATS} seats" and "${hallAvailable} open right now" against ${hallSeats} ` +
            `seats and ${hallAvailable} available in the database; the read it replaced stopped at ` +
            '2,000 and printed that as the size of the room',
        )
        check(
          `lb-seatwhole.launch-kit.is-accessible.${vp.label}`,
          (await axeViolations(page)).length === 0,
          describeViolations(await axeViolations(page)),
        )

        // --------------------------------------------------------- the chart list
        await page.goto(`${BASE}/dashboard/venues/${venueId}/seat-maps`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await page.getByText(new RegExp(`Lane B Seatwhole Chart ${stamp}`)).first().waitFor({ timeout: 60000 })
        await shot('seat-maps')

        const body = await page.locator('body').innerText()
        /*
         * MATCHED ON THE SENTENCE THE SCREEN ACTUALLY PRINTS. Run 3 failed
         * this on /2\s*events?/, because the chart list says "on 2 live events"
         * and the pattern left no room for the word live. The product was
         * right and the expectation had been written from memory of the code
         * rather than from the code.
         */
        const usage = body.match(/on (\d+) live events?(?:, (\d+) seats protected)?/)
        check(
          `lb-seatwhole.seat-maps.live-usage-counts-both-events.${vp.label}`,
          usage?.[1] === '2' && usage?.[2] === String(protectedTogether),
          `the chart list says "${usage?.[0] ?? 'nothing about live usage'}" against 2 published ` +
            `events on this chart and ${protectedTogether} reserved, sold or held seats between ` +
            'them, which is the figure that decides whether an organiser is warned before editing ' +
            'a chart people already hold seats on',
        )
        check(
          `lb-seatwhole.seat-maps.is-accessible.${vp.label}`,
          (await axeViolations(page)).length === 0,
          describeViolations(await axeViolations(page)),
        )

        await context.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    // ------------------------------------------------------------- the clean up
    log('deleting the fixture and RE-READING to confirm it is gone')
    /*
     * THE ORDER ROWS GO FIRST, IN CHUNKS, BEFORE THE SHARED PURGE.
     *
     * Run 2 left the whole fixture on TEST. `purgeFixtures` collects every
     * order id and deletes with a single `.in('order_id', orderIds)`; at 1,150
     * uuids that is a query string of about 42 KB and PostgREST answers 400 Bad
     * Request. The helper reports the failure, which is why this was visible at
     * all, and then the cascade of consequences reads as five unrelated errors:
     * the ticket_tiers delete trips an order_items check constraint, and the
     * events delete is refused by the money-records rule for orders that should
     * have gone already.
     *
     * Chunked here rather than in the shared helper, which the refund proofs
     * own; the limitation is written into REVIEW-QUEUE-B.md as a BORDER line so
     * the next lane to seed a thousand orders does not spend the hour again.
     */
    await purgeOwnRows()
    await purgeFixtures(db, log, SLUG_PREFIX)
    if (venueId) {
      await db.from('seat_maps').delete().eq('venue_id', venueId)
      await db.from('venues').delete().eq('id', venueId)
    }
    /*
     * RE-READ BY NAME, never assumed. `venues` carries no slug column, so the
     * venue is found by the name it was written under, which is the same
     * lane-b-seatwhole tag by another route.
     */
    const leftOrgs = await serverCount('organisations', q => q.like('slug', `${SLUG_PREFIX}-%`))
    const leftVenues = await serverCount('venues', q => q.like('name', 'Lane B Seatwhole Hall %'))
    const leftTickets = await serverCount('tickets', q => q.like('ticket_code', 'LBSW-%'))
    const leftOrders = await serverCount('orders', q => q.like('order_number', 'LBSW-%'))
    check(
      'lb-seatwhole.cleanup.test-is-left-as-found',
      leftOrgs === 0 && leftVenues === 0 && leftTickets === 0 && leftOrders === 0,
      `${leftOrgs} organisations, ${leftVenues} venues, ${leftTickets} tickets and ${leftOrders} ` +
        'orders left under the lane-b-seatwhole tag, each re-read by name rather than assumed',
    )
  }

  const passed = results.filter(r => r.ok).length
  log(`${passed} of ${results.length} checks passed`)
  writeFileSync(join(OUT, 'lb-seatwhole-drive.txt'), lines.join('\n') + '\n')
  writeFileSync(
    join(OUT, 'lb-seatwhole-drive.json'),
    JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2) + '\n',
  )
  if (passed !== results.length) process.exit(1)
}

main().catch(err => {
  log(`FATAL ${err.stack ?? err.message}`)
  writeFileSync(join(OUT, 'lb-seatwhole-drive.txt'), lines.join('\n') + '\n')
  process.exit(1)
})
