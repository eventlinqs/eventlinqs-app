/**
 * AQ1, DRIVEN: CONSENT TO DISCOVER, WHERE IT IS ASKED, AND WHAT A DECLINE DOES.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by clicking what a buyer clicks, at 390, 768 and 1440.
 *
 *   1. WITH THE PLACEMENT AT CHECKOUT (the state the platform is in):
 *      the ticket page asks nothing, and the payment step asks once, UNTICKED,
 *      under the wording the database holds.
 *
 *   2. THE REVERSAL IS OPERABLE BY A PERSON, not by a deploy and not by a hand
 *      written statement. An admin fills in the form on /admin/audience and the
 *      question moves. AQ1: "a conversion fall greater than two percent moves
 *      the capture off checkout, it does not remove it."
 *
 *   3. WITH THE PLACEMENT AT THE TICKET PAGE:
 *      the ticket page asks, UNTICKED, and the payment step stops asking,
 *      because being asked twice is how one person says no once and yes once
 *      about the same thing.
 *
 *   4. THE ANSWER SURVIVES THE MOVE, VERBATIM. A buyer ticks on the ticket page
 *      and completes their registration a screen later, and the consent_events
 *      row carries the sentence that was ON SCREEN when they ticked, its
 *      version, and 'ticket-page' as the surface. This is AQ1 acceptance 2 on
 *      real rows rather than on a mock.
 *
 *   5. A DECLINE IS STORED AS A DECLINE AND EXCLUDES THEM. A second buyer
 *      leaves the box alone, and the ledger records `declined`, the resolver
 *      refuses them, and they are in no audience row, which is the table every
 *      discovery query reads.
 *
 *   6. THE MEASUREMENT IS ON SCREEN. The admin audience page reports the
 *      conversion either side of the question arriving, from public.reservations.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT LEAVES ON TEST, stated before it runs rather than discovered after.
 *
 *   TWO placement decisions, appended, both carrying `lane-B` in their reason.
 *   The log is APPEND ONLY and the database refuses DELETE, which is the point
 *   of it, so this drive moves the question and MOVES IT BACK rather than
 *   pretending it never ran. The placement in force at the end is the placement
 *   in force at the start, asserted rather than assumed.
 *
 *   Two orders for a free event, bought by `lane-b-aq1-*@eventlinqs.test`, with
 *   their consent events. An order is a money record and is never deleted.
 *   Every other row it creates (one admin, any reservation that did not
 *   convert) is deleted at teardown and the teardown reports what it removed.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/aq1-discovery-consent-drive.mjs \
 *        --out C:/dev/EVIDENCE/AQ1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const PURPOSE = 'facilitated_event_marketing'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const stamp = Date.now()
const adminEmail = `lane-b-aq1-admin-${stamp}@eventlinqs.test`
const adminPassword = `${randomUUID()}Aa1`
const grantedBuyer = `lane-b-aq1-granted-${stamp}@eventlinqs.test`
const declinedBuyer = `lane-b-aq1-declined-${stamp}@eventlinqs.test`

let adminId = null
let browser = null
const reservationsSeen = new Set()

/** Where the question is asked right now, read the way the server reads it. */
async function currentPlacement() {
  const { data } = await db
    .from('marketing_capture_placement')
    .select('id, placement, effective_from, reason')
    .lte('effective_from', new Date().toISOString())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function signInAsAdmin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1200)
  await answerTheCookieBanner(page)
  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ])
  await page.waitForTimeout(2000)
}

/**
 * Move the question through the admin control, which is the reversal condition
 * executed the way a person executes it. It waits for the SERVER to agree
 * rather than for its own write, because the placement is read per request and
 * a drive that asserts its own API call has proved nothing about the product.
 */
async function moveTheQuestion(page, placement, reason) {
  await page.goto(`${BASE}/admin/audience`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1500)
  await answerTheCookieBanner(page)
  await page.locator('#placement').selectOption(placement)
  await page.locator('#reason').fill(reason)
  await page.getByRole('button', { name: /^move the question$/i }).click()
  await page.waitForTimeout(2500)
  const deadline = Date.now() + 30000
  for (;;) {
    const row = await currentPlacement()
    if (row?.placement === placement) return row
    if (Date.now() > deadline) return row
    await page.waitForTimeout(1000)
  }
}

/**
 * Fill the whole checkout form the way a buyer fills it.
 *
 * THE ATTENDEE FIELDS ARE NOT OPTIONAL AND THE FIRST RUN OF THIS DRIVE LEARNED
 * IT THE EXPENSIVE WAY: it filled the buyer's name and address, pressed
 * Register for free, and the browser's own validation stopped the submit at an
 * empty "First name". No order, no consent event, and a report that said the
 * ledger had not been written. The product was right and the drive was wrong.
 * "Use my details for all tickets" is the control a real buyer presses, so this
 * presses it.
 */
async function fillTheCheckout(page, name, email) {
  await page.locator('#buyer-name').fill(name)
  await page.locator('#buyer-email').fill(email)
  const copyDown = page.getByRole('button', { name: /^use my details for all tickets$/i }).first()
  if ((await copyDown.count()) > 0) {
    await copyDown.click()
    await page.waitForTimeout(600)
  }
  const first = page.locator('#att-0-first')
  if ((await first.count()) > 0 && !(await first.inputValue())) {
    await first.fill(name.split(' ')[0] ?? 'Lane')
    await page.locator('#att-0-last').fill(name.split(' ').slice(1).join(' ') || 'B')
    await page.locator('#att-0-email').fill(email)
  }
}

/** Put one ticket in the cart and return the ticket page's discovery box, if any. */
async function selectOneTicket(page, slug) {
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1800)
  await answerTheCookieBanner(page)
  /*
   * THE OPENER IS ANCHORED AND MUST BE ENABLED, and both halves were learned in
   * this drive's first run. `/^(get|buy|select) tickets/i` matched the checkout
   * button itself, which at zero tickets reads "Select tickets to continue" and
   * is correctly DISABLED, so Playwright waited thirty seconds at a button the
   * product had every reason to refuse and the failure read as a broken ticket
   * panel. It was a bad selector, exactly the shape the quantity-control guard
   * exists for.
   */
  const opener = page.getByRole('button', { name: /^(get|buy) tickets$/i }).first()
  if ((await opener.count()) > 0 && (await opener.isEnabled().catch(() => false))) {
    await opener.click()
    await page.waitForTimeout(800)
  }
  // The one selector every money drive on this platform uses, anchored at both
  // ends, because a prefix pattern once opened an "Add to calendar" menu and
  // reported that the ticket panel had never rendered.
  await page.getByRole('button', { name: /^increase .+ quantity$/i }).first().click()
  await page.waitForTimeout(900)
}

async function proceedToCheckout(page) {
  const go = page.getByRole('button', { name: /^(checkout|register) /i }).first()
  await go.click()
  await page.waitForURL(u => /\/checkout\//.test(u.pathname) || /\/orders\//.test(u.pathname), {
    timeout: 90000,
  })
  await page.waitForTimeout(1500)
  const m = /\/checkout\/([0-9a-f-]{36})/.exec(page.url())
  if (m) reservationsSeen.add(m[1])
  return m ? m[1] : null
}

try {
  /* ------------------------------------------------------------------ setup */
  const { data: flag } = await db
    .from('feature_flags')
    .select('flag, enabled')
    .eq('flag', 'audience_capture')
    .maybeSingle()
  check(
    'aq1.setup.the-question-is-switched-on',
    flag?.enabled === true,
    `feature_flags.audience_capture = ${flag?.enabled}, so nothing below is the question being switched off`,
  )
  if (flag?.enabled !== true) throw new Error('this drive needs audience_capture on')

  const { data: wording } = await db
    .from('consent_wordings')
    .select('purpose, version, label, body')
    .eq('purpose', PURPOSE)
    .lte('effective_from', new Date().toISOString())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  check(
    'aq1.setup.a-wording-record-exists-to-ask-under',
    Boolean(wording?.body),
    wording ? `version ${wording.version}, ${wording.body.length} characters` : 'none, so nothing may be asked',
  )
  if (!wording?.body) throw new Error('this drive needs a wording record')

  const placementAtStart = await currentPlacement()
  check(
    'aq1.setup.the-question-starts-at-the-payment-step',
    placementAtStart?.placement === 'checkout',
    `in force: ${placementAtStart?.placement} since ${placementAtStart?.effective_from}`,
  )
  if (placementAtStart?.placement !== 'checkout') {
    throw new Error('this drive starts from the checkout placement and restores it at the end')
  }

  /*
   * A FREE EVENT ON PURPOSE, and the reason is not convenience. The consent
   * recorder runs on the SAME path for a free and a paid cart
   * (processCheckout -> recordCheckoutConsents), so a free registration
   * exercises every line this item touches without standing a card payment up
   * in front of a proof about consent. The purchase path itself is lane A's.
   */
  const { data: freeTiers } = await db
    .from('ticket_tiers')
    .select('id, event_id, name, price, is_active, is_visible, total_capacity, sold_count, reserved_count')
    .eq('price', 0)
    .eq('is_active', true)
    .eq('is_visible', true)
    .limit(500)
  const roomy = (freeTiers ?? []).filter(
    t => t.total_capacity - t.sold_count - t.reserved_count > 5,
  )
  const { data: candidates } = await db
    .from('events')
    .select('id, slug, title, start_date, status, visibility')
    .in('id', [...new Set(roomy.map(t => t.event_id))].slice(0, 100))
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(5)
  const event = candidates?.[0]
  check(
    'aq1.setup.an-event-a-real-buyer-could-reach',
    Boolean(event?.slug),
    event ? `${event.slug}, ${event.start_date.slice(0, 10)}, enumerated from the database and never guessed` : 'none found',
  )
  if (!event?.slug) throw new Error('no published future event with room')

  const created = await db.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })
  if (created.error) throw new Error(created.error.message)
  adminId = created.data.user.id
  await db.from('profiles').upsert({ id: adminId, email: adminEmail, full_name: 'Lane B AQ1' })
  const staff = await db.from('admin_users').insert({
    id: adminId,
    role: 'super_admin',
    display_name: 'Lane B AQ1',
  })
  if (staff.error) throw new Error(staff.error.message)

  browser = await chromium.launch({ headless: true })

  /* ------------------------------------------- 1. the placement at checkout */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    await selectOneTicket(page, event.slug)
    const onTicketPage = await page.locator('input[data-discovery-consent]').count()
    check(
      `aq1.checkout-placement.${vp.label}.the-ticket-page-asks-nothing`,
      onTicketPage === 0,
      `${onTicketPage} discovery box(es) on /events/${event.slug} while the placement says checkout`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-1-ticket-page-no-question.png`), fullPage: false })

    const reservationId = await proceedToCheckout(page)
    const box = page.locator('#platform-marketing-consent')
    const present = await box.count()
    check(
      `aq1.checkout-placement.${vp.label}.the-payment-step-asks-once`,
      present === 1,
      `${present} discovery box(es) on /checkout/${reservationId}`,
    )
    const checkedAtRender = present === 1 ? await box.isChecked() : null
    check(
      `aq1.checkout-placement.${vp.label}.and-it-is-unticked`,
      checkedAtRender === false,
      checkedAtRender === false
        ? 'the box a buyer lands on is empty, so a tick is an act rather than a default'
        : `isChecked() answered ${checkedAtRender}`,
    )
    const shown = await page
      .locator('[data-consent-wording-version]')
      .first()
      .getAttribute('data-consent-wording-version')
      .catch(() => null)
    check(
      `aq1.checkout-placement.${vp.label}.the-sentence-shown-is-the-record-in-force`,
      shown === wording.version,
      `on screen: ${shown}, in the database: ${wording.version}`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-2-checkout-asks-unticked.png`), fullPage: false })
    await context.close()
  }

  /* -------------------------------------- 2. the reversal, by a real person */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await signInAsAdmin(page)
    const moved = await moveTheQuestion(
      page,
      'ticket_page',
      'lane-B AQ1 drive: moving the capture to the ticket page to prove the reversal condition is operable.',
    )
    check(
      'aq1.reversal.an-admin-moves-the-question-with-a-form',
      moved?.placement === 'ticket_page',
      `the placement in force is now ${moved?.placement}, decided at ${moved?.effective_from}`,
    )
    await page.screenshot({ path: join(out, 'desktop-1440-3-reversal-taken.png'), fullPage: false })
    await context.close()
  }

  /* ---------------------------------------- 3. the placement at ticket page */
  let carriedReservation = null
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    await selectOneTicket(page, event.slug)
    const box = page.locator('input[data-discovery-consent]')
    const present = await box.count()
    check(
      `aq1.ticket-placement.${vp.label}.the-ticket-page-now-asks`,
      present === 1,
      `${present} discovery box(es) on /events/${event.slug} once the placement moved`,
    )
    const checkedAtRender = present === 1 ? await box.isChecked() : null
    check(
      `aq1.ticket-placement.${vp.label}.and-it-is-unticked-here-too`,
      checkedAtRender === false,
      `isChecked() answered ${checkedAtRender}`,
    )
    const shown = await page
      .locator('[data-consent-wording-version]')
      .first()
      .getAttribute('data-consent-wording-version')
      .catch(() => null)
    check(
      `aq1.ticket-placement.${vp.label}.the-sentence-shown-is-the-record-in-force`,
      shown === wording.version,
      `on screen: ${shown}, in the database: ${wording.version}`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-4-ticket-page-asks-unticked.png`), fullPage: false })

    if (present === 1) await box.check()
    const reservationId = await proceedToCheckout(page)
    const asksAgain = await page.locator('#platform-marketing-consent').count()
    check(
      `aq1.ticket-placement.${vp.label}.the-payment-step-stops-asking`,
      asksAgain === 0,
      `${asksAgain} discovery box(es) on /checkout/${reservationId}, after the buyer already answered`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-5-checkout-does-not-ask-again.png`), fullPage: false })

    const { data: carried } = await db
      .from('marketing_capture_answer')
      .select('reservation_id, ticked, placement, wording_version, wording')
      .eq('reservation_id', reservationId)
      .maybeSingle()
    check(
      `aq1.ticket-placement.${vp.label}.the-answer-travelled-with-the-reservation`,
      carried?.ticked === true && carried?.placement === 'ticket_page',
      carried
        ? `ticked=${carried.ticked} under wording ${carried.wording_version}, captured on ${carried.placement}`
        : 'no carried answer was written',
    )
    check(
      `aq1.ticket-placement.${vp.label}.and-it-carries-the-sentence-that-was-on-screen`,
      carried?.wording === wording.body,
      carried?.wording === wording.body
        ? 'byte for byte the body in consent_wordings, so a later version cannot rewrite what was agreed to'
        : `carried ${carried?.wording?.length ?? 0} characters against ${wording.body.length} in the record`,
    )

    if (vp.label === 'desktop-1440' && reservationId) carriedReservation = { reservationId, page, context }
    else await context.close()
  }

  /* --------------------------- 4. the grant reaches the ledger, as it stood */
  {
    const { page, context, reservationId } = carriedReservation
    await fillTheCheckout(page, 'Lane B AQ1 Granted', grantedBuyer)
    await page.getByRole('button', { name: /register for free/i }).click()
    await page.waitForURL(u => /\/orders\//.test(u.pathname), { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(out, 'desktop-1440-6-registered.png'), fullPage: false })
    check(
      'aq1.ledger.the-registration-actually-completed',
      /\/orders\//.test(page.url()),
      `the buyer ended on ${page.url()}. Asserted before the ledger is read, because a submit the ` +
        'browser refused looks exactly like a ledger that was never written, and on the first run of ' +
        'this drive that is precisely what it was reported as.',
    )

    const { data: events } = await db
      .from('consent_events')
      .select('decision, capture_surface, wording, wording_version, occurred_at')
      .eq('subject_email', grantedBuyer)
      .eq('purpose', PURPOSE)
      .order('occurred_at', { ascending: false })
      .limit(1)
    const row = events?.[0]
    check(
      'aq1.ledger.the-tick-is-recorded-as-a-grant',
      row?.decision === 'granted',
      row ? `decision ${row.decision} for ${grantedBuyer}` : 'no consent event was written',
    )
    check(
      'aq1.ledger.the-surface-recorded-is-where-the-question-was-actually-put',
      row?.capture_surface === 'ticket-page',
      `capture_surface = ${row?.capture_surface}, and the reservation was ${reservationId}`,
    )
    check(
      'aq1.ledger.the-wording-stored-is-the-wording-shown',
      row?.wording === wording.body && row?.wording_version === wording.version,
      row
        ? `${row.wording_version}, ${row.wording.length} characters, compared byte for byte against consent_wordings`
        : 'nothing to compare',
    )
    await context.close()
  }

  /* --------------------------------------- 5. the decline, and what it does */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await signInAsAdmin(page)
    await moveTheQuestion(
      page,
      'checkout',
      'lane-B AQ1 drive: restoring the capture to the payment step, which is where it was before this run.',
    )
    await context.close()

    const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page2 = await guest.newPage()
    await selectOneTicket(page2, event.slug)
    const reservationId = await proceedToCheckout(page2)
    const box = page2.locator('#platform-marketing-consent')
    check(
      'aq1.decline.the-question-is-back-at-the-payment-step',
      (await box.count()) === 1,
      `reservation ${reservationId} is asked at checkout again, so the reversal reverses`,
    )
    check(
      'aq1.decline.and-the-buyer-leaves-it-alone',
      (await box.isChecked().catch(() => null)) === false,
      'nothing is ticked, which is the answer being recorded below',
    )
    await fillTheCheckout(page2, 'Lane B AQ1 Declined', declinedBuyer)
    await page2.getByRole('button', { name: /register for free/i }).click()
    await page2.waitForURL(u => /\/orders\//.test(u.pathname), { timeout: 120000 }).catch(() => {})
    await page2.waitForTimeout(3000)
    await page2.screenshot({ path: join(out, 'desktop-1440-7-declined-registered.png'), fullPage: false })
    check(
      'aq1.decline.the-registration-actually-completed',
      /\/orders\//.test(page2.url()),
      `the buyer ended on ${page2.url()}`,
    )

    const { data: declined } = await db
      .from('consent_events')
      .select('decision, capture_surface, wording_version')
      .eq('subject_email', declinedBuyer)
      .eq('purpose', PURPOSE)
      .order('occurred_at', { ascending: false })
      .limit(1)
    check(
      'aq1.decline.an-untouched-box-is-stored-as-a-decline',
      declined?.[0]?.decision === 'declined',
      declined?.[0]
        ? `decision ${declined[0].decision} on ${declined[0].capture_surface}, so "asked and said no" is told apart from "never asked"`
        : 'nothing was recorded, so the platform cannot show the question was ever put',
    )

    /*
     * EXCLUDED FROM EVERY DISCOVERY QUERY, asked of the database's own resolver
     * rather than of the TypeScript one, because public.consent_permits is what
     * the audience trigger runs and the two are held equal by their own drive.
     */
    const { data: permits } = await db.rpc('consent_permits', {
      p_tenant_slug: 'eventlinqs',
      p_email: declinedBuyer,
      p_purpose: PURPOSE,
      p_channel: 'email',
    })
    const verdict = Array.isArray(permits) ? permits[0] : permits
    check(
      'aq1.decline.the-door-refuses-them',
      verdict?.permitted === false,
      `consent_permits answered permitted=${verdict?.permitted}: ${verdict?.reason ?? 'no reason given'}`,
    )
    const { count: inAudience } = await db
      .from('audience_members')
      .select('email', { count: 'exact', head: false })
      .eq('email', declinedBuyer)
      .limit(1)
    check(
      'aq1.decline.and-they-are-in-no-audience-row',
      (inAudience ?? 0) === 0,
      `${inAudience ?? 0} audience row(s) for ${declinedBuyer}, and audience_members is the table every discovery query reads`,
    )
    await guest.close()
  }

  /* --------------------------------------------- 6. the measurement on screen */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await signInAsAdmin(page)
    await page.goto(`${BASE}/admin/audience`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2000)
    await answerTheCookieBanner(page)

    const cells = await page.locator('[data-conversion-cell]').count()
    check(
      `aq1.measurement.${vp.label}.the-three-periods-are-reported`,
      cells === 3,
      `${cells} conversion cell(s): before the question existed, asked at checkout, asked on the ticket page`,
    )
    const verdict = await page
      .locator('[data-conversion-verdict]')
      .first()
      .getAttribute('data-conversion-verdict')
      .catch(() => null)
    check(
      `aq1.measurement.${vp.label}.it-states-a-verdict-rather-than-a-number-alone`,
      ['move', 'hold', 'not-enough-evidence'].includes(verdict),
      `the rule answered ${verdict}`,
    )
    const inForce = await page
      .locator('[data-capture-placement]')
      .first()
      .getAttribute('data-capture-placement')
      .catch(() => null)
    check(
      `aq1.measurement.${vp.label}.and-says-where-the-question-is-asked-now`,
      inForce === 'checkout',
      `the screen reads ${inForce}, which is where this drive put it back`,
    )
    /*
     * PHOTOGRAPH THE THING BEING ASSERTED. The first run's evidence showed the
     * audience page's existing tiles with the new section's heading just
     * visible at the bottom edge, which proves nothing about the measurement
     * the check above had just passed. The ledger cites these images.
     */
    await page.locator('[data-capture-placement]').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(out, `${vp.label}-8-conversion-measurement.png`), fullPage: false })
    await context.close()
  }

  /* --------------------------------------------------- 7. left as we found it */
  const placementAtEnd = await currentPlacement()
  check(
    'aq1.teardown.the-question-is-where-it-was-when-this-run-started',
    placementAtEnd?.placement === placementAtStart.placement,
    `started ${placementAtStart.placement}, ended ${placementAtEnd?.placement}, by appending a decision rather than editing one`,
  )
} catch (error) {
  check('aq1.the-drive-ran-to-the-end', false, error.message)
} finally {
  if (browser) await browser.close().catch(() => {})

  let reservationsRemoved = 0
  for (const id of reservationsSeen) {
    const { data: row } = await db.from('reservations').select('id, status').eq('id', id).maybeSingle()
    if (!row || row.status === 'converted') continue
    const { error } = await db.from('reservations').delete().eq('id', id)
    if (!error) reservationsRemoved += 1
  }
  if (adminId) {
    await db.from('admin_users').delete().eq('id', adminId)
    await db.from('profiles').delete().eq('id', adminId)
    await db.auth.admin.deleteUser(adminId)
  }
  console.log(
    `teardown.left-as-found  removed ${reservationsRemoved} unconverted reservation(s) and 1 admin; ` +
      'kept the orders, their consent events and the two appended placement decisions, because an order ' +
      'is a money record and the placement log refuses DELETE by design',
  )

  const passed = checks.filter(c => c.ok).length
  writeFileSync(
    join(out, 'aq1-drive-report.json'),
    JSON.stringify({ at: new Date().toISOString(), base: BASE, passed, total: checks.length, checks }, null, 2),
  )
  console.log(`\n=== ${passed}/${checks.length} checks passed ===`)
  process.exit(passed === checks.length ? 0 : 1)
}
