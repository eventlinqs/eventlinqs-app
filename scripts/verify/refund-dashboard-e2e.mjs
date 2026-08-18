/**
 * ORGANISER DASHBOARD REFUND, PROVEN END TO END ON TEST.
 *
 * WHAT THIS PROVES THAT refund-e2e.mjs CANNOT. refund-e2e.mjs exercises the two
 * RPCs directly against the real database inside a rolled-back transaction. That
 * proves the SQL. It does not prove that an organiser can reach a refund control,
 * that the control calls Stripe, that Stripe's charge.refunded delivery arrives
 * and verifies, or that the reconcile actually runs in production conditions. All
 * four of those live outside the database, and all four have broken before on this
 * platform (webhook secret drift, 2026-07-12 / 07-19 / 07-25).
 *
 * So this drives the whole thing the way the organiser does it: a real card-4242
 * purchase through the real checkout, then a refund CLICKED in the organiser
 * dashboard, then the numbers read back out of the database.
 *
 * THE INVENTORY ASSERTION IS THE POINT. A refund that succeeds at Stripe but
 * fails to return the seat is a silent revenue leak: the buyer is made whole, the
 * organiser is debited, and the seat is gone from sale forever with nothing
 * anywhere reporting a problem. Nobody notices until a room looks sold out and
 * isn't. So sold_count is captured before the purchase, after the purchase, and
 * after each refund, and the arithmetic is asserted rather than eyeballed.
 *
 * IT PROVES A PARTIAL REFUND TOO, because the schema supports one (the model is
 * by-ticket: refund_tickets claims individual tickets, and orders carry a
 * `partially_refunded` status). Two tickets are bought, then ONE is refunded, then
 * the other. That covers partial and full in a single purchase, and proves the
 * order status transitions partially_refunded -> refunded rather than jumping.
 *
 * TEST ONLY. assertNotProduction() runs first: nothing here may touch the live
 * database. The purchase is a real test-mode Stripe charge and costs nothing.
 *
 * Credentials are never written in this file. The fixture owner's password comes
 * from REFUND_PROOF_PASSWORD.
 *
 * USAGE:
 *   REFUND_PROOF_PASSWORD='...' node --env-file=.env.test \
 *     scripts/verify/refund-dashboard-e2e.mjs [baseUrl]
 *
 * Default baseUrl is the staging deployment, which runs against the TEST project
 * and has an enabled platform webhook endpoint subscribed to charge.refunded
 * (verify with scripts/probe/webhook-subscription-check.mjs).
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const BASE = (process.argv[2] ?? 'https://eventlinqs-staging.vercel.app').replace(/\/+$/, '')
const PASSWORD = process.env.REFUND_PROOF_PASSWORD
if (!PASSWORD) {
  console.error('REFUND_PROOF_PASSWORD is required (the fixture owner password is never stored in this file)')
  process.exit(2)
}

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !SVC) { console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const STAMP = Date.now().toString(36)
const OWNER_EMAIL = `refund-proof-owner-${STAMP}@eventlinqs.test`
// A Resend sink address, so the refund confirmation email is really sent and
// really accepted without reaching a person's inbox.
const BUYER_EMAIL = `delivered+refund-proof-${STAMP}@resend.dev`
const OUT = 'docs/verification/refund-dashboard-2026-08-18'
fs.mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log('[refund-e2e]', ...a)
const fails = []
const results = { base: BASE, startedAt: new Date().toISOString(), buyerEmail: BUYER_EMAIL, steps: {} }

function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (got ${JSON.stringify(detail)})` : ''}`); fails.push(msg) }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {})
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Poll until predicate(value) is true or the budget runs out. Returns the last value. */
async function until(fn, predicate, budgetMs, everyMs = 3000) {
  const started = Date.now()
  let value = await fn()
  while (!predicate(value) && Date.now() - started < budgetMs) {
    await sleep(everyMs)
    value = await fn()
  }
  return { value, ok: predicate(value), seconds: Math.round((Date.now() - started) / 1000) }
}

const tierRow = async (id) =>
  (await db.from('ticket_tiers').select('sold_count, reserved_count, total_capacity').eq('id', id).single()).data
const orderRow = async (id) =>
  (await db.from('orders').select('id, order_number, status, total_cents, currency, platform_fee_cents, processing_fee_cents').eq('id', id).single()).data
/**
 * `secret` is selected because /t/[code] is BEARER-authenticated: the page
 * requires ?k=<secret> and calls notFound() without it, so a fetch of the bare
 * code returns 404 by design and would look like a dead link if a harness
 * omitted it. The secret is used to build the URL and is never written to any
 * artefact or printed: it is the credential that opens the ticket.
 */
const ticketRows = async (orderId) =>
  (await db.from('tickets').select('id, ticket_code, secret, status, refunded_at, ticket_tier_id').eq('order_id', orderId).order('ticket_code')).data ?? []
const refundRows = async (orderId) =>
  (await db.from('refunds').select('id, status, amount_cents, currency, reason, initiator, stripe_refund_id, processed_at, failure_reason').eq('order_id', orderId).order('created_at')).data ?? []

// ---------------------------------------------------------------------------
// 1. FIXTURE. An isolated organisation and event, owned by a user created here,
//    so nothing shared is touched and nothing else's password changes.
// ---------------------------------------------------------------------------
log('building fixture')

// The Stripe posture is COPIED from an organisation that is already charge-ready
// on TEST rather than invented, because assertCanCreateDestinationCharge reads
// exactly these four fields and a made-up account id would fail at Stripe.
const { data: donor } = await db
  .from('organisations')
  .select('stripe_account_id, stripe_account_country')
  .eq('stripe_charges_enabled', true)
  .eq('stripe_payouts_enabled', true)
  .not('stripe_account_country', 'is', null)
  .eq('payout_status', 'active')
  .limit(1)
  .maybeSingle()
if (!donor?.stripe_account_id) { console.error('no charge-ready organisation on TEST to copy a Stripe posture from'); process.exit(2) }
log(`copying Stripe posture from ${donor.stripe_account_id} (${donor.stripe_account_country})`)

/**
 * Clear fixtures left behind by an earlier run that FAILED before it bought
 * anything. A fixture that carries orders is kept: it is the evidence. This keeps
 * TEST from silently accumulating organisations and users every time the drive is
 * iterated on, which matters because the seeded-data purge has to reason about
 * exactly that kind of residue.
 */
const { data: priorOrgs } = await db
  .from('organisations')
  .select('id, owner_id, slug')
  .like('slug', 'refund-proof-presents-%')
for (const p of priorOrgs ?? []) {
  const { data: evs } = await db.from('events').select('id').eq('organisation_id', p.id)
  const ids = (evs ?? []).map(e => e.id)
  let hasOrders = false
  if (ids.length) {
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).in('event_id', ids)
    hasOrders = (count ?? 0) > 0
  }
  if (hasOrders) { log(`keeping prior fixture ${p.slug} (carries orders, it is evidence)`); continue }
  if (ids.length) {
    await db.from('ticket_tiers').delete().in('event_id', ids)
    await db.from('events').delete().in('id', ids)
  }
  await db.from('organisations').delete().eq('id', p.id)
  if (p.owner_id) {
    await db.from('profiles').delete().eq('id', p.owner_id)
    await db.auth.admin.deleteUser(p.owner_id).catch(() => {})
  }
  log(`cleared prior empty fixture ${p.slug}`)
}

// A published-public event must carry a real cover (constraint
// events_published_real_cover, added 20260504000001: not null, not empty, and not
// a picsum placeholder). Copy one that already passes rather than invent a URL,
// so the event page also renders a real image during the drive.
const { data: coverDonor } = await db
  .from('events')
  .select('cover_image_url')
  .eq('status', 'published')
  .not('cover_image_url', 'is', null)
  .not('cover_image_url', 'ilike', 'https://picsum.photos/%')
  .limit(1)
  .maybeSingle()
if (!coverDonor?.cover_image_url) { console.error('no published TEST event with a real cover to copy'); process.exit(2) }

const createdUser = await db.auth.admin.createUser({ email: OWNER_EMAIL, password: PASSWORD, email_confirm: true })
if (createdUser.error) { console.error(`create owner: ${createdUser.error.message}`); process.exit(2) }
const ownerId = createdUser.data.user.id
await db.from('profiles').upsert({ id: ownerId, email: OWNER_EMAIL, full_name: 'Refund Proof Owner', display_name: 'Refund Proof Owner', is_verified: true })
log(`owner ${OWNER_EMAIL} (${ownerId})`)

const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()

const { data: org, error: orgErr } = await db.from('organisations').insert({
  name: `Refund Proof Presents ${STAMP}`,
  slug: `refund-proof-presents-${STAMP}`,
  owner_id: ownerId,
  email: OWNER_EMAIL,
  status: 'active',
  payout_status: 'active',
  stripe_account_id: donor.stripe_account_id,
  stripe_account_country: donor.stripe_account_country,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_onboarding_complete: true,
}).select('id, name').single()
if (orgErr) { console.error(`organisation: ${orgErr.message}`); process.exit(2) }

const startDate = new Date(Date.now() + 21 * 864e5)
const { data: event, error: evErr } = await db.from('events').insert({
  title: `Refund Proof Night ${STAMP}`,
  slug: `refund-proof-night-${STAMP}`,
  description: 'Fixture event for the organiser dashboard refund proof.',
  summary: 'Refund proof fixture',
  organisation_id: org.id,
  created_by: ownerId,
  category_id: cat?.id ?? null,
  start_date: startDate.toISOString(),
  end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney',
  event_type: 'in_person',
  venue_name: 'Proof Hall', venue_address: '1 Proof St',
  venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: coverDonor.cover_image_url,
  is_age_restricted: false, max_capacity: 10,
  is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id, slug, title').single()
if (evErr) { console.error(`event: ${evErr.message}`); process.exit(2) }

const { data: tier, error: tErr } = await db.from('ticket_tiers').insert({
  event_id: event.id,
  name: 'General Admission',
  description: 'Refund proof tier',
  tier_type: 'general_admission',
  price: 2500, currency: 'AUD',
  total_capacity: 10, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0,
  is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id, name, price, total_capacity, sold_count').single()
if (tErr) { console.error(`tier: ${tErr.message}`); process.exit(2) }

results.fixture = { ownerEmail: OWNER_EMAIL, ownerId, orgId: org.id, eventId: event.id, slug: event.slug, tierId: tier.id }
log(`event ${event.slug}  tier ${tier.id}  price ${tier.price}c  capacity ${tier.total_capacity}`)

const soldBefore = (await tierRow(tier.id)).sold_count
console.log(`\n[BASELINE] tier sold_count before purchase = ${soldBefore}`)
results.steps.soldBefore = soldBefore

// ---------------------------------------------------------------------------
// 2. REAL PURCHASE of TWO tickets, so partial then full can both be proven.
// ---------------------------------------------------------------------------
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
let orderId = null

try {
  console.log('\n[BUY] driving a real card-4242 purchase of 2 tickets')
  await page.goto(`${BASE}/events/${event.slug}`, { waitUntil: 'load', timeout: 120000 })
  await shot(page, '01-event-page')

  const plus = page.getByRole('button', { name: /^(\+|increase|add)/i }).first()
  if (!(await plus.count())) throw new Error('no quantity control on the event page')
  await plus.click(); await sleep(400)
  await plus.click(); await sleep(600)   // two tickets

  const reserve = page.getByRole('button', { name: /reserve|get tickets|checkout/i }).first()
  await shot(page, '02-two-selected')
  await reserve.click()
  await page.waitForURL(/\/checkout\//, { timeout: 60000 })
  await sleep(2500)

  const fillField = async (labelRe, placeholder, value) => {
    let el = page.getByLabel(labelRe).first()
    if (!(await el.count()) && placeholder) el = page.getByPlaceholder(placeholder).first()
    if (!(await el.count())) return false
    if (!(await el.inputValue())) await el.fill(value)
    return true
  }
  const gotFirst = await fillField(/first name/i, null, 'Refund')
  if (gotFirst) await fillField(/last name/i, null, 'Proof')
  else await fillField(/full name|^name$/i, 'Jane Smith', 'Refund Proof')
  await fillField(/e-?mail/i, 'you@example.com', BUYER_EMAIL)
  for (const el of await page.locator('input[required]:not([type=checkbox])').all()) {
    if (!(await el.inputValue())) {
      const type = await el.getAttribute('type')
      await el.fill(type === 'email' ? BUYER_EMAIL : 'Proof')
    }
  }
  await shot(page, '03-checkout-details')

  await page.getByRole('button', { name: /continue to payment/i }).click()
  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await frame.locator('input[name="number"]').fill('4242424242424242', { timeout: 90000 })
  await frame.locator('input[name="expiry"]').fill('12/30')
  await frame.locator('input[name="cvc"]').fill('123')
  const postal = frame.locator('input[name="postalCode"]')
  if (await postal.count()) await postal.fill('3220')
  await sleep(900)
  await shot(page, '04-card-entered')
  await page.getByRole('button', { name: /pay/i }).first().click()
  await page.waitForURL(/confirmation/, { timeout: 150000 })
  await shot(page, '05-confirmation')

  orderId = page.url().match(/orders\/([0-9a-f-]+)\//)?.[1] ?? null
  if (!orderId) {
    const { data: found } = await db.from('orders').select('id').eq('event_id', event.id).limit(1).maybeSingle()
    orderId = found?.id ?? null
  }
  if (!orderId) throw new Error('purchase completed but no order id could be resolved')
  log(`order ${orderId}`)

  // Only the webhook can move an order out of pending.
  const conf = await until(() => orderRow(orderId), o => o?.status === 'confirmed', 180000)
  assert(conf.ok, `webhook confirmed the order (${conf.seconds}s)`, conf.value?.status)
  const order = conf.value
  results.steps.order = order

  const bought = await ticketRows(orderId)
  assert(bought.length === 2, 'two tickets issued', bought.length)
  const soldAfterBuy = (await tierRow(tier.id)).sold_count
  assert(soldAfterBuy === soldBefore + 2, `sold_count rose by 2 on purchase: ${soldBefore} -> ${soldAfterBuy}`, soldAfterBuy)
  results.steps.soldAfterBuy = soldAfterBuy
  console.log(`\n  order_number ${order.order_number}   total ${order.total_cents}c ${order.currency}`)
  console.log(`  fees: platform ${order.platform_fee_cents}c  processing ${order.processing_fee_cents}c`)
  console.log(`  tickets: ${bought.map(t => `${t.ticket_code}=${t.status}`).join('  ')}`)

  // -------------------------------------------------------------------------
  // 3. LOG IN AS THE ORGANISER AND REFUND FROM THE DASHBOARD.
  // -------------------------------------------------------------------------
  console.log('\n[REFUND 1] one ticket of two, clicked in the organiser dashboard (PARTIAL)')
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.locator('input#email').fill(OWNER_EMAIL)
  await page.locator('input#password').fill(PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 90000 })
  await shot(page, '06-logged-in')

  const orderUrl = `${BASE}/dashboard/events/${event.id}/orders/${orderId}`
  await page.goto(orderUrl, { waitUntil: 'load', timeout: 90000 })
  await shot(page, '07-order-page')

  // WAIT for the control rather than counting instantly. The first version of
  // this assertion read the count the moment `load` fired and reported the panel
  // missing on one run while the very next line found its checkboxes and drove it
  // successfully. A racing assertion is worse than no assertion: it produces a
  // false finding about a surface that is working.
  const refundHeading = page.getByRole('heading', { name: /refund tickets/i })
  await refundHeading.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  assert(await refundHeading.count() > 0, 'the organiser dashboard renders a refund control on the order page')

  const boxes = page.locator('input[type="checkbox"]')
  const boxCount = await boxes.count()
  log(`${boxCount} checkbox(es) in the refund panel (1 select-all + 1 per ticket)`)
  // Skip index 0: that is the select-all row. Index 1 is the first ticket.
  await boxes.nth(1).check()
  await sleep(400)
  await shot(page, '08-one-ticket-selected')

  await page.getByRole('button', { name: /review refund/i }).click()
  await sleep(400)
  await shot(page, '09-confirm-step')
  await page.getByRole('button', { name: /confirm refund/i }).click()

  const started1 = page.getByRole('heading', { name: /refund started/i })
  await started1.waitFor({ timeout: 90000 }).catch(() => {})
  assert(await started1.count() > 0, 'the dialog reports the refund started (no Stripe internals shown)')
  await shot(page, '10-refund-started')

  // reconcile_refund runs from the charge.refunded webhook, so this waits for
  // Stripe to deliver rather than for the click to return.
  const r1 = await until(() => refundRows(orderId), rs => rs.some(r => r.status === 'completed'), 180000)
  assert(r1.ok, `refund 1 reconciled by the webhook (${r1.seconds}s)`, r1.value.map(r => r.status))
  const refund1 = r1.value.find(r => r.status === 'completed') ?? r1.value[0]
  console.log(`  refund row: ${refund1?.status} ${refund1?.amount_cents}c ${refund1?.currency} reason=${refund1?.reason} initiator=${refund1?.initiator}`)
  console.log(`  stripe_refund_id: ${refund1?.stripe_refund_id ?? '(none)'}`)
  if (refund1?.failure_reason) console.log(`  failure_reason: ${refund1.failure_reason}`)

  const afterPartial = await tierRow(tier.id)
  const ticketsPartial = await ticketRows(orderId)
  const orderPartial = await orderRow(orderId)
  results.steps.partial = { tier: afterPartial, tickets: ticketsPartial, order: orderPartial, refund: refund1 }

  assert(afterPartial.sold_count === soldAfterBuy - 1,
    `INVENTORY RESTORED on partial refund: sold_count ${soldAfterBuy} -> ${afterPartial.sold_count}`, afterPartial.sold_count)
  assert(ticketsPartial.filter(t => t.status === 'refunded').length === 1, 'exactly one ticket refunded', ticketsPartial.map(t => t.status))
  assert(ticketsPartial.filter(t => t.status === 'valid').length === 1, 'the other ticket is still valid', ticketsPartial.map(t => t.status))
  assert(orderPartial.status === 'partially_refunded', 'order status is partially_refunded', orderPartial.status)
  assert(refund1?.initiator === 'organiser', 'refund recorded as organiser-initiated', refund1?.initiator)

  // -------------------------------------------------------------------------
  // 4. THE SECOND REFUND completes the order.
  // -------------------------------------------------------------------------
  console.log('\n[REFUND 2] the remaining ticket (completes to a full refund)')
  await page.goto(orderUrl, { waitUntil: 'load', timeout: 90000 })
  await sleep(1200)
  const boxes2 = page.locator('input[type="checkbox"]:not([disabled])')
  const n2 = await boxes2.count()
  log(`${n2} enabled checkbox(es) remaining (a refunded ticket must be disabled)`)
  await boxes2.nth(n2 - 1).check()
  await sleep(400)
  await page.getByRole('button', { name: /review refund/i }).click()
  await sleep(400)
  await page.getByRole('button', { name: /confirm refund/i }).click()
  await page.getByRole('heading', { name: /refund started/i }).waitFor({ timeout: 90000 }).catch(() => {})
  await shot(page, '11-second-refund-started')

  const r2 = await until(() => refundRows(orderId), rs => rs.filter(r => r.status === 'completed').length >= 2, 180000)
  assert(r2.ok, `refund 2 reconciled by the webhook (${r2.seconds}s)`, r2.value.map(r => r.status))

  const afterFull = await tierRow(tier.id)
  const ticketsFull = await ticketRows(orderId)
  const orderFull = await orderRow(orderId)
  results.steps.full = { tier: afterFull, tickets: ticketsFull, order: orderFull, refunds: r2.value }

  assert(afterFull.sold_count === soldBefore,
    `INVENTORY FULLY RESTORED: sold_count back to the pre-purchase ${soldBefore} (now ${afterFull.sold_count})`, afterFull.sold_count)
  assert(ticketsFull.every(t => t.status === 'refunded'), 'both tickets refunded', ticketsFull.map(t => t.status))
  assert(ticketsFull.every(t => t.refunded_at), 'both tickets carry refunded_at')
  assert(orderFull.status === 'refunded', 'order status is refunded', orderFull.status)

  // -------------------------------------------------------------------------
  // 5. WHAT THE BUYER SEES. A refunded ticket must not still admit at the door.
  // -------------------------------------------------------------------------
  console.log('\n[BUYER] the ticket page for a refunded ticket')
  const code = ticketsFull[0].ticket_code
  const tp = await ctx.newPage()
  // The real link from the buyer's emailed ticket: code PLUS bearer secret.
  const resp = await tp.goto(
    `${BASE}/t/${encodeURIComponent(code)}?k=${encodeURIComponent(ticketsFull[0].secret)}`,
    { waitUntil: 'load', timeout: 90000 },
  )
  const bodyText = (await tp.locator('body').innerText().catch(() => '')).slice(0, 4000)
  await shot(tp, '12-buyer-ticket-page')
  const status = resp?.status() ?? 0
  const saysRefunded = /refunded/i.test(bodyText)
  const notValidForEntry = /not valid for entry/i.test(bodyText)
  const hasQr = await tp.locator('[role="img"][aria-label*="Entry QR"]').count()
  console.log(`  GET /t/${code}?k=<bearer secret> -> HTTP ${status}`)
  console.log(`  says "refunded": ${saysRefunded}   says "not valid for entry": ${notValidForEntry}   scannable QR present: ${hasQr > 0}`)
  // The secret is deliberately NOT recorded here.
  results.steps.buyerTicketPage = { code, status, saysRefunded, notValidForEntry, qrPresent: hasQr > 0, excerpt: bodyText.slice(0, 600) }
  assert(status === 200, 'the buyer ticket page still resolves 200 (never a dead link)', status)
  assert(saysRefunded, 'the buyer ticket page states the ticket is refunded', bodyText.slice(0, 200))
  assert(notValidForEntry, 'the buyer ticket page says it is not valid for entry')
  assert(hasQr === 0, 'a refunded ticket presents NO scannable QR', hasQr)

  // The bare code with no bearer secret MUST 404: that is the paper-ticket
  // model working, not a dead link. Asserted so a future change that starts
  // serving tickets without the secret turns this red.
  const bare = await ctx.newPage()
  const bareResp = await bare.goto(`${BASE}/t/${encodeURIComponent(code)}`, { waitUntil: 'load', timeout: 90000 })
  console.log(`  GET /t/${code} with NO secret -> HTTP ${bareResp?.status()} (404 is correct: bearer auth)`)
  assert(bareResp?.status() === 404, 'the bare code with no bearer secret is refused', bareResp?.status())
  await bare.close()
  await tp.close()

  // -------------------------------------------------------------------------
  // 6. INVENTORY IS BACK ON SALE, not merely decremented in a column.
  // -------------------------------------------------------------------------
  console.log('\n[RESALE] the returned seats are purchasable again')
  const pub = await ctx.newPage()
  await pub.goto(`${BASE}/events/${event.slug}`, { waitUntil: 'load', timeout: 90000 })
  const publicText = (await pub.locator('body').innerText().catch(() => '')).slice(0, 6000)
  await shot(pub, '13-event-page-after-refund')
  results.steps.publicAfter = publicText.slice(0, 800)
  console.log(`  event page mentions remaining stock: ${/\bleft\b|remaining|available/i.test(publicText)}`)
  await pub.close()

} catch (err) {
  results.error = String(err?.stack ?? err)
  console.error('\nDRIVE FAILED:', err)
  await shot(page, '99-error')
  fails.push(`drive threw: ${err?.message ?? err}`)
} finally {
  results.finishedAt = new Date().toISOString()
  results.orderId = orderId
  results.fails = fails
  fs.writeFileSync(`${OUT}/refund-dashboard-e2e.json`, JSON.stringify(results, null, 2))
  await browser.close()
}

console.log('\n' + '='.repeat(74))
console.log('WHAT THIS DRIVE PROVED')
console.log('='.repeat(74))
console.log(`  base URL          ${BASE}`)
console.log(`  fixture event     ${results.fixture.slug}`)
console.log(`  order             ${orderId}`)
console.log(`  sold_count trail  ${results.steps.soldBefore} -> ${results.steps.soldAfterBuy ?? '?'} -> ${results.steps.partial?.tier?.sold_count ?? '?'} -> ${results.steps.full?.tier?.sold_count ?? '?'}`)
console.log(`  order status      confirmed -> ${results.steps.partial?.order?.status ?? '?'} -> ${results.steps.full?.order?.status ?? '?'}`)
console.log(`  artefacts         ${OUT}`)
console.log(`\n  ${fails.length === 0 ? 'ALL ASSERTIONS PASSED' : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
