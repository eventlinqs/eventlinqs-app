/**
 * WEBHOOK ORDERING AND REDELIVERY, driven over HTTP rather than reasoned.
 *
 * Two gaps were named as unproven in the 2026-08-19 report, and both are places a
 * duplicate refund or a double inventory movement would live:
 *
 *   1. OUT OF ORDER. charge.refunded arriving BEFORE payment_intent.succeeded.
 *      Stripe makes no ordering guarantee between event types, and a refund issued
 *      seconds after a purchase can overtake the purchase on redelivery.
 *   2. REDELIVERY. The same payment_intent.succeeded delivered twice.
 *
 * The pieces are individually proven (claimWebhookEvent dedupes on event id;
 * confirm_order early-returns on `confirmed`) and had never been driven TOGETHER
 * over the real route.
 *
 * WHY THIS CAN BE DRIVEN AT ALL, given Stripe also delivers to staging. Staging
 * shares this TEST database, so its handler would race the drill. Two things stop
 * that, and both are deliberate:
 *
 *   - The PaymentIntent is created with NO `order_id` in its metadata.
 *     handlePaymentSucceeded returns early on a missing order_id, so Stripe's own
 *     delivery to staging is a clean no-op: it does not throw, so it is never
 *     retried, so it cannot arrive later and interfere.
 *   - The events THIS drill sends carry their own `evt_local_*` ids. The dedupe
 *     ledger is keyed on event id and is shared with staging, so reusing Stripe's
 *     real event id would let a staging claim mark the drill's delivery a duplicate.
 *
 * WHAT IS REAL AND WHAT IS SYNTHESISED, stated so the proof is not overclaimed. The
 * PaymentIntent, the charge and the refund are REAL Stripe test-mode objects,
 * fetched from the API. The HTTP delivery is signed locally with Stripe's own
 * `generateTestHeaderString`, so the route's signature verification runs unmodified.
 * The ONLY synthesised field is `metadata.order_id` on the intent, injected into the
 * event body because it was deliberately left off the real object to keep staging
 * out of the way. charge.refunded needs no injection at all: that handler resolves
 * the order from payments.gateway_payment_id and lists refunds from the Stripe API.
 *
 * TEST ONLY, guarded. It creates a real test-mode charge and refund, which move no
 * real money.
 *
 * USAGE: node --env-file=.env.test scripts/verify/webhook-ordering-drill.mjs \
 *          [--url http://localhost:3000] [--secret <whsec>]
 */
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const BASE = (arg('--url', 'http://localhost:3000')).replace(/\/+$/, '')
const SECRET = arg('--secret') ?? process.env.STRIPE_WEBHOOK_SECRET
if (!SECRET) { console.error('a webhook signing secret is required'); process.exit(2) }

const SK = process.env.STRIPE_SECRET_KEY
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SK?.startsWith('sk_test_')) { console.error('REFUSING: requires a TEST-mode Stripe key'); process.exit(2) }
const stripe = new Stripe(SK, { apiVersion: STRIPE_API_VERSION })
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const STAMP = Date.now().toString(36)
const fails = []
const findings = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

// ---------------------------------------------------------------- fixture
const { data: coverDonor } = await db.from('events').select('cover_image_url')
  .eq('status', 'published').not('cover_image_url', 'is', null)
  .not('cover_image_url', 'ilike', 'https://picsum.photos/%').limit(1).maybeSingle()
const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()
const { data: prof } = await db.from('profiles').select('id').limit(1).maybeSingle()

const { data: org } = await db.from('organisations').insert({
  name: `Ordering Drill ${STAMP}`, slug: `ordering-drill-${STAMP}`, owner_id: prof.id,
  email: `ordering-${STAMP}@eventlinqs.test`, status: 'active', payout_status: 'active',
  stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU',
}).select('id').single()

const startDate = new Date(Date.now() + 21 * 864e5)
const { data: event } = await db.from('events').insert({
  title: `Ordering Drill ${STAMP}`, slug: `ordering-drill-${STAMP}`,
  description: 'Webhook ordering drill.', summary: 'Ordering drill',
  organisation_id: org.id, created_by: prof.id, category_id: cat?.id ?? null,
  start_date: startDate.toISOString(), end_date: new Date(startDate.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney', event_type: 'in_person',
  venue_name: 'Hall', venue_address: '1 St', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: coverDonor?.cover_image_url ?? null,
  is_age_restricted: false, max_capacity: 10, is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id').single()

const { data: tier } = await db.from('ticket_tiers').insert({
  event_id: event.id, name: 'General Admission', tier_type: 'general_admission',
  price: 2500, currency: 'AUD', total_capacity: 5, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id').single()
scanned.push('an isolated fixture: organisation, published paid event, GA tier with 5 seats')

const tierState = async () =>
  (await db.from('ticket_tiers').select('total_capacity, sold_count, reserved_count').eq('id', tier.id).single()).data
const orderState = async id =>
  (await db.from('orders').select('status').eq('id', id).single()).data
const ticketCount = async id =>
  (await db.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', id)).count ?? 0
const refundRows = async id =>
  (await db.from('refunds').select('id, status, amount_cents, initiator').eq('order_id', id)).data ?? []
const ledgerSum = async () => {
  const { data } = await db.from('organiser_balance_ledger').select('delta_cents').eq('organisation_id', org.id)
  return (data ?? []).reduce((s, r) => s + Number(r.delta_cents), 0)
}

/**
 * A pending order with a live reservation, order_items (so the ticket trigger has
 * something to issue) and a payments row carrying a REAL Stripe intent id, exactly
 * as checkout leaves things before the buyer pays.
 */
async function buildPendingOrder(qty = 1) {
  const { data: resv } = await db.rpc('create_reservation', {
    p_event_id: event.id, p_user_id: null,
    p_session_id: `ord-${STAMP}-${Math.random().toString(36).slice(2, 8)}`,
    p_items: [{ ticket_tier_id: tier.id, quantity: qty }], p_ttl_minutes: 30,
  })
  if (!resv?.success) throw new Error(`create_reservation failed: ${JSON.stringify(resv)}`)
  const { data: resvRow } = await db.from('reservations').select('id').eq('event_id', event.id)
    .eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()

  const { data: order, error: oErr } = await db.from('orders').insert({
    event_id: event.id, organisation_id: org.id, reservation_id: resvRow.id,
    status: 'pending', currency: 'AUD',
    subtotal_cents: 2500 * qty, total_cents: 2749 * qty,
    platform_fee_cents: 187 * qty, processing_fee_cents: 62 * qty,
    discount_cents: 0, addon_total_cents: 0,
    guest_email: `ordering-${STAMP}-${Math.random().toString(36).slice(2, 6)}@resend.dev`,
    order_number: `EL-ORD${STAMP.toUpperCase().slice(0, 4)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
  }).select('id, order_number').single()
  if (oErr) throw new Error(`order insert: ${oErr.message}`)

  const { error: iErr } = await db.from('order_items').insert(
    Array.from({ length: qty }, () => ({
      order_id: order.id, ticket_tier_id: tier.id, addon_id: null,
      item_type: 'ticket', item_name: 'General Admission',
      quantity: 1, unit_price_cents: 2500, total_cents: 2500,
      attendee_first_name: 'Ordering', attendee_last_name: 'Drill',
      attendee_email: `ordering-${STAMP}@resend.dev`,
    })),
  )
  if (iErr) throw new Error(`order_items insert: ${iErr.message}`)

  // A REAL test-mode intent, confirmed so it has a real charge. NO order_id in the
  // metadata, so Stripe's own delivery to staging early-returns and never retries.
  const intent = await stripe.paymentIntents.create({
    amount: 2749 * qty, currency: 'aud',
    payment_method: 'pm_card_visa', confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { drill: `ordering-${STAMP}` },
  })

  const { error: pErr } = await db.from('payments').insert({
    order_id: order.id, gateway: 'stripe', status: 'processing',
    amount_cents: 2749 * qty, currency: 'AUD',
    gateway_payment_id: intent.id,
    idempotency_key: `drill-${order.id}`,
  })
  if (pErr) throw new Error(`payments insert: ${pErr.message}`)

  return { order, resvId: resvRow.id, intent }
}

/** Deliver a signed event to the real route. Returns the HTTP status and body. */
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

try {
  // ================================================================ TEST 1
  hr('TEST 1  OUT OF ORDER: charge.refunded arrives BEFORE payment_intent.succeeded')
  const A = await buildPendingOrder(1)
  cleanupOrders.push(A.order.id)
  const beforeA = await tierState()
  const ledgerBeforeA = await ledgerSum()
  console.log(`  order ${A.order.order_number} pending, intent ${A.intent.id}`)
  console.log(`  tier: sold=${beforeA.sold_count} reserved=${beforeA.reserved_count} capacity=${beforeA.total_capacity}`)
  console.log(`  organiser ledger total before: ${ledgerBeforeA}c`)
  scanned.push('a real test-mode PaymentIntent confirmed with pm_card_visa, and a real refund of it')

  // Refund the real charge BEFORE the app has ever heard the payment succeeded.
  const refund = await stripe.refunds.create({ payment_intent: A.intent.id })
  console.log(`  created REAL refund ${refund.id} (${refund.status}) while the order is still pending`)

  const chargeA = await stripe.charges.retrieve(
    typeof A.intent.latest_charge === 'string' ? A.intent.latest_charge : A.intent.latest_charge.id,
  )

  // 1. the refund event FIRST
  const d1 = await deliver('charge.refunded', chargeA, `evt_local_ord1_refund_${STAMP}`)
  console.log(`\n  [1] charge.refunded          -> HTTP ${d1.status} ${d1.text}`)
  await sleep(4000)
  const afterRefundFirst = {
    tier: await tierState(), order: await orderState(A.order.id),
    tickets: await ticketCount(A.order.id), refunds: await refundRows(A.order.id),
    ledger: await ledgerSum(),
  }
  console.log(`      order=${afterRefundFirst.order.status}  tickets=${afterRefundFirst.tickets}  refund rows=${afterRefundFirst.refunds.length}`)
  console.log(`      tier sold=${afterRefundFirst.tier.sold_count} reserved=${afterRefundFirst.tier.reserved_count}`)
  console.log(`      organiser ledger total=${afterRefundFirst.ledger}c`)

  // 2. the payment event SECOND
  const d2 = await deliver('payment_intent.succeeded',
    { ...A.intent, metadata: { ...A.intent.metadata, order_id: A.order.id } },
    `evt_local_ord1_pi_${STAMP}`)
  console.log(`\n  [2] payment_intent.succeeded -> HTTP ${d2.status} ${d2.text}`)
  await sleep(5000)
  const finalA = {
    tier: await tierState(), order: await orderState(A.order.id),
    tickets: await ticketCount(A.order.id), refunds: await refundRows(A.order.id),
    ledger: await ledgerSum(),
  }
  console.log(`      order=${finalA.order.status}  tickets=${finalA.tickets}  refund rows=${finalA.refunds.length}`)
  console.log(`      tier sold=${finalA.tier.sold_count} reserved=${finalA.tier.reserved_count}`)
  console.log(`      organiser ledger total=${finalA.ledger}c`)

  hr('TEST 1 VERDICT')
  const refundedAtStripe = (await stripe.charges.retrieve(chargeA.id)).amount_refunded
  console.log(`  Stripe says amount_refunded = ${refundedAtStripe}c of ${chargeA.amount}c`)
  const ticketWithNoMoney = finalA.tickets > 0 && refundedAtStripe >= chargeA.amount
  if (ticketWithNoMoney) {
    findings.push(
      `OUT OF ORDER: ${finalA.tickets} admitting ticket(s) exist on order ${A.order.order_number} `
      + `while Stripe has refunded the full ${refundedAtStripe}c. A ticket exists and no money was taken.`,
    )
    console.log('\n  >>> A TICKET EXISTS AND NO MONEY WAS TAKEN.')
    console.log(`  >>> order=${finalA.order.status}, tickets=${finalA.tickets}, fully refunded at Stripe.`)
  }
  assert(!ticketWithNoMoney,
    'no admitting ticket exists for a fully refunded charge',
    `tickets=${finalA.tickets} refunded=${refundedAtStripe}/${chargeA.amount}`)
  assert(finalA.tier.sold_count + finalA.tier.reserved_count <= finalA.tier.total_capacity,
    `sold+reserved (${finalA.tier.sold_count + finalA.tier.reserved_count}) within capacity (${finalA.tier.total_capacity})`)

  // ================================================================ TEST 2
  hr('TEST 2  REDELIVERY: the same payment_intent.succeeded twice')
  const B = await buildPendingOrder(2)
  cleanupOrders.push(B.order.id)
  const beforeB = await tierState()
  console.log(`  order ${B.order.order_number} pending, 2 tickets, intent ${B.intent.id}`)
  console.log(`  tier before: sold=${beforeB.sold_count} reserved=${beforeB.reserved_count}`)

  const evtId = `evt_local_ord2_pi_${STAMP}`
  const piBody = { ...B.intent, metadata: { ...B.intent.metadata, order_id: B.order.id } }

  const r1 = await deliver('payment_intent.succeeded', piBody, evtId)
  console.log(`\n  [1] first delivery     -> HTTP ${r1.status} ${r1.text}`)
  await sleep(5000)
  const after1 = { tier: await tierState(), order: await orderState(B.order.id), tickets: await ticketCount(B.order.id) }
  console.log(`      order=${after1.order.status} tickets=${after1.tickets} sold=${after1.tier.sold_count} reserved=${after1.tier.reserved_count}`)
  assert(after1.order.status === 'confirmed', 'the first delivery confirmed the order', after1.order.status)
  assert(after1.tickets === 2, 'the first delivery issued exactly 2 tickets', after1.tickets)
  assert(after1.tier.sold_count === beforeB.sold_count + 2,
    `sold_count moved by 2 (${beforeB.sold_count} -> ${after1.tier.sold_count})`, after1.tier.sold_count)

  // SAME event id: this exercises the dedupe ledger (claimWebhookEvent).
  const r2 = await deliver('payment_intent.succeeded', piBody, evtId)
  console.log(`\n  [2] SAME event id      -> HTTP ${r2.status} ${r2.text}`)
  await sleep(4000)
  const after2 = { tier: await tierState(), order: await orderState(B.order.id), tickets: await ticketCount(B.order.id) }
  console.log(`      order=${after2.order.status} tickets=${after2.tickets} sold=${after2.tier.sold_count} reserved=${after2.tier.reserved_count}`)
  assert(/duplicate/.test(r2.text), 'the route reported the redelivery as a duplicate', r2.text)
  assert(after2.tickets === 2, 'STILL exactly 2 tickets (no duplicate issue)', after2.tickets)
  assert(after2.tier.sold_count === after1.tier.sold_count,
    `sold_count unchanged (${after1.tier.sold_count})`, after2.tier.sold_count)
  scanned.push('the same payment_intent.succeeded delivered twice with the SAME event id (dedupe ledger)')

  // DIFFERENT event id: the dedupe ledger cannot help, so this isolates
  // confirm_order's own already-confirmed latch. Both layers must hold.
  const r3 = await deliver('payment_intent.succeeded', piBody, `${evtId}_second`)
  console.log(`\n  [3] DIFFERENT event id -> HTTP ${r3.status} ${r3.text}`)
  await sleep(4000)
  const after3 = { tier: await tierState(), order: await orderState(B.order.id), tickets: await ticketCount(B.order.id) }
  console.log(`      order=${after3.order.status} tickets=${after3.tickets} sold=${after3.tier.sold_count} reserved=${after3.tier.reserved_count}`)
  assert(after3.tickets === 2, 'STILL exactly 2 tickets with a NEW event id (confirm_order latch holds)', after3.tickets)
  assert(after3.tier.sold_count === after1.tier.sold_count,
    `sold_count STILL unchanged with a new event id (${after1.tier.sold_count})`, after3.tier.sold_count)
  scanned.push('a THIRD delivery with a DIFFERENT event id, isolating confirm_order from the dedupe ledger')
} catch (err) {
  console.error('\nDRILL FAILED TO RUN:', err)
  fails.push(`drill threw: ${err?.message ?? err}`)
} finally {
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
  console.log('\n  fixture removed')
}

hr('WHAT THIS DRILL SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
if (findings.length) {
  hr(`FINDINGS: ${findings.length}`)
  findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}\n`))
}
console.log(`  ${fails.length === 0 ? 'ALL ASSERTIONS PASSED' : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
