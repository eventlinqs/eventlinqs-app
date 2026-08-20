/**
 * MONEY TAKEN, NO TICKET: the operator surface, driven end to end on TEST.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PROVES, AND WHY IT HAD TO BE DRIVEN RATHER THAN REASONED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Migration 20260819000003 made an oversell impossible by REFUSING to confirm a
 * payment that landed after its hold lapsed onto a tier that had since sold out.
 * That refusal is correct and it is deliberate, and it leaves a buyer charged
 * with nothing to show for it. /admin/orders/unfulfilled is the resolution.
 *
 * Three things about that surface can only be established by running it:
 *
 *   1. THE STATE IS REACHABLE. The refusal has to actually produce a charged,
 *      ticketless, still-pending order over the real webhook route, not in a
 *      description of one.
 *   2. THE SURFACE FINDS IT, AND FINDS ONLY IT. `orders.status = 'pending' AND a
 *      payment intent exists` is the signature of a charged buyer AND of somebody
 *      who opened checkout and closed the tab, and the second is far more common.
 *      Only Stripe can separate them. So this drill puts an ABANDONED CHECKOUT in
 *      the same table at the same moment and requires the surface to list one and
 *      not the other. Without that control, a page that listed every pending order
 *      would pass just as loudly, and an operator would be offered a Refund button
 *      beside a buyer who was never charged.
 *   3. THE ONE CLICK ACTUALLY MOVES MONEY. Verified at Stripe, not in our table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REAL AND WHAT IS SYNTHESISED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * REAL: the organisation, event and tier rows; `create_reservation`; the real
 * expiry sweeper reached through its real cron route over HTTP; the PaymentIntents
 * (test mode, confirmed with pm_card_visa, so a charge genuinely exists);
 * `confirm_order` and its refusal; the webhook route including signature
 * verification; the admin login flow; the admin page; the server action; the
 * Stripe refund.
 *
 * SYNTHESISED, and only these two, both of which are clock movement:
 *   - `reservations.expires_at` is pushed into the past so the sweeper has
 *     something to sweep without waiting out a 30 minute hold.
 *   - `orders.created_at` is pushed back past the surface's 15 minute grace.
 * Neither changes a decision under test; they only stop the drill waiting.
 *
 * The admin signs in through the REAL /admin/login flow. The fixture admin is
 * created without a TOTP secret, which is the product's own documented first-login
 * bootstrap (src/app/admin/actions.ts: an un-enrolled admin is signed in and sent
 * to enrolment, and issueTwoFactorProof still runs). No gate is bypassed, no code
 * is modified, and the 2FA proof cookie is minted by the real action.
 *
 * TEST ONLY, guarded. Every object is test mode and no real money moves.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/unfulfilled-order-drill.mjs \
 *     --url http://localhost:3100 [--secret <whsec>] [--keep]
 *
 * The server at --url must be running with ADMIN_TOTP_ENC_KEY set (the admin
 * login mints an encrypted 2FA proof cookie and cannot run without it).
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { chromium } from 'playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const BASE = arg('--url', 'http://localhost:3100').replace(/\/+$/, '')
const SECRET = arg('--secret') ?? process.env.STRIPE_WEBHOOK_SECRET
const KEEP = argv.includes('--keep')
const SHOTS = path.resolve('docs/verification/unfulfilled-orders-2026-08-19')

if (!SECRET) { console.error('a webhook signing secret is required'); process.exit(2) }
const SK = process.env.STRIPE_SECRET_KEY
if (!SK?.startsWith('sk_test_')) { console.error('REFUSING: requires a TEST-mode Stripe key'); process.exit(2) }
const CRON = process.env.CRON_SECRET
if (!CRON) { console.error('CRON_SECRET is required: the real expiry sweeper is reached through its cron route'); process.exit(2) }

const stripe = new Stripe(SK, { apiVersion: STRIPE_API_VERSION })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const STAMP = Date.now().toString(36)
const fails = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

mkdirSync(SHOTS, { recursive: true })

// ─────────────────────────────────────────────────────────────────── fixture
hr('FIXTURE  an isolated organisation, a published paid event, ONE seat')

const { data: coverDonor } = await db.from('events').select('cover_image_url')
  .eq('status', 'published').not('cover_image_url', 'is', null)
  .not('cover_image_url', 'ilike', 'https://picsum.photos/%').limit(1).maybeSingle()
const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()
const { data: prof } = await db.from('profiles').select('id').limit(1).maybeSingle()

const { data: org, error: orgErr } = await db.from('organisations').insert({
  name: `Unfulfilled Drill ${STAMP}`, slug: `unfulfilled-drill-${STAMP}`, owner_id: prof.id,
  email: `unfulfilled-${STAMP}@eventlinqs.test`, status: 'active', payout_status: 'active',
  stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU',
}).select('id').single()
if (orgErr) throw new Error(`organisation: ${orgErr.message}`)

const startDate = new Date(Date.now() + 21 * 864e5)
const { data: event, error: evErr } = await db.from('events').insert({
  title: `Unfulfilled Drill ${STAMP}`, slug: `unfulfilled-drill-${STAMP}`,
  description: 'Money-taken-no-ticket drill.', summary: 'Unfulfilled drill',
  organisation_id: org.id, created_by: prof.id, category_id: cat?.id ?? null,
  start_date: startDate.toISOString(), end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney', event_type: 'in_person',
  venue_name: 'Hall', venue_address: '1 St', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: coverDonor?.cover_image_url ?? null,
  is_age_restricted: false, max_capacity: 1, is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id').single()
if (evErr) throw new Error(`event: ${evErr.message}`)

// ONE seat, so a second buyer taking it genuinely sells the tier out.
const { data: tier, error: tErr } = await db.from('ticket_tiers').insert({
  event_id: event.id, name: 'General Admission', tier_type: 'general_admission',
  price: 2500, currency: 'AUD', total_capacity: 1, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id').single()
if (tErr) throw new Error(`tier: ${tErr.message}`)
console.log(`  org ${org.id}  event ${event.id}  tier ${tier.id}  capacity 1`)
scanned.push('an isolated organisation, published paid event and a ONE seat GA tier')

const tierState = async () =>
  (await db.from('ticket_tiers').select('total_capacity, sold_count, reserved_count').eq('id', tier.id).single()).data
const orderState = async id => (await db.from('orders').select('status').eq('id', id).single()).data
const ticketCount = async id =>
  (await db.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', id)).count ?? 0

/**
 * A pending order with a live hold, order_items and a payments row carrying a
 * REAL Stripe intent id, exactly as checkout leaves things before the buyer pays.
 *
 * `pay: false` creates the intent WITHOUT confirming it, which is the abandoned
 * checkout: our table cannot tell it from a charged buyer, and that is the whole
 * point of the control below.
 */
async function buildPendingOrder({ qty = 1, pay = true, label = 'buyer' }) {
  const { data: resv } = await db.rpc('create_reservation', {
    p_event_id: event.id, p_user_id: null,
    p_session_id: `unf-${STAMP}-${Math.random().toString(36).slice(2, 8)}`,
    p_items: [{ ticket_tier_id: tier.id, quantity: qty }], p_ttl_minutes: 30,
  })
  if (!resv?.success) throw new Error(`create_reservation failed for ${label}: ${JSON.stringify(resv)}`)
  const { data: resvRow } = await db.from('reservations').select('id').eq('event_id', event.id)
    .eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()

  const { data: order, error: oErr } = await db.from('orders').insert({
    event_id: event.id, organisation_id: org.id, reservation_id: resvRow.id,
    status: 'pending', currency: 'AUD',
    subtotal_cents: 2500 * qty, total_cents: 2749 * qty,
    platform_fee_cents: 187 * qty, processing_fee_cents: 62 * qty,
    discount_cents: 0, addon_total_cents: 0,
    guest_email: `unf-${STAMP}-${label}@resend.dev`,
    order_number: `EL-UNF${STAMP.toUpperCase().slice(0, 4)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
  }).select('id, order_number, guest_email').single()
  if (oErr) throw new Error(`order insert for ${label}: ${oErr.message}`)

  const { error: iErr } = await db.from('order_items').insert(
    Array.from({ length: qty }, () => ({
      order_id: order.id, ticket_tier_id: tier.id, addon_id: null,
      item_type: 'ticket', item_name: 'General Admission',
      quantity: 1, unit_price_cents: 2500, total_cents: 2500,
      attendee_first_name: 'Unfulfilled', attendee_last_name: 'Drill',
      attendee_email: `unf-${STAMP}-${label}@resend.dev`,
    })),
  )
  if (iErr) throw new Error(`order_items insert for ${label}: ${iErr.message}`)

  // NO order_id in the intent metadata: Stripe also delivers to staging, which
  // shares this TEST database, and handlePaymentSucceeded early-returns on a
  // missing order_id, so staging's copy is a clean no-op that is never retried.
  const intent = await stripe.paymentIntents.create({
    amount: 2749 * qty, currency: 'aud',
    ...(pay ? { payment_method: 'pm_card_visa', confirm: true } : {}),
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { drill: `unfulfilled-${STAMP}`, who: label },
  })

  const { error: pErr } = await db.from('payments').insert({
    order_id: order.id, gateway: 'stripe', status: 'processing',
    amount_cents: 2749 * qty, currency: 'AUD',
    gateway_payment_id: intent.id,
    idempotency_key: `unf-${order.id}`,
  })
  if (pErr) throw new Error(`payments insert for ${label}: ${pErr.message}`)

  return { order, resvId: resvRow.id, intent }
}

/** Deliver a signed event to the real webhook route. */
async function deliver(type, object, eventId) {
  const body = {
    id: eventId, object: 'event', api_version: STRIPE_API_VERSION,
    created: Math.floor(Date.now() / 1000), type, livemode: false,
    pending_webhooks: 1, request: { id: null, idempotency_key: null },
    data: { object },
  }
  const payload = JSON.stringify(body)
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  })
  return { status: res.status, text: (await res.text()).slice(0, 200) }
}

const cleanupOrders = []
let adminUserId = null
let browser = null

try {
  // ═══════════════════════════════════════════════════════════ STEP 1
  hr('STEP 1  buyer B pays for the last seat, and the hold lapses while they pay')
  const B = await buildPendingOrder({ label: 'b-charged' })
  cleanupOrders.push(B.order.id)
  console.log(`  B: order ${B.order.order_number}, intent ${B.intent.id} (${B.intent.status})`)
  assert(B.intent.status === 'succeeded', 'B was genuinely charged at Stripe', B.intent.status)
  console.log(`  tier after B's hold: ${JSON.stringify(await tierState())}`)

  // CLOCK ONLY. Push the hold into the past so the REAL sweeper has work to do.
  await db.from('reservations')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', B.resvId)

  const sweep = await fetch(`${BASE}/api/cron/reservation-expire`, {
    headers: { authorization: `Bearer ${CRON}` },
  })
  const sweepBody = await sweep.json().catch(() => ({}))
  console.log(`  real expiry sweeper -> HTTP ${sweep.status} ${JSON.stringify(sweepBody)}`)
  assert(sweep.status === 200, 'the real reservation-expire cron ran', sweep.status)
  const afterSweep = await tierState()
  console.log(`  tier after the sweep: ${JSON.stringify(afterSweep)}`)
  assert(afterSweep.reserved_count === 0, "B's lapsed hold was returned to inventory", afterSweep.reserved_count)
  scanned.push("the REAL expire_stale_reservations sweeper, reached over HTTP through its own cron route")

  // ═══════════════════════════════════════════════════════════ STEP 2
  hr('STEP 2  buyer A takes the seat B is still paying for, and the tier sells out')
  const A = await buildPendingOrder({ label: 'a-winner' })
  cleanupOrders.push(A.order.id)
  const dA = await deliver('payment_intent.succeeded',
    { ...A.intent, metadata: { ...A.intent.metadata, order_id: A.order.id } },
    `evt_local_unf_a_${STAMP}`)
  console.log(`  A's payment_intent.succeeded -> HTTP ${dA.status} ${dA.text}`)
  await sleep(5000)
  const tierSoldOut = await tierState()
  console.log(`  tier: ${JSON.stringify(tierSoldOut)}   A tickets=${await ticketCount(A.order.id)}`)
  assert((await orderState(A.order.id)).status === 'confirmed', 'A is confirmed')
  assert(tierSoldOut.sold_count === 1 && tierSoldOut.total_capacity === 1, 'the tier is now sold out', JSON.stringify(tierSoldOut))

  // ═══════════════════════════════════════════════════════════ STEP 3
  hr("STEP 3  B's payment finally lands. The platform must REFUSE, not oversell")
  const dB = await deliver('payment_intent.succeeded',
    { ...B.intent, metadata: { ...B.intent.metadata, order_id: B.order.id } },
    `evt_local_unf_b_${STAMP}`)
  console.log(`  B's payment_intent.succeeded -> HTTP ${dB.status} ${dB.text}`)
  await sleep(4000)
  const bAfter = { order: await orderState(B.order.id), tickets: await ticketCount(B.order.id), tier: await tierState() }
  console.log(`  B: order=${bAfter.order.status} tickets=${bAfter.tickets}   tier=${JSON.stringify(bAfter.tier)}`)
  assert(dB.status >= 500, 'the route refused and returned non-2xx so Stripe will retry', dB.status)
  assert(bAfter.tickets === 0, 'B holds NO ticket', bAfter.tickets)
  assert(bAfter.order.status === 'pending', "B's order is still pending", bAfter.order.status)
  assert(bAfter.tier.sold_count === 1, 'the tier did NOT oversell', bAfter.tier.sold_count)
  const bCharge = await stripe.paymentIntents.retrieve(B.intent.id, { expand: ['latest_charge'] })
  console.log(`  Stripe: intent ${bCharge.status}, captured ${bCharge.latest_charge.amount_captured}c, refunded ${bCharge.latest_charge.amount_refunded}c`)
  assert(bCharge.status === 'succeeded' && bCharge.latest_charge.amount_refunded === 0,
    'B IS OUT OF POCKET: charged, unrefunded, and holds nothing. This is the state the surface exists for')
  scanned.push('the real refusal: a lapsed hold onto a sold-out tier, charged buyer, zero tickets, no oversell')

  // ═══════════════════════════════════════════════════════════ STEP 4
  hr('STEP 4  the CONTROL: an abandoned checkout, indistinguishable in our own table')
  // Capacity is gone, so this one cannot hold a seat. It does not need to: it is
  // an order with a payments row and an intent id that was never paid, which is
  // exactly the row shape a charged buyer leaves behind.
  const { data: abandonedOrder, error: abErr } = await db.from('orders').insert({
    event_id: event.id, organisation_id: org.id, reservation_id: null,
    status: 'pending', currency: 'AUD',
    subtotal_cents: 2500, total_cents: 2749,
    platform_fee_cents: 187, processing_fee_cents: 62, discount_cents: 0, addon_total_cents: 0,
    guest_email: `unf-${STAMP}-abandoned@resend.dev`,
    order_number: `EL-UNF${STAMP.toUpperCase().slice(0, 4)}ABD`,
  }).select('id, order_number').single()
  if (abErr) throw new Error(`abandoned order: ${abErr.message}`)
  cleanupOrders.push(abandonedOrder.id)
  const abIntent = await stripe.paymentIntents.create({
    amount: 2749, currency: 'aud',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { drill: `unfulfilled-${STAMP}`, who: 'abandoned' },
  })
  await db.from('payments').insert({
    order_id: abandonedOrder.id, gateway: 'stripe', status: 'processing',
    amount_cents: 2749, currency: 'AUD', gateway_payment_id: abIntent.id,
    idempotency_key: `unf-${abandonedOrder.id}`,
  })
  console.log(`  abandoned: order ${abandonedOrder.order_number}, intent ${abIntent.id} (${abIntent.status})`)
  assert(abIntent.status !== 'succeeded', 'the abandoned intent was never paid', abIntent.status)

  // Both rows are now byte-for-byte the same shape in our schema.
  const { data: shape } = await db.from('orders')
    .select('id, order_number, status, payments(gateway_payment_id, status)')
    .in('id', [B.order.id, abandonedOrder.id])
  console.log('  what OUR OWN TABLE can see about the two of them:')
  for (const r of shape) {
    console.log(`    ${r.order_number}  status=${r.status}  payment=${r.payments[0].status}  intent=${r.payments[0].gateway_payment_id.slice(0, 12)}...`)
  }
  assert(shape.every(r => r.status === 'pending' && r.payments[0].status === 'processing'),
    'the charged buyer and the abandoned cart are INDISTINGUISHABLE in our database, so Stripe must be asked')
  scanned.push('an abandoned checkout with the identical row shape, as the control the listing must exclude')

  // CLOCK ONLY. Past the surface's 15 minute grace.
  await db.from('orders')
    .update({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() })
    .in('id', [B.order.id, abandonedOrder.id])

  // ═══════════════════════════════════════════════════════════ STEP 5
  hr('STEP 5  an admin signs in through the REAL admin login and opens the surface')
  const adminEmail = `unf-admin-${STAMP}@eventlinqs.test`
  // GENERATED PER RUN, never a literal. A fixture password written into a file is
  // still a password written into a file, and scripts/guards/no-plaintext-credential
  // is right to refuse one whatever its intent. This one exists for the length of
  // the drill and the account it opens is deleted in the finally block.
  const adminPassword = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  adminUserId = created.data.user.id
  await db.from('profiles').upsert({
    id: adminUserId, email: adminEmail, full_name: 'Unfulfilled Drill Admin',
    display_name: 'Unfulfilled Drill Admin', is_verified: true,
  })
  const { error: auErr } = await db.from('admin_users').insert({
    id: adminUserId, role: 'super_admin', display_name: 'Unfulfilled Drill Admin',
  })
  if (auErr) throw new Error(`admin_users insert: ${auErr.message}`)
  console.log(`  admin ${adminEmail} (${adminUserId}) role=super_admin, no TOTP enrolled`)

  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('input[name="email"]').fill(adminEmail)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60_000 })
  console.log(`  signed in, landed on ${new URL(page.url()).pathname}`)
  assert(!new URL(page.url()).pathname.endsWith('/admin/login'), 'the real admin login flow accepted the session')

  await page.goto(`${BASE}/admin/orders/unfulfilled`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  await page.screenshot({ path: path.join(SHOTS, '01-surface-1440.png'), fullPage: true })
  const listing = await page.locator('body').innerText()
  console.log(`  page heading: ${(await page.locator('h1').first().innerText().catch(() => '(none)'))}`)
  const checkedLine = listing.match(/(\d+) payments? verified against\s+Stripe, (\d+) outstanding/i)
  console.log(`  the surface published its own workload: ${checkedLine ? checkedLine[0].replace(/\s+/g, ' ') : '(NOT PUBLISHED)'}`)
  assert(!!checkedLine, 'the surface says how many payments it verified, so a silent stop cannot read as a clean page')

  assert(listing.includes(B.order.order_number),
    `the CHARGED buyer ${B.order.order_number} is listed`, listing.slice(0, 200))
  assert(!listing.includes(abandonedOrder.order_number),
    `the ABANDONED checkout ${abandonedOrder.order_number} is NOT listed (Stripe was genuinely consulted)`)
  scanned.push('the live admin page at 1440, listing the charged buyer and excluding the abandoned cart')

  // ═══════════════════════════════════════════════════════════ STEP 6
  hr('STEP 6  the CONTROL for the other direction: an order that HAS a ticket is excluded')
  // The listing refuses any order carrying a ticket, because that one belongs to
  // the ordinary refund path which voids the ticket and returns the seat. Planted
  // directly and removed straight after, so the exclusion is observed and not assumed.
  const { data: bItem } = await db.from('order_items').select('id').eq('order_id', B.order.id).limit(1).single()
  const { data: plant } = await db.from('tickets').insert({
    order_id: B.order.id, order_item_id: bItem.id, event_id: event.id, ticket_tier_id: tier.id,
    holder_email: `unf-${STAMP}-control@resend.dev`, holder_name: 'Exclusion Control',
    idx_in_item: 98, status: 'valid',
    ticket_code: `UNFC-${STAMP.toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    secret: randomUUID(),
  }).select('id').single()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  const withTicket = await page.locator('body').innerText()
  assert(!withTicket.includes(B.order.order_number),
    'CONTROL: once a ticket exists the order DROPS OFF this surface, so the listing is a real filter and not a static page')
  await db.from('tickets').delete().eq('id', plant.id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  const backAgain = await page.locator('body').innerText()
  assert(backAgain.includes(B.order.order_number), 'CONTROL: with the planted ticket removed it is listed again')
  scanned.push('a planted ticket, proving the listing is a live filter that can both include and exclude')

  // ═══════════════════════════════════════════════════════════ STEP 7
  hr('STEP 7  ONE CLICK: refund and close')
  const row = page.locator('tr', { hasText: B.order.order_number })
  await row.getByRole('button', { name: /refund and close/i }).click()
  await page.screenshot({ path: path.join(SHOTS, '02-confirm-1440.png'), fullPage: true })
  await row.getByRole('button', { name: /confirm refund/i }).click()
  await page.waitForTimeout(9000)
  await page.screenshot({ path: path.join(SHOTS, '03-settled-1440.png'), fullPage: true })
  const settledText = await page.locator('body').innerText()
  console.log(`  operator saw: ${(settledText.match(/Refunded [^\n]+/) ?? ['(no confirmation line found)'])[0]}`)
  // The heading is asserted too. The first version of this page emptied itself on
  // success (revalidatePath in the action re-rendered the route out from under the
  // confirmation), and "the message is missing" and "the whole page is missing"
  // are different defects that must not be reported as the same one.
  assert(/Money taken, no ticket/.test(settledText),
    'the page is still standing after the click, not blanked by a re-render')
  assert(/Refunded [\d.]+ to the buyer and closed the order/i.test(settledText),
    'the operator got a plain confirmation of what happened', settledText.slice(0, 300))
  assert(await row.getByRole('button', { name: /refund and close|confirm refund/i }).count() === 0,
    'the refund button is gone, so the same row cannot be pressed a second time')

  // The confirmation offers a reload; press it rather than leaving a control the
  // drill has never touched.
  await row.getByRole('button', { name: /reload the list/i }).click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: path.join(SHOTS, '03b-after-reload-1440.png'), fullPage: true })
  assert(!(await page.locator('body').innerText()).includes(B.order.order_number),
    'after the operator reloads, the settled order is gone from the list')

  // ═══════════════════════════════════════════════════════════ STEP 8
  hr('STEP 8  did money actually move? Ask STRIPE, not our table')
  const settled = await stripe.paymentIntents.retrieve(B.intent.id, { expand: ['latest_charge'] })
  const refunds = await stripe.refunds.list({ payment_intent: B.intent.id, limit: 10 })
  console.log(`  Stripe: captured ${settled.latest_charge.amount_captured}c, refunded ${settled.latest_charge.amount_refunded}c`)
  for (const r of refunds.data) console.log(`    refund ${r.id} ${r.status} ${r.amount}c  meta=${JSON.stringify(r.metadata)}`)
  assert(settled.latest_charge.amount_refunded === settled.latest_charge.amount_captured,
    'the buyer got every cent back, confirmed at Stripe',
    `${settled.latest_charge.amount_refunded}/${settled.latest_charge.amount_captured}`)
  assert(refunds.data.length === 1, 'exactly ONE refund exists', refunds.data.length)
  assert(refunds.data[0].metadata?.initiated_by_admin_id === adminUserId,
    'the Stripe refund carries the admin who pressed the button, readable without our database',
    refunds.data[0].metadata?.initiated_by_admin_id)

  const closed = await orderState(B.order.id)
  console.log(`  our order is now: ${closed.status}`)
  assert(closed.status === 'cancelled', 'the order was closed as cancelled (never confirmed, so never sold)', closed.status)
  assert(await ticketCount(B.order.id) === 0, 'still no ticket was minted')
  const finalTier = await tierState()
  assert(finalTier.sold_count === 1, "A's seat was untouched by B's refund", JSON.stringify(finalTier))

  const { data: audit } = await db.from('audit_log')
    .select('action, actor_id, metadata')
    .eq('target_id', B.order.id).order('created_at', { ascending: false })
  console.log(`  audit entries against this order: ${(audit ?? []).map(a => a.action).join(', ') || '(none)'}`)
  assert((audit ?? []).some(a => a.action === 'admin.order.unfulfilled.settled' && a.actor_id === adminUserId),
    'the settlement is in the audit log against the admin who did it')
  scanned.push('the Stripe refund object, the closed order, the untouched inventory and the audit entry')

  // ═══════════════════════════════════════════════════════════ STEP 9
  hr('STEP 9  the surface after: the row is gone, and a second press cannot refund twice')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  await page.screenshot({ path: path.join(SHOTS, '04-after-1440.png'), fullPage: true })
  const after = await page.locator('body').innerText()
  assert(!after.includes(B.order.order_number), 'the settled order is no longer listed')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  await page.screenshot({ path: path.join(SHOTS, '05-surface-390.png'), fullPage: true })
  const mobileWidth = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth, win: window.innerWidth,
  }))
  console.log(`  390: documentElement.scrollWidth=${mobileWidth.doc} window.innerWidth=${mobileWidth.win}`)
  assert(mobileWidth.doc <= mobileWidth.win + 1, 'the page does not scroll sideways at 390', JSON.stringify(mobileWidth))

  const refundsAfter = await stripe.refunds.list({ payment_intent: B.intent.id, limit: 10 })
  assert(refundsAfter.data.length === 1, 'STILL exactly one refund at Stripe after a reload', refundsAfter.data.length)

  console.log(`  browser console errors during the whole drive: ${consoleErrors.length}`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`    ${e}`)

  // ═══════════════════════════════════════════════════════════ STEP 10
  hr('STEP 10  WHAT THE BUYER SEES AFTERWARDS')
  const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const guestPage = await guest.newPage()
  const conf = await guestPage.goto(`${BASE}/orders/${B.order.id}/confirmation`, {
    waitUntil: 'domcontentloaded', timeout: 120_000,
  })
  console.log(`  GET /orders/${B.order.id}/confirmation -> HTTP ${conf.status()} (final URL ${new URL(guestPage.url()).pathname})`)
  const buyerText = (await guestPage.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(0, 700)
  console.log('  ---- what the buyer reads ----')
  for (const line of buyerText.split('\n').slice(0, 20)) console.log(`  | ${line}`)
  console.log('  ------------------------------')
  await guestPage.screenshot({ path: path.join(SHOTS, '06-buyer-view-1440.png'), fullPage: true })
  assert(conf.status() < 500, 'the buyer does not meet a 500 on their order after it is settled', conf.status())

  // THE POINT OF STEP 10. Before this drill ran, a settled order still told the
  // buyer "Your spot is locked in. Your ticket is being issued now and lands in
  // your email within a few minutes." They had been refunded minutes earlier.
  const full = await guestPage.locator('body').innerText()
  assert(!/is being issued now|on its way|is locked in/i.test(full),
    'the buyer is NOT told a ticket is coming for an order that was closed and refunded',
    (full.match(/[^\n]*(is being issued now|on its way|is locked in)[^\n]*/i) ?? [''])[0])
  assert(/refunded/i.test(full) && /no ticket was issued/i.test(full),
    'the buyer is told plainly that no ticket was issued and the money has gone back')
  await guest.close()
  scanned.push("the buyer's own order page after settlement, read back and asserted rather than assumed")
} catch (err) {
  console.error('\nDRILL FAILED TO RUN:', err)
  fails.push(`drill threw: ${err?.message ?? err}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (!KEEP) {
    for (const id of cleanupOrders) {
      const { data: rf } = await db.from('refunds').select('id').eq('order_id', id)
      const rIds = (rf ?? []).map(r => r.id)
      if (rIds.length) await db.from('refund_tickets').delete().in('refund_id', rIds)
      await db.from('tickets').delete().eq('order_id', id)
      if (rIds.length) await db.from('refunds').delete().in('id', rIds)
      await db.from('payments').delete().eq('order_id', id)
      await db.from('order_items').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
    await db.from('organiser_balance_ledger').delete().eq('organisation_id', org.id)
    await db.from('payout_holds').delete().eq('organisation_id', org.id)
    await db.from('reservations').delete().eq('event_id', event.id)
    const { data: links } = await db.from('share_links').select('id').eq('event_id', event.id)
    if ((links ?? []).length) await db.from('share_links').delete().in('id', links.map(l => l.id))
    await db.from('ticket_tiers').delete().eq('event_id', event.id)
    await db.from('events').delete().eq('id', event.id)
    await db.from('organisations').delete().eq('id', org.id)
    if (adminUserId) {
      await db.from('audit_log').delete().eq('actor_id', adminUserId)
      await db.from('admin_users').delete().eq('id', adminUserId)
      await db.from('profiles').delete().eq('id', adminUserId)
      await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    }
    console.log('\n  fixture removed')
  } else {
    console.log('\n  --keep: fixture LEFT IN PLACE')
  }
}

hr('WHAT THIS DRILL SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`  screenshots: ${SHOTS}`)
if (fails.length) {
  console.log(`  ${fails.length} FAILED ASSERTION(S):`)
  for (const f of fails) console.log(`    - ${f}`)
  process.exit(1)
}
console.log('  ALL ASSERTIONS PASSED')
