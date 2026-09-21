/**
 * LB-CODEBLINK. A DROPPED SOCKET GRANTED A DISCOUNT THE BUYER HAD ALREADY
 * SPENT, AND TOLD A BUYER HOLDING A LIVE CODE THAT THEIR CODE WAS INVALID.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEFECTS, AND THEY POINT IN OPPOSITE DIRECTIONS.
 *
 * `validateDiscountCodeWith` reads the database twice. Until 21 September 2026
 * one of those reads discarded its error and the other collapsed a failure into
 * a verdict about the code:
 *
 *   THE PER-USER CAP, which FAILS OPEN.
 *
 *       const { count } = await supabase.from('discount_code_usages')...
 *       if ((count ?? 0) >= dc.max_uses_per_user) return refused
 *
 *   supabase-js resolves a PostgREST failure as `{ data: null, error, count:
 *   null }`, so a dropped socket lands `count = null`, `?? 0` turns it into
 *   zero, and zero is below every cap an organiser can set. The buyer is handed
 *   the discount again.
 *
 *   AND max_uses_per_user IS NOT HELD ANYWHERE ELSE. `claim_discount_use`
 *   (migration 20260829000003) takes a row lock and tests `max_uses`, the
 *   GLOBAL cap, and nothing in that function reads max_uses_per_user or even
 *   receives a user id. So this line is not an advisory copy of a binding rule
 *   the way the max_uses test above it is. It IS the rule. On the ordinary
 *   configuration the form ships with, `max_uses_per_user = 1` and `max_uses`
 *   null, a blink is an unlimited code.
 *
 *   THE CODE LOOKUP, which FAILS CLOSED AND SAYS SOMETHING FALSE.
 *
 *       if (error || !dc) return { error: 'Invalid discount code' }
 *
 *   `.maybeSingle()` answers `{ data: null, error: null }` for a code that does
 *   not exist, so the two cases were already distinguishable and were being
 *   collapsed anyway. A buyer holding a code an organiser printed on a flyer is
 *   told the code is invalid, which is a statement about the organiser rather
 *   than about the network.
 *
 * ---------------------------------------------------------------------------
 * TWO HALVES, AND THE SEAM BETWEEN THEM IS STATED RATHER THAN GLOSSED.
 *
 *   THE BLINK, in THIS process, against the real TEST project, calling the real
 *   `validateDiscountCodeWith` with `globalThis.fetch` wrapped so one table's
 *   read fails exactly as PostgREST fails, and COUNTING the interceptions so a
 *   wrapper that never fired cannot read as a pass.
 *
 *   THE SURFACE, in a real browser at 390, 768 and 1440, on the real checkout
 *   page, applying a live code and then a spent one, so the two user-visible
 *   states are photographed on the screen a buyer actually looks at.
 *
 *   It is two halves because the blink has to be injected INSIDE the process
 *   that reads the database, and the dev server on port 3100 was started by an
 *   earlier session of this lane. The brief for this lane forbids restarting a
 *   process this session did not start, so the server is used as it is and the
 *   blink is driven where it can be injected honestly.
 *
 * BLAST RADIUS. Two other lanes build against this same TEST project. Every
 * seeded row carries `lane-b-codeblink` in its name, slug or address. The
 * organisation is `pending` and the event is `unlisted`, so neither reaches the
 * sitemap: an active organisation and a public event are published by
 * src/app/sitemap.ts, which holds its snapshot for 300 seconds, and a fixture
 * that was visible for even a moment fails ANOTHER lane's indexing drive after
 * this teardown has run (scripts/verify/lib/sitemap-footprint.mjs). The
 * teardown runs in a finally and VERIFIES by reading rather than trusting its
 * own deletes.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local \
 *          scripts/verify/a-blinked-cap-is-not-a-granted-discount-drive.mjs
 *
 *   env -u ...        this shell carries the PRODUCTION Supabase URL, so
 *                     without it the drive reads and writes the live database.
 *                     The refusal below is the backstop, not the plan.
 *   server-only-shim  the reader declares `import 'server-only'` and fails at
 *                     IMPORT without it, which reads as a product defect.
 *   src-alias-loader  the reader imports through `@/`, which node does not
 *                     resolve on its own.
 *
 * LB_EXPECT=red records the pre-fix behaviour without failing, so the defect
 * can be photographed by the same script that later proves it gone.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { validateDiscountCodeWith } from '@/lib/pricing/discount-validation'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EXPECT_RED = process.env.LB_EXPECT === 'red'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-CODEBLINK'
const SHOTS = join(EVIDENCE, EXPECT_RED ? 'red' : 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, EXPECT_RED ? 'red.log' : 'drive.log')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const LANE = 'lane-b-codeblink'
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)

const results = []
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' - ' + detail : ''))
}
/** A pre-fix reading: recorded, never scored, and printed so it is unmissable. */
function observed(name, detail) {
  results.push({ name, ok: true, observed: true, detail })
  log('  RED   ' + name + (detail ? ' - ' + detail : ''))
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/vkapkibzokmfaxqogypq/.test(url ?? '')) {
  throw new Error('refusing to run: this is not the TEST project, it is ' + url)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * THE BLINK. One table's reads fail the way a dropped keep-alive socket fails,
 * and the count of interceptions is returned so a wrapper that never fired is
 * visible rather than silently passing.
 */
async function withBlink(table, run) {
  const real = globalThis.fetch
  let injected = 0
  globalThis.fetch = async function blink(input, init) {
    const href = typeof input === 'string' ? input : (input?.url ?? String(input))
    if (href.includes('/rest/v1/' + table + '?')) {
      injected += 1
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    return real.call(globalThis, input, init)
  }
  try {
    const value = await run()
    return { value, injected }
  } finally {
    globalThis.fetch = real
  }
}

/** Every reservation this drive causes, so the teardown can remove its own. */
const reservationsSeen = new Set()

const fixture = {
  buyerPassword: null,
  buyerEmail: null,
  buyerId: null,
  organiserId: null,
  organisationId: null,
  eventId: null,
  eventSlug: null,
  tierId: null,
  orderId: null,
  spentCodeId: null,
  liveCodeId: null,
}

const SPENT_CODE = 'LANEB' + STAMP.slice(-6) + 'S'
const LIVE_CODE = 'LANEB' + STAMP.slice(-6) + 'L'

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db.from('event_categories').select('id').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()

  const organiser = await db.auth.admin.createUser({
    email: LANE + '-organiser-' + STAMP + '@eventlinqs.test',
    password: randomUUID() + 'Aa1',
    email_confirm: true,
  })
  if (organiser.error) throw new Error('organiser: ' + organiser.error.message)
  fixture.organiserId = organiser.data.user.id
  await db.from('profiles').upsert({
    id: fixture.organiserId,
    email: LANE + '-organiser-' + STAMP + '@eventlinqs.test',
    full_name: 'Lane B codeblink organiser',
    role: 'organiser',
  })

  fixture.buyerEmail = LANE + '-buyer-' + STAMP + '@eventlinqs.test'
  fixture.buyerPassword = randomUUID() + 'Aa1'
  const buyer = await db.auth.admin.createUser({
    email: fixture.buyerEmail,
    password: fixture.buyerPassword,
    email_confirm: true,
  })
  if (buyer.error) throw new Error('buyer: ' + buyer.error.message)
  fixture.buyerId = buyer.data.user.id
  await db.from('profiles').upsert({
    id: fixture.buyerId,
    email: LANE + '-buyer-' + STAMP + '@eventlinqs.test',
    full_name: 'Lane B codeblink buyer',
    role: 'attendee',
  })

  /*
   * THE SALE GATE, SATISFIED WITHOUT PUBLISHING ANYTHING. A paid event is only
   * offered when isOrganiserSellable passes, and that reads five columns
   * (ORG_SALE_FIELDS_SELECT in src/lib/payments/sale-status.ts). The connected
   * account id is BORROWED from an organisation that already has one on TEST
   * rather than invented, so the value is the shape Stripe actually issues. No
   * money moves in this drive: it stops at the discount input.
   */
  const { data: donor } = await db
    .from('organisations')
    .select('stripe_account_id, stripe_account_country')
    .not('stripe_account_id', 'is', null)
    .eq('stripe_charges_enabled', true)
    .limit(1)
    .single()
  if (!donor?.stripe_account_id) throw new Error('no TEST organisation with a connected account to borrow an id from')

  const org = await db
    .from('organisations')
    .insert({
      name: 'Lane B codeblink ' + STAMP,
      slug: LANE + '-org-' + STAMP,
      owner_id: fixture.organiserId,
      status: 'pending',
      payout_status: 'active',
      stripe_account_id: donor.stripe_account_id,
      stripe_account_country: donor.stripe_account_country ?? 'AU',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_complete: true,
    })
    .select('id')
    .single()
  if (org.error) throw new Error('organisation: ' + org.error.message)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 21 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: 'Lane B codeblink night ' + STAMP,
      slug: LANE + '-event-' + STAMP,
      organisation_id: fixture.organisationId,
      created_by: fixture.organiserId,
      category_id: category.id,
      status: 'published',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: 'Lane B codeblink warehouse',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the LB-CODEBLINK drive. It is deleted when the drive ends.',
    })
    .select('id, slug')
    .single()
  if (event.error) throw new Error('event: ' + event.error.message)
  fixture.eventId = event.data.id
  fixture.eventSlug = event.data.slug

  const tier = await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'General', price: 5000, currency: 'AUD', total_capacity: 200, is_active: true })
    .select('id')
    .single()
  if (tier.error) throw new Error('tier: ' + tier.error.message)
  fixture.tierId = tier.data.id

  /*
   * THE ORDINARY CONFIGURATION, AND IT IS THE DANGEROUS ONE. max_uses is NULL,
   * which is what an organiser leaves it as when they do not cap the total, and
   * max_uses_per_user is 1, which is what the create form DEFAULTS to
   * (discounts-client.tsx:28). "One per person, as many people as turn up" is
   * the commonest promotion there is, and it is the shape with no global cap
   * underneath it to catch a per-user check that fails open.
   */
  const CODES = [[SPENT_CODE, 'spentCodeId'], [LIVE_CODE, 'liveCodeId']]
  for (const [code, key] of CODES) {
    const dc = await db
      .from('discount_codes')
      .insert({
        event_id: fixture.eventId,
        organisation_id: fixture.organisationId,
        code,
        discount_type: 'percentage',
        discount_percentage: 20,
        max_uses: null,
        max_uses_per_user: 1,
        is_active: true,
      })
      .select('id')
      .single()
    if (dc.error) throw new Error('discount code ' + code + ': ' + dc.error.message)
    fixture[key] = dc.data.id
  }

  const orderId = randomUUID()
  const order = await db.from('orders').insert({
    id: orderId,
    order_number: 'EL-CB' + STAMP.slice(-6),
    event_id: fixture.eventId,
    organisation_id: fixture.organisationId,
    user_id: fixture.buyerId,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    subtotal_cents: 5000,
    discount_cents: 1000,
    total_cents: 4000,
    currency: 'AUD',
  })
  if (order.error) throw new Error('order: ' + order.error.message)
  fixture.orderId = orderId

  /* The spend itself: this buyer has used SPENT_CODE once, and the cap is one. */
  const usage = await db.from('discount_code_usages').insert({
    discount_code_id: fixture.spentCodeId,
    order_id: orderId,
    user_id: fixture.buyerId,
    discount_applied_cents: 1000,
  })
  if (usage.error) throw new Error('usage: ' + usage.error.message)
}

async function teardown() {
  const removed = []
  const gone = []
  for (const id of reservationsSeen) {
    await db.from('discount_code_claims').delete().eq('reservation_id', id)
    await db.from('reservations').delete().eq('id', id)
    const { count } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('id', id)
    removed.push('reservation')
    if ((count ?? 0) === 0) gone.push('reservation')
  }
  if (fixture.orderId) {
    await db.from('discount_code_usages').delete().eq('order_id', fixture.orderId)
    await db.from('orders').delete().eq('id', fixture.orderId)
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('id', fixture.orderId)
    removed.push('order')
    if ((count ?? 0) === 0) gone.push('order')
  }
  if (fixture.eventId) {
    await db.from('discount_codes').delete().eq('event_id', fixture.eventId)
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
    const { count } = await db.from('events').select('id', { count: 'exact', head: true }).eq('id', fixture.eventId)
    removed.push('event')
    if ((count ?? 0) === 0) gone.push('event')
  }
  if (fixture.organisationId) {
    await db.from('organisations').delete().eq('id', fixture.organisationId)
    const { count } = await db.from('organisations').select('id', { count: 'exact', head: true }).eq('id', fixture.organisationId)
    removed.push('organisation')
    if ((count ?? 0) === 0) gone.push('organisation')
  }
  /*
   * THE ONE DOOR, because it is the only one that can tell an account that was
   * already gone from a deletion that was REFUSED. This drive's first version
   * counted its own delete call as a success and would have reported a clean
   * teardown over a user it had left behind.
   */
  for (const id of [fixture.buyerId, fixture.organiserId]) {
    if (!id) continue
    await db.from('profiles').delete().eq('id', id)
    const result = await tearDownAccountOrFailTheRun(db, id)
    removed.push('user')
    if (result.gone) gone.push('user')
  }
  log('teardown: ' + removed.length + ' row group(s) deleted, ' + gone.length + ' verified gone by reading back')
}

const INPUT = () => ({
  event_id: fixture.eventId,
  user_id: fixture.buyerId,
  order_subtotal_cents: 5000,
  tier_ids: [fixture.tierId],
})

async function driveTheBlink() {
  log('')
  log('HALF ONE: the blink, in this process, against the real TEST project.')

  /* The healthy baseline. Without it, a refusal under a blink proves nothing. */
  const liveHealthy = await validateDiscountCodeWith(db, { ...INPUT(), code: LIVE_CODE })
  check(
    'healthy: a live code the buyer has never used is granted',
    liveHealthy.valid === true && liveHealthy.discount_cents === 1000,
    'valid=' + liveHealthy.valid + ' discount=' + liveHealthy.discount_cents + 'c',
  )

  const spentHealthy = await validateDiscountCodeWith(db, { ...INPUT(), code: SPENT_CODE })
  check(
    'healthy: a code this buyer has already spent is refused',
    spentHealthy.valid === false && /already used this code/i.test(spentHealthy.error ?? ''),
    'valid=' + spentHealthy.valid + ' error=' + JSON.stringify(spentHealthy.error),
  )

  /* DEFECT ONE: the per-user cap, blinked. */
  const capBlink = await withBlink('discount_code_usages', () =>
    validateDiscountCodeWith(db, { ...INPUT(), code: SPENT_CODE }),
  )
  log('    the cap read was intercepted ' + capBlink.injected + ' time(s)')
  check(
    'the blink actually fired on the cap read',
    capBlink.injected > 0,
    capBlink.injected + ' intercepted request(s)',
  )
  if (EXPECT_RED) {
    observed(
      'RED: a blinked cap read granted a discount the buyer had already spent',
      'valid=' + capBlink.value.valid + ' discount=' + capBlink.value.discount_cents +
        'c error=' + JSON.stringify(capBlink.value.error),
    )
  } else {
    check(
      'a blinked cap read refuses rather than granting the discount again',
      capBlink.value.valid === false,
      'valid=' + capBlink.value.valid + ' error=' + JSON.stringify(capBlink.value.error),
    )
    check(
      'and it says it could not check, rather than accusing the buyer or the code',
      /could not check/i.test(capBlink.value.error ?? ''),
      JSON.stringify(capBlink.value.error),
    )
  }

  /* DEFECT TWO: the code lookup, blinked. */
  const lookupBlink = await withBlink('discount_codes', () =>
    validateDiscountCodeWith(db, { ...INPUT(), code: LIVE_CODE }),
  )
  log('    the code lookup was intercepted ' + lookupBlink.injected + ' time(s)')
  check(
    'the blink actually fired on the code lookup',
    lookupBlink.injected > 0,
    lookupBlink.injected + ' intercepted request(s)',
  )
  if (EXPECT_RED) {
    observed(
      'RED: a blinked lookup told a buyer holding a live code that it was invalid',
      'valid=' + lookupBlink.value.valid + ' error=' + JSON.stringify(lookupBlink.value.error),
    )
  } else {
    check(
      'a blinked lookup does not call a live code invalid',
      !/invalid discount code/i.test(lookupBlink.value.error ?? ''),
      JSON.stringify(lookupBlink.value.error),
    )
    check(
      'a blinked lookup says it could not check, and does not grant',
      lookupBlink.value.valid === false && /could not check/i.test(lookupBlink.value.error ?? ''),
      'valid=' + lookupBlink.value.valid + ' error=' + JSON.stringify(lookupBlink.value.error),
    )
  }

  /*
   * THE DIRECTION A CARELESS FIX BREAKS. A code that genuinely does not exist
   * must still be called invalid. Turning every empty answer into "could not
   * check" would tell a buyer with a typo to keep trying forever.
   */
  const absent = await validateDiscountCodeWith(db, { ...INPUT(), code: 'LANEBNOSUCHCODE' })
  check(
    'a code that does not exist is still called invalid, with no blink involved',
    absent.valid === false && /invalid discount code/i.test(absent.error ?? ''),
    JSON.stringify(absent.error),
  )
}

async function driveTheSurface() {
  log('')
  log('HALF TWO: the checkout screen, in a real browser, signed in as the buyer,')
  log('          at 390, 768 and 1440, against the two codes seeded above.')

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      try {
        await signIn(page)

        const reservationId = await reachCheckout(page)
        check(
          vp.name + ': the signed-in buyer reached the checkout for this drive own event',
          Boolean(reservationId),
          reservationId ? 'reservation ' + reservationId : 'url ' + page.url(),
        )
        if (!reservationId) {
          await page.screenshot({ path: join(SHOTS, 'checkout-unreached-' + vp.name + '.png'), fullPage: false })
          await context.close()
          continue
        }

        /*
         * THE SPENT CODE FIRST, because it is the state the blink destroyed.
         * This buyer holds one confirmed usage row and the cap is one, so the
         * only correct answer is a refusal naming the buyer past use.
         */
        const spentMessage = await applyCode(page, SPENT_CODE)
        check(
          vp.name + ': a code this buyer has already spent is refused on screen',
          /already used this code/i.test(spentMessage ?? ''),
          JSON.stringify(spentMessage),
        )
        check(
          vp.name + ': and the refusal is not the could-not-check sentence, which would be wrong here',
          !/could not check/i.test(spentMessage ?? ''),
          JSON.stringify(spentMessage),
        )
        await page.screenshot({ path: join(SHOTS, 'spent-refused-' + vp.name + '.png'), fullPage: false })

        /*
         * THE LIVE CODE, so the refusal above is not simply a screen that
         * refuses everything.
         *
         * THREE INDEPENDENT READINGS, AND THE REASON IS A FAILURE OF THIS VERY
         * LINE. The first version asked for `new RegExp('Code\s+' + CODE +
         * '\s+applied')`, written inside a single-quoted JavaScript string,
         * where `\s` is not an escape at all and collapses to the letter `s`.
         * The pattern the product was measured against was `Codes+...s+applied`,
         * which matches nothing, so a screen that was working perfectly
         * reported 0 applied panels at all three viewports and read as a
         * product defect. The screenshot showed the panel plainly.
         *
         * So the panel is now read three ways that cannot all be broken by one
         * bad pattern: the code appears, the word "applied" appears with it, and
         * the DISCOUNT AMOUNT is on the screen. The amount is the one that
         * matters, because "applied" with no money off is the failure worth
         * catching.
         */
        const applied = await applyCode(page, LIVE_CODE)
        const panel = page.locator('p', { hasText: new RegExp(String.raw`Code\s+` + LIVE_CODE + String.raw`\s+applied`, 'i') })
        const panelCount = await panel.count()
        const codeShown = await page.getByText(LIVE_CODE, { exact: false }).count()
        const amountShown = await page.getByText(/10\.00 discount/i).count()
        check(
          vp.name + ': a live code this buyer has never used is applied on screen',
          panelCount > 0 && codeShown > 0,
          panelCount + ' applied panel(s), ' + codeShown + ' mention(s) of the code, last message ' + JSON.stringify(applied),
        )
        check(
          vp.name + ': and the screen shows the money it took off, not only the word applied',
          amountShown > 0,
          amountShown + ' element(s) naming the discount amount',
        )
        await page.screenshot({ path: join(SHOTS, 'live-applied-' + vp.name + '.png'), fullPage: false })
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

/** Signs the seeded buyer in at the real /login. */
async function signIn(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await answerTheCookieBanner(page, { answer: 'decline' })
  await page.getByLabel(/email/i).first().fill(fixture.buyerEmail)
  await page.getByLabel(/password/i).first().fill(fixture.buyerPassword)
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
}

/**
 * Selects one ticket on this drive's own event and follows the buyer's own
 * button to the checkout. The quantity selector is anchored at both ends: a
 * prefix pattern matches the disabled checkout button, which then waits at a
 * control the product is correctly refusing and reads as a broken panel.
 */
async function reachCheckout(page) {
  await page.goto(BASE + '/events/' + fixture.eventSlug, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1800)
  await answerTheCookieBanner(page, { answer: 'decline' })

  const opener = page.getByRole('button', { name: /^(get|buy) tickets$/i }).first()
  if ((await opener.count()) > 0 && (await opener.isEnabled().catch(() => false))) {
    await opener.click()
    await page.waitForTimeout(800)
  }
  await page.getByRole('button', { name: /^increase .+ quantity$/i }).first().click()
  await page.waitForTimeout(900)

  await page.getByRole('button', { name: /^(checkout|register) /i }).first().click()
  await page.waitForURL(u => /\/checkout\//.test(u.pathname) || /\/orders\//.test(u.pathname), { timeout: 120000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
  const m = /\/checkout\/([0-9a-f-]{36})/.exec(page.url())
  if (m) reservationsSeen.add(m[1])
  return m ? m[1] : null
}

/**
 * Types a code into the real discount input and presses Apply, then returns the
 * message the screen shows. Waits for the button to leave its pending label so
 * the read is of the answer rather than of the previous state.
 */
async function applyCode(page, code) {
  const field = page.locator('#discount-code')
  await field.scrollIntoViewIfNeeded()
  await field.fill(code)
  await page.getByRole('button', { name: /^apply$/i }).first().click()
  await page.waitForTimeout(2500)
  const message = await page.locator('.text-error').first().textContent().catch(() => null)
  return message
}

async function main() {
  writeFileSync(LOG, '')
  log('LB-CODEBLINK drive, ' + new Date().toISOString() + ', base ' + BASE + ', expect ' + (EXPECT_RED ? 'RED' : 'GREEN'))
  log('TEST project ' + url)

  try {
    await buildFixture()
    log('fixture: event ' + fixture.eventSlug + ', codes ' + LIVE_CODE + ' (unused) and ' + SPENT_CODE + ' (spent once)')
    await driveTheBlink()
    await driveTheSurface()
  } finally {
    await teardown()
  }

  const scored = results.filter(r => !r.observed)
  const failed = scored.filter(r => !r.ok)
  log('')
  log((scored.length - failed.length) + ' of ' + scored.length + ' scored check(s) passed' +
      (results.length - scored.length ? ', plus ' + (results.length - scored.length) + ' recorded RED reading(s)' : ''))
  writeFileSync(join(EVIDENCE, EXPECT_RED ? 'red-report.json' : 'drive-report.json'), JSON.stringify({
    when: new Date().toISOString(),
    base: BASE,
    expect: EXPECT_RED ? 'red' : 'green',
    passed: scored.length - failed.length,
    total: scored.length,
    results,
  }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch(err => {
  log('DRIVE ERROR: ' + (err?.stack ?? err))
  process.exit(1)
})
