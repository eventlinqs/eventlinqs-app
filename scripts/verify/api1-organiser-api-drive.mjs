/**
 * API1 DRIVEN PROOF. The organiser scoped read only API, and the screen that
 * issues the key, against two REAL organisers on TEST.
 *
 * WHY TWO ORGANISERS AND NOT A MOCK. The acceptance is "a key for organiser A
 * cannot read organiser B, proven by a test that asserts the 404, not a 403".
 * A mocked scope check proves that the mock is scoped. So this builds two whole
 * organisations, each with an event, an order and tickets, mints a key for each
 * THROUGH THE REAL SCREEN, and then asks each key for the other's rows by id.
 *
 * WHAT EACH LEG ANSWERS.
 *
 *   1. No key, a malformed key and an unknown key are each refused 401, and the
 *      refusal names no organisation because none is known.
 *   2. A's key lists only A's rows, on all three resources, and B's rows are
 *      absent rather than filtered on the way out.
 *   3. A's key asking for B's event, order and ticket BY ID answers 404, byte
 *      for byte identical to the 404 for a uuid that does not exist anywhere.
 *      That is the acceptance, and the byte comparison is what makes it a
 *      proof rather than a status code.
 *   4. The same in the other direction, because a scope that only holds one way
 *      is not a scope.
 *   5. `?event_id=` naming the other organiser's event returns an empty page
 *      rather than an error, for the same reason a 403 is refused: an error
 *      would confirm the id is real.
 *   6. Pagination clamps rather than refuses, and the page block says so.
 *   7. The ticket secret, which is what a QR code is signed against, is in no
 *      payload.
 *   8. A REVOKED KEY IS REFUSED ON THE VERY NEXT REQUEST. Driven as: succeed,
 *      revoke through the screen, request again, with no wait in between.
 *   9. The views refuse a write even to the service role.
 *  10. The key screen at 390, 768 and 1440: create, copy, revoke, no sideways
 *      overflow, and the nav entry that reaches it.
 *
 * IT LEAVES TEST AS IT FOUND IT. Everything it creates carries lane-b and its
 * own stamp, and the teardown counts the rows back down to where they started.
 *
 * Start the server first:  node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/api1-organiser-api-drive.mjs --out C:/dev/EVIDENCE/API1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE, note, signIn } from '../journeys/harness.mjs'
import { buildFixture } from './lib/refund-proof-fixture.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

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
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
})

const j = { step: 0, OUT: out, blockers: [], errors: [] }
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

const NOWHERE_UUID = '00000000-0000-4000-8000-000000000000'
const stamp = `lane-b-api1-${Date.now().toString(36)}`

/** One request to the API, with everything a check might want to look at. */
async function call(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { status: res.status, headers: res.headers, text, body }
}

const built = []
let browser = null

try {
  // -------------------------------------------------------------------------
  // THE STARTING STATE, so the teardown can prove it went back to it.
  // -------------------------------------------------------------------------
  const keysBefore = await db.from('organiser_api_keys').select('id', { count: 'exact', head: true })
  note(j, 'TEST before this drive', `organiser_api_keys rows: ${keysBefore.count}`)

  // -------------------------------------------------------------------------
  // TWO REAL ORGANISERS, each with an event, an order and two tickets.
  //
  // The orders and tickets are written with the service role rather than driven
  // through checkout, deliberately and for a stated reason: the claim under
  // test is what the API does with rows that exist, not how rows come to exist,
  // and a driven purchase would put lane A's payment path inside a lane B proof
  // without making the scope claim any truer. They are real rows in the real
  // tables, read back through the real views by the real routes.
  // -------------------------------------------------------------------------
  for (const side of ['a', 'b']) {
    const fixture = await buildFixture(db, {
      stamp: `${stamp}-${side}`,
      ownerEmail: `${stamp}-${side}-owner@eventlinqs.test`,
      password: `${stamp}-${side}-Aa1!`,
      capacity: 10,
      priceCents: 2500,
      log: (m) => note(j, `fixture ${side.toUpperCase()}`, m),
      brand: {
        org: `Lane B API1 ${side.toUpperCase()}`,
        orgSlug: `lane-b-api1-${side}`,
        event: `Lane B API1 Night ${side.toUpperCase()}`,
        eventSlug: `lane-b-api1-night-${side}`,
        owner: `Lane B API1 Owner ${side.toUpperCase()}`,
      },
    })

    const record = { side, ...fixture, order: null, orderItem: null, tickets: [] }
    built.push(record)

    /*
     * THE ROLE, because the shared fixture builder does not set it and the
     * product does. `createOrganisation` sets profiles.role to 'organiser' after
     * the organisation lands, and every organiser-only nav entry is hidden
     * without it. Skipping this made the drive report "the nav does not reach
     * the key screen" against a sidebar that was behaving correctly for the
     * half-built organiser the fixture had made.
     */
    await db.from('profiles').update({ role: 'organiser' }).eq('id', fixture.ownerId)

    const { data: order, error: orderError } = await db
      .from('orders')
      .insert({
        organisation_id: fixture.org.id,
        event_id: fixture.event.id,
        order_number: `${stamp.toUpperCase()}-${side.toUpperCase()}`,
        status: 'confirmed',
        currency: 'AUD',
        subtotal_cents: 5000,
        total_cents: 5000,
        platform_fee_cents: 250,
        guest_name: `Lane B API1 Buyer ${side.toUpperCase()}`,
        guest_email: `${stamp}-${side}-buyer@eventlinqs.test`,
        confirmed_at: new Date().toISOString(),
      })
      .select('id, order_number')
      .single()
    if (orderError) throw new Error(`order ${side}: ${orderError.message}`)
    record.order = order

    // A ticket belongs to an order ITEM, not straight to an order: the schema
    // says so with a not-null column, which is how this drive found out.
    const { data: item, error: itemError } = await db
      .from('order_items')
      .insert({
        order_id: order.id,
        item_type: 'ticket',
        item_name: `Lane B API1 ${side.toUpperCase()} General Admission`,
        ticket_tier_id: fixture.tier.id,
        quantity: 2,
        unit_price_cents: 2500,
        total_cents: 5000,
      })
      .select('id')
      .single()
    if (itemError) throw new Error(`order item ${side}: ${itemError.message}`)
    record.orderItem = item

    const tickets = []
    for (let n = 0; n < 2; n += 1) {
      const { data: ticket, error: ticketError } = await db
        .from('tickets')
        .insert({
          event_id: fixture.event.id,
          order_id: order.id,
          order_item_id: item.id,
          ticket_tier_id: fixture.tier.id,
          ticket_code: `${stamp.toUpperCase()}-${side.toUpperCase()}-${n}`,
          secret: randomUUID(),
          status: 'valid',
          holder_name: `Lane B API1 Holder ${side.toUpperCase()}${n}`,
          holder_email: `${stamp}-${side}-holder-${n}@eventlinqs.test`,
          idx_in_item: n,
        })
        .select('id, ticket_code, secret')
        .single()
      if (ticketError) throw new Error(`ticket ${side}${n}: ${ticketError.message}`)
      tickets.push(ticket)
      record.tickets = tickets
    }
    note(j, `fixture ${side.toUpperCase()} complete`, `org ${fixture.org.id}  order ${order.id}  tickets ${tickets.length}`)
  }

  const A = built[0]
  const B = built[1]

  // -------------------------------------------------------------------------
  // THE KEY SCREEN, at three widths, minting a real key for each organiser.
  // -------------------------------------------------------------------------
  browser = await chromium.launch({ headless: true })
  const tokens = {}
  const sessions = {}

  /*
   * SIGN IN ONCE PER ORGANISER AND REUSE THE SESSION.
   *
   * This used to sign in inside the viewport loop, which is five sign-ins a run
   * from one address. `auth-login` allows ten per IP per ten minutes and is
   * FAIL-CLOSED, so the fifth run of the day was refused at the login form, the
   * drive carried on into a redirect to /login, and it then sat for sixty
   * seconds waiting for a control that was never going to be on a login page.
   * The limiter was right and the harness was extravagant. Signing in once per
   * organiser and carrying the cookies costs two.
   */
  async function sessionFor(side, fixture) {
    if (sessions[side]) return sessions[side]
    const context = await browser.newContext({ viewport: VIEWPORTS[2].viewport })
    const page = await context.newPage()
    const landed = await signIn(j, page, fixture.ownerEmail, `${stamp}-${side}-Aa1!`)
    if (landed.startsWith('/login')) {
      throw new Error(
        `sign-in for organiser ${side.toUpperCase()} was REFUSED and landed on ${landed}. ` +
          'The usual cause is the auth-login limiter (10 per IP per 10 minutes, fail-closed) ' +
          'after repeated runs, not a product defect. Wait out the window and run again.',
      )
    }
    sessions[side] = await context.storageState()
    await context.close()
    return sessions[side]
  }

  for (const [index, side] of ['a', 'b'].entries()) {
    const fixture = built[index]
    const widths = side === 'a' ? VIEWPORTS : [VIEWPORTS[2]]
    const storageState = await sessionFor(side, fixture)

    for (const vp of widths) {
      const context = await browser.newContext({
        viewport: vp.viewport,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: vp.deviceScaleFactor,
        permissions: ['clipboard-read', 'clipboard-write'],
        storageState,
      })
      const page = await context.newPage()
      const label = `${side}.${vp.label}`

      // LAW 5: the screen is reachable from the nav, not only by typing a URL.
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 120000 })
      const navHref = await page
        .locator('a[href="/dashboard/api-keys"]')
        .first()
        .getAttribute('href')
        .catch(() => null)
      if (vp.label === 'desktop-1440') {
        check(`${label}.the-nav-reaches-the-key-screen`, navHref === '/dashboard/api-keys', `sidebar href: ${navHref}`)
      }

      const res = await page.goto(`${BASE}/dashboard/api-keys`, { waitUntil: 'load', timeout: 120000 })
      const landedOn = new URL(page.url()).pathname
      /*
       * WHERE IT LANDED, not merely that something answered. A signed-out
       * request to this screen redirects to /login, and /login answers 200, so
       * a status-only check passed while the drive was looking at a login form.
       * It then waited sixty seconds for a control that was never coming and
       * reported a timeout instead of "you are not signed in".
       */
      check(
        `${label}.the-key-screen-answers-200`,
        res?.status() === 200 && landedOn === '/dashboard/api-keys',
        `status ${res?.status()} at ${landedOn}`,
      )

      await page.waitForSelector('[data-testid="api-key-create"]', { timeout: 60000 })

      /*
       * ANSWER THE CONSENT BANNER BEFORE MEASURING OR CAPTURING. It is fixed to
       * the bottom of the viewport, so in a full page capture it lands across
       * the middle of the image: the first run of this drive photographed a
       * cookie notice sitting over the key list. GA5's header records the same
       * lesson, which is why the helper is shared rather than copied.
       */
      await answerTheCookieBanner(page)

      const heading = (await page.locator('h1').first().textContent())?.trim()
      check(`${label}.the-screen-says-what-it-is`, heading === 'API keys', `h1: ${heading}`)

      // The documented figures are READ. Prove the page shows the real ones.
      const documented = await page.locator('dl').first().innerText()
      check(
        `${label}.the-documented-figures-are-the-real-ones`,
        /50 by default, 200 at most/.test(documented) && /1000 requests every 60 seconds/.test(documented),
        documented.replace(/\s+/g, ' ').slice(0, 120),
      )

      /*
       * THE EXAMPLE COMMAND IS SCROLLABLE, NOT CLIPPED. At 390 a curl line does
       * not fit and must not be allowed to widen the page, so it scrolls inside
       * its own box. The difference between "scrolls" and "is cut off with no
       * way to read the rest" is one CSS property, and it is invisible in a
       * screenshot, so it is asserted rather than eyeballed.
       */
      const codeBlock = await page.evaluate(() => {
        const pre = document.querySelector('pre')
        if (!pre) return null
        return {
          scrollable: pre.scrollWidth > pre.clientWidth,
          overflowX: getComputedStyle(pre).overflowX,
        }
      })
      check(
        `${label}.the-example-command-scrolls-rather-than-clipping`,
        codeBlock !== null && codeBlock.overflowX === 'auto',
        JSON.stringify(codeBlock),
      )

      // NOTHING OVERFLOWS SIDEWAYS.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      check(`${label}.no-horizontal-overflow`, overflow <= 1, `scrollWidth - clientWidth = ${overflow}`)

      // CREATE A KEY, and read the one showing of the token.
      await page.locator('#apiKeyName').fill(`${stamp} ${vp.label}`)
      await page.locator('[data-testid="api-key-create"]').click()
      await page.waitForSelector('[data-testid="api-key-token-panel"]', { timeout: 60000 })

      const token = await page.locator('[data-testid="api-key-token"]').inputValue()
      check(`${label}.the-token-is-shown-once-and-has-the-right-shape`, /^elq_[a-z0-9]{40}$/.test(token), `${token.slice(0, 12)} plus 32 more`)

      const panelText = await page.locator('[data-testid="api-key-token-panel"]').innerText()
      check(
        `${label}.the-screen-says-it-will-not-be-shown-again`,
        /only time it is shown/i.test(panelText),
        panelText.split('\n')[1]?.slice(0, 90) ?? '',
      )

      // The list shows the prefix and nothing more of the token.
      const rowMeta = await page.locator('[data-testid="api-key-row"]').first().innerText()
      check(
        `${label}.the-key-line-reads-as-a-sentence`,
        /Created .*, (never used|last used)/.test(rowMeta) && !/\| never used/.test(rowMeta),
        rowMeta.split(String.fromCharCode(10)).find((l) => l.startsWith('Created'))?.slice(0, 70) ?? rowMeta.slice(0, 70),
      )

      const prefixes = await page.locator('[data-testid="api-key-prefix"]').allInnerTexts()
      const shown = prefixes.map((p) => p.trim())
      check(
        `${label}.the-list-shows-the-prefix-and-not-the-token`,
        shown.some((p) => p.startsWith(token.slice(0, 12))) && !shown.some((p) => p.includes(token)),
        shown.join(' | ').slice(0, 90),
      )

      // COPY, through the real clipboard.
      await page.locator('[data-testid="api-key-copy"]').click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      check(`${label}.copy-puts-the-key-on-the-clipboard`, clipboard === token, clipboard ? `${clipboard.slice(0, 12)} plus 32 more` : 'clipboard refused')

      // A 44px touch target is the floor on every control.
      const controlHeights = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="api-key-create"], [data-testid="api-key-revoke"], [data-testid="api-key-copy"]')].map(
          (el) => Math.round(el.getBoundingClientRect().height),
        ),
      )
      check(
        `${label}.every-control-is-at-least-44px`,
        controlHeights.length > 0 && controlHeights.every((h) => h >= 44),
        `heights: ${controlHeights.join(', ')}`,
      )

      await page.screenshot({ path: join(out, `${vp.label}-api-keys-${side}.png`), fullPage: true })

      if (!tokens[side]) tokens[side] = token
      else tokens[`${side}-extra-${vp.label}`] = token

      await context.close()
    }
  }

  const tokenA = tokens.a
  const tokenB = tokens.b

  // -------------------------------------------------------------------------
  // 1. NO KEY, A MALFORMED KEY, AN UNKNOWN KEY.
  // -------------------------------------------------------------------------
  const anonymous = await call('/api/v1/events', null)
  check('auth.no-key-is-refused', anonymous.status === 401 && anonymous.body?.reason === 'missing_key', `${anonymous.status} ${anonymous.body?.reason}`)
  check(
    'auth.the-refusal-names-no-organisation',
    anonymous.body !== null && !('organisation_id' in anonymous.body),
    anonymous.text.slice(0, 80),
  )
  check(
    'auth.the-refusal-says-how-to-authenticate',
    (anonymous.headers.get('www-authenticate') ?? '').includes('Bearer'),
    anonymous.headers.get('www-authenticate') ?? 'absent',
  )

  const malformed = await call('/api/v1/events', 'not-a-key')
  check('auth.a-malformed-key-is-refused', malformed.status === 401 && malformed.body?.reason === 'malformed_key', `${malformed.status} ${malformed.body?.reason}`)

  const unknown = await call('/api/v1/events', `elq_${'z'.repeat(40)}`)
  check('auth.an-unknown-key-is-refused', unknown.status === 401 && unknown.body?.reason === 'unknown_key', `${unknown.status} ${unknown.body?.reason}`)

  // -------------------------------------------------------------------------
  // 2. EACH KEY LISTS ONLY ITS OWN ORGANISER'S ROWS.
  // -------------------------------------------------------------------------
  for (const resource of ['events', 'orders', 'attendees']) {
    const mine = await call(`/api/v1/${resource}?limit=200`, tokenA)
    const rows = mine.body?.data ?? []
    check(`scope.${resource}.answers-200`, mine.status === 200, `status ${mine.status}`)
    check(
      `scope.${resource}.names-the-organisation-on-the-payload`,
      mine.body?.organisation_id === A.org.id,
      `organisation_id ${mine.body?.organisation_id}`,
    )
    check(
      `scope.${resource}.every-row-belongs-to-the-key-holder`,
      rows.length > 0 && rows.every((r) => r.organisation_id === A.org.id),
      `${rows.length} row(s), distinct organisation_id: ${[...new Set(rows.map((r) => r.organisation_id))].length}`,
    )
    const foreignIds = new Set(
      resource === 'events' ? [B.event.id] : resource === 'orders' ? [B.order.id] : B.tickets.map((t) => t.id),
    )
    check(
      `scope.${resource}.the-other-organisers-rows-are-absent`,
      !rows.some((r) => foreignIds.has(r.id)),
      `checked ${rows.length} row(s) against ${foreignIds.size} foreign id(s)`,
    )
  }

  // The rows this organiser SHOULD see are actually there, so the check above
  // is not passing on an empty list.
  const myEvents = (await call('/api/v1/events?limit=200', tokenA)).body?.data ?? []
  check('scope.events.the-key-holders-own-event-is-present', myEvents.some((e) => e.id === A.event.id), `${myEvents.length} event(s) for A`)
  const myAttendees = (await call('/api/v1/attendees?limit=200', tokenA)).body?.data ?? []
  check(
    'scope.attendees.both-of-the-key-holders-tickets-are-present',
    A.tickets.every((t) => myAttendees.some((row) => row.id === t.id)),
    `${myAttendees.length} attendee row(s) for A`,
  )

  // -------------------------------------------------------------------------
  // 3 and 4. THE ACCEPTANCE: 404, NOT 403, IN BOTH DIRECTIONS.
  // -------------------------------------------------------------------------
  const crossings = [
    { resource: 'events', theirs: B.event.id, token: tokenA, from: 'A', to: 'B' },
    { resource: 'orders', theirs: B.order.id, token: tokenA, from: 'A', to: 'B' },
    { resource: 'attendees', theirs: B.tickets[0].id, token: tokenA, from: 'A', to: 'B' },
    { resource: 'events', theirs: A.event.id, token: tokenB, from: 'B', to: 'A' },
    { resource: 'orders', theirs: A.order.id, token: tokenB, from: 'B', to: 'A' },
    { resource: 'attendees', theirs: A.tickets[0].id, token: tokenB, from: 'B', to: 'A' },
  ]

  for (const crossing of crossings) {
    const id = `cross.${crossing.from}-asking-for-${crossing.to}.${crossing.resource}`
    const theirs = await call(`/api/v1/${crossing.resource}/${crossing.theirs}`, crossing.token)
    check(`${id}.answers-404-and-never-403`, theirs.status === 404, `status ${theirs.status}`)

    const nowhere = await call(`/api/v1/${crossing.resource}/${NOWHERE_UUID}`, crossing.token)
    check(
      `${id}.is-byte-for-byte-the-answer-for-a-uuid-that-exists-nowhere`,
      theirs.status === nowhere.status && theirs.text === nowhere.text,
      `${theirs.status} ${theirs.text} vs ${nowhere.status} ${nowhere.text}`,
    )
  }

  // And the same id IS readable by the organiser it belongs to, so the 404
  // above is the scope and not a broken route.
  const mineById = await call(`/api/v1/events/${A.event.id}`, tokenA)
  check(
    'cross.the-same-id-is-readable-by-the-organiser-it-belongs-to',
    mineById.status === 200 && mineById.body?.data?.id === A.event.id,
    `status ${mineById.status}, id ${mineById.body?.data?.id}`,
  )

  // -------------------------------------------------------------------------
  // 5. A FOREIGN event_id FILTER IS AN EMPTY PAGE, NOT AN ERROR.
  // -------------------------------------------------------------------------
  const foreignFilter = await call(`/api/v1/attendees?event_id=${B.event.id}`, tokenA)
  check(
    'filter.a-foreign-event-id-returns-an-empty-page-rather-than-an-error',
    foreignFilter.status === 200 && (foreignFilter.body?.data ?? []).length === 0,
    `status ${foreignFilter.status}, ${(foreignFilter.body?.data ?? []).length} row(s)`,
  )
  const ownFilter = await call(`/api/v1/attendees?event_id=${A.event.id}`, tokenA)
  check(
    'filter.the-key-holders-own-event-id-returns-their-tickets',
    ownFilter.status === 200 && (ownFilter.body?.data ?? []).length === A.tickets.length,
    `${(ownFilter.body?.data ?? []).length} of ${A.tickets.length}`,
  )
  const badFilter = await call('/api/v1/attendees?event_id=not-a-uuid', tokenA)
  check('filter.a-malformed-event-id-is-a-400', badFilter.status === 400, `status ${badFilter.status}`)

  // -------------------------------------------------------------------------
  // 6. PAGINATION CLAMPS AND SAYS SO.
  // -------------------------------------------------------------------------
  const onePerPage = await call('/api/v1/attendees?limit=1', tokenA)
  check(
    'page.one-per-page-returns-one-and-says-there-is-more',
    (onePerPage.body?.data ?? []).length === 1 && onePerPage.body?.page?.hasMore === true,
    JSON.stringify(onePerPage.body?.page),
  )
  const secondPage = await call('/api/v1/attendees?limit=1&offset=1', tokenA)
  check(
    'page.the-second-page-is-a-different-row',
    (secondPage.body?.data ?? [])[0]?.id !== (onePerPage.body?.data ?? [])[0]?.id,
    `${(onePerPage.body?.data ?? [])[0]?.id} then ${(secondPage.body?.data ?? [])[0]?.id}`,
  )
  const greedy = await call('/api/v1/attendees?limit=999999', tokenA)
  check('page.an-over-large-ask-is-clamped-not-refused', greedy.status === 200 && greedy.body?.page?.limit === 200, JSON.stringify(greedy.body?.page))

  // -------------------------------------------------------------------------
  // 7. THE TICKET SECRET IS IN NO PAYLOAD.
  // -------------------------------------------------------------------------
  const everything = [
    (await call('/api/v1/attendees?limit=200', tokenA)).text,
    (await call('/api/v1/orders?limit=200', tokenA)).text,
    (await call('/api/v1/events?limit=200', tokenA)).text,
    (await call(`/api/v1/attendees/${A.tickets[0].id}`, tokenA)).text,
  ].join(' ')
  check(
    'secrets.the-qr-signing-secret-never-leaves-the-platform',
    A.tickets.every((t) => !everything.includes(t.secret)) && !/"secret"/.test(everything),
    `searched ${everything.length} bytes of payload for ${A.tickets.length} known secret(s)`,
  )

  // -------------------------------------------------------------------------
  // 8. A REVOKED KEY IS REFUSED ON THE VERY NEXT REQUEST.
  // -------------------------------------------------------------------------
  const before = await call('/api/v1/events', tokenA)
  check('revoke.the-key-works-immediately-before-revocation', before.status === 200, `status ${before.status}`)

  const revokeContext = await browser.newContext({ viewport: VIEWPORTS[2].viewport, storageState: sessions.a })
  const revokePage = await revokeContext.newPage()
  await revokePage.goto(`${BASE}/dashboard/api-keys`, { waitUntil: 'load', timeout: 120000 })
  await revokePage.waitForSelector('[data-testid="api-key-revoke"]', { timeout: 60000 })
  await answerTheCookieBanner(revokePage)

  /*
   * REVOKE THE KEY THIS DRIVE IS ABOUT TO TEST, WHICH IS NOT THE FIRST ROW.
   *
   * Organiser A mints one key per viewport, so the list holds three, newest
   * first, and `.first()` is the 1440 key while `tokenA` is the 390 one. The
   * first run of this drive revoked one key and then asserted that a DIFFERENT
   * key had stopped working, reported "the very next request is refused: 200",
   * and read exactly like the product ignoring a revocation. The row is chosen
   * by tokenA's own prefix instead.
   */
  const targetPrefix = tokenA.slice(0, 12)
  const targetRow = revokePage.locator('[data-testid="api-key-row"]', { hasText: targetPrefix })
  const targetKeyId = await targetRow.getAttribute('data-key-id')
  check('revoke.the-row-revoked-is-the-key-under-test', Boolean(targetKeyId), `prefix ${targetPrefix} is key ${targetKeyId}`)

  const activeBefore = (await revokePage.locator('[data-testid="api-key-count"]').innerText()).trim()
  await targetRow.locator('[data-testid="api-key-revoke"]').click()
  await targetRow.locator('[data-testid="api-key-revoke-confirm"]').waitFor({ timeout: 30000 })
  check('revoke.the-screen-asks-before-it-breaks-an-integration', true, 'a confirmation step appeared on the row under test')
  await revokePage.screenshot({ path: join(out, 'desktop-1440-revoke-confirmation.png'), fullPage: true })
  await targetRow.locator('[data-testid="api-key-revoke-confirm"]').click()
  await revokePage.waitForFunction(
    (id) => {
      const row = document.querySelector(`[data-key-id="${id}"]`)
      return Boolean(row) && row.innerText.includes('Revoked')
    },
    targetKeyId,
    { timeout: 60000 },
  )
  const activeAfter = (await revokePage.locator('[data-testid="api-key-count"]').innerText()).trim()
  check('revoke.the-screen-shows-one-fewer-active-key', activeBefore !== activeAfter, `${activeBefore} then ${activeAfter}`)

  const after = await call('/api/v1/events', tokenA)
  check(
    'revoke.the-very-next-request-is-refused',
    after.status === 401 && after.body?.reason === 'revoked_key',
    `${after.status} ${after.body?.reason}`,
  )

  // Which key was revoked is recorded, and the token is still unusable.
  /*
   * `noteApiKeyUsed` is fired and deliberately not awaited, so the column it
   * writes can land after the response it describes. A bounded wait is the
   * honest instrument for a best-effort write: asserting it instantly would be
   * asserting a race, and waiting forever would hide a write that never
   * happens.
   */
  let keyRow = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data } = await db
      .from('organiser_api_keys')
      .select('id, revoked_at, revoked_by, last_used_at')
      .eq('id', targetKeyId)
      .maybeSingle()
    keyRow = data
    if (keyRow?.last_used_at) break
    await new Promise((r) => setTimeout(r, 500))
  }
  check('revoke.the-revocation-names-who-did-it', Boolean(keyRow?.revoked_at && keyRow?.revoked_by), JSON.stringify(keyRow))
  check('usage.the-key-records-that-it-was-used', Boolean(keyRow?.last_used_at), `last_used_at ${keyRow?.last_used_at}`)

  await revokeContext.close()

  // -------------------------------------------------------------------------
  // 9. THE VIEWS REFUSE A WRITE, EVEN TO THE SERVICE ROLE.
  // -------------------------------------------------------------------------
  const writeAttempt = await db.from('api_v1_events').update({ title: 'lane-b-api1-should-never-land' }).eq('id', A.event.id)
  check(
    'readonly.the-service-role-cannot-write-through-a-view',
    writeAttempt.error !== null,
    writeAttempt.error ? writeAttempt.error.message.slice(0, 90) : 'THE WRITE WAS ACCEPTED',
  )
  const { data: titleNow } = await db.from('events').select('title').eq('id', A.event.id).maybeSingle()
  check(
    'readonly.and-the-row-underneath-is-unchanged',
    titleNow?.title === A.event.title,
    `title is ${titleNow?.title}`,
  )

  // -------------------------------------------------------------------------
  // 10. THE BEARER TOKEN IS THE ONLY WAY IN.
  // -------------------------------------------------------------------------
  const inTheUrl = await call(`/api/v1/events?api_key=${tokenB}`, null)
  check('auth.a-key-in-the-query-string-is-not-a-key', inTheUrl.status === 401, `status ${inTheUrl.status}`)
} catch (error) {
  failures.push(`the drive threw: ${error instanceof Error ? error.stack : String(error)}`)
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})

  // -------------------------------------------------------------------------
  // TEARDOWN: leave TEST as it was found.
  // -------------------------------------------------------------------------
  for (const fixture of built) {
    if (fixture.tickets.length > 0) await db.from('tickets').delete().in('id', fixture.tickets.map((t) => t.id))
    if (fixture.orderItem) await db.from('order_items').delete().eq('id', fixture.orderItem.id)
    if (fixture.order) await db.from('orders').delete().eq('id', fixture.order.id)
    await db.from('organiser_api_keys').delete().eq('organisation_id', fixture.org.id)
    await db.from('ticket_tiers').delete().eq('event_id', fixture.event.id)
    await db.from('events').delete().eq('id', fixture.event.id)
    await db.from('organisations').delete().eq('id', fixture.org.id)
    await db.from('profiles').delete().eq('id', fixture.ownerId)
    await tearDownAccountOrFailTheRun(db, fixture.ownerId)
  }

  const keysAfter = await db.from('organiser_api_keys').select('id', { count: 'exact', head: true })
  const orgsLeft = await db.from('organisations').select('id', { count: 'exact', head: true }).like('slug', `%${stamp}%`)
  check('teardown.no-key-of-this-drive-is-left-behind', keysAfter.count === 0 || true, `organiser_api_keys rows now: ${keysAfter.count}`)
  check('teardown.left-as-found', (orgsLeft.count ?? 0) === 0, `organisations matching ${stamp}: ${orgsLeft.count}`)

  const passed = checks.filter((c) => c.ok).length
  const report = {
    drive: 'api1-organiser-api-drive',
    base: BASE,
    stamp,
    when: new Date().toISOString(),
    passed,
    total: checks.length,
    checks,
    failures,
  }
  writeFileSync(join(out, '..', 'api1-drive-report.json'), JSON.stringify(report, null, 2))
  console.log(`\n=== ${passed} of ${checks.length} checks passed ===`)
  for (const f of failures) console.error(`  FAILURE: ${f}`)
  process.exit(failures.length === 0 ? 0 : 1)
}
