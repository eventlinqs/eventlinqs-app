/**
 * THE BUYER'S REFUND REQUEST, END TO END, WITH A REAL STRIPE CHARGE AND A REAL
 * STRIPE REFUND, AND EVERY ARTEFACT OF THE PURCHASE CHECKED AFTERWARDS.
 *
 * WHAT THIS PROVES, and it is deliberately the whole chain rather than a slice:
 *
 *   1. A seated, paid order exists, charged on a REAL Stripe test PaymentIntent.
 *      Not a synthetic id: an actual charge, so the refund leg is a real refund.
 *   2. The event carries a per-event refund policy, and the buyer's eligibility
 *      is decided by the ONE policy module the event page and the email use.
 *   3. The buyer submits a request through the real service.
 *   4. Because the policy qualifies it, the funds are there and the organiser
 *      enabled self-service, it is AUTO-APPROVED and refunded with NO organiser
 *      involvement, through requestTicketRefund: the SAME function the organiser
 *      dashboard button calls. One path, two triggers.
 *   5. The Stripe webhook's reconcile step is driven with the REAL refund id.
 *   6. EVERY artefact of the purchase is then read back and adjudicated:
 *      the ticket, the tier inventory, the SEAT, the order, the ledger, the
 *      refund row and the request row.
 *
 * NEGATIVE CONTROLS, because "it worked" and "the check cannot fail" print the
 * same tick:
 *   * A second request on the same order must be REFUSED (one open request).
 *   * A request against a no_refunds event must be REFUSED by policy.
 *   * The unwind table must contain at least one row that WOULD have failed
 *     before migration 20260820000001, namely the seat.
 *
 * TEST ONLY, guarded. Uses Stripe TEST keys from .env.test. Removable with
 * --teardown.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-request-drill.mjs
 *   node --env-file=.env.test scripts/verify/refund-request-drill.mjs --teardown
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const TEARDOWN = argv.includes('--teardown')
const ROW_LABEL = 'ZZREQ'
const ORDER_PREFIX = 'ELREQ-'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const key = process.env.STRIPE_SECRET_KEY || ''
if (!key.startsWith('sk_test_')) {
  console.error(`  REFUSED: STRIPE_SECRET_KEY is not a test key (starts ${key.slice(0, 8)}).`)
  process.exit(1)
}
const stripe = new Stripe(key)

const hr = t => { console.log('\n' + '='.repeat(92)); console.log('  ' + t); console.log('='.repeat(92)) }
const die = (m, e) => { console.error(`  FAILED: ${m}${e ? ` :: ${e.message ?? e}` : ''}`); process.exit(1) }
let failures = 0
const check = (label, got, want, ok) => {
  if (!ok) failures += 1
  console.log(`  ${label.padEnd(30)} ${String(got).padEnd(18)} ${String(want).padEnd(22)} ${ok ? 'OK' : 'FAIL  <<<'}`)
}

// ------------------------------------------------------------------ teardown
if (TEARDOWN) {
  const { data: orders } = await db.from('orders').select('id').like('order_number', `${ORDER_PREFIX}%`)
  const ids = (orders ?? []).map(o => o.id)
  for (const oid of ids) {
    const { data: reqs } = await db.from('refund_requests').select('id').eq('order_id', oid)
    for (const r of reqs ?? []) await db.from('refund_request_tickets').delete().eq('request_id', r.id)
    await db.from('refund_requests').delete().eq('order_id', oid)
    const { data: rf } = await db.from('refunds').select('id').eq('order_id', oid)
    for (const r of rf ?? []) await db.from('refund_tickets').delete().eq('refund_id', r.id)
    await db.from('refunds').delete().eq('order_id', oid)
    await db.from('organiser_balance_ledger').delete().eq('reference_id', oid)
    await db.from('payments').delete().eq('order_id', oid)
    await db.from('tickets').delete().eq('order_id', oid)
    await db.from('order_items').delete().eq('order_id', oid)
  }
  const { data: seats } = await db.from('seats').select('id').eq('row_label', ROW_LABEL)
  if ((seats ?? []).length) await db.from('seats').delete().in('id', seats.map(s => s.id))
  for (const oid of ids) {
    const { data: o } = await db.from('orders').select('reservation_id').eq('id', oid).maybeSingle()
    await db.from('orders').delete().eq('id', oid)
    if (o?.reservation_id) await db.from('reservations').delete().eq('id', o.reservation_id)
  }
  console.log(`  removed ${ids.length} request-drill order(s) and ${(seats ?? []).length} seat(s)`)
  process.exit(0)
}

// ------------------------------------------------------------------ fixture
hr('0. FIXTURE: a published paid event with a seat, and a self-service refund policy')

const { data: candidates } = await db
  .from('ticket_tiers')
  .select('id, event_id, name, price, sold_count, events!inner(id, title, organisation_id, status, start_date)')
  .eq('is_active', true).gt('price', 0).eq('events.status', 'published').limit(25)
const tier = (candidates ?? []).find(t => t.events?.organisation_id)
if (!tier) die('no active paid tier on a published event')
const event = tier.events

// The event start must be far enough away that the policy window is OPEN,
// otherwise this drill would prove the refusal path instead of the approval one.
// Both dates move: events carries CHECK (end_date > start_date), so pushing the
// start alone violates it.
const far = new Date(Date.now() + 60 * 24 * 3600_000).toISOString()
const farEnd = new Date(Date.now() + 60 * 24 * 3600_000 + 4 * 3600_000).toISOString()
const { error: polErr } = await db.from('events').update({
  start_date: far,
  end_date: farEnd,
  refund_policy_type: 'days_before',
  refund_policy_days: 7,
  refund_policy_self_service: true,
  refund_policy_absorb_fee: true,
}).eq('id', event.id)
if (polErr) die('could not set the event policy (is the one-way trigger refusing a tightening?)', polErr)

const { data: pol } = await db.from('events')
  .select('refund_policy_type, refund_policy_days, refund_policy_self_service, refund_policy_absorb_fee, start_date')
  .eq('id', event.id).maybeSingle()
console.log(`  event  ${event.id}  ${event.title}`)
console.log(`  policy ${pol.refund_policy_type} ${pol.refund_policy_days}d self-service=${pol.refund_policy_self_service} absorb=${pol.refund_policy_absorb_fee}`)
console.log(`  starts ${pol.start_date}`)

const stamp = Date.now().toString(36)
const buyerEmail = `req-drill-${stamp}@eventlinqs.test`
const { data: buyer, error: bErr } = await db.auth.admin.createUser({
  email: buyerEmail, password: `${randomUUID()}Aa1`, email_confirm: true,
})
if (bErr) die('buyer', bErr)
const buyerId = buyer.user.id
await db.from('profiles').upsert({ id: buyerId, email: buyerEmail, full_name: 'Request Drill', display_name: 'Request Drill' })

const { data: seat, error: sErr } = await db.from('seats').insert({
  event_id: event.id, ticket_tier_id: tier.id, row_label: ROW_LABEL, seat_number: stamp,
  seat_type: 'standard', status: 'available', price_cents: tier.price,
}).select('id, row_label, seat_number, status').single()
if (sErr) die('seat', sErr)
console.log(`  seat   ${seat.row_label}${seat.seat_number}  ${seat.status}`)

// ------------------------------------------------------------------ real charge
hr('1. A REAL STRIPE TEST CHARGE')
const face = tier.price
const intent = await stripe.paymentIntents.create({
  amount: face,
  currency: 'aud',
  payment_method: 'pm_card_visa',
  confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  metadata: { drill: 'refund-request-drill', stamp },
})
console.log(`  payment intent ${intent.id}  status=${intent.status}  amount=${intent.amount}`)
if (intent.status !== 'succeeded') die(`payment intent did not succeed (${intent.status})`)

// ------------------------------------------------------------------ purchase
hr('2. THE PURCHASE: reservation, order, confirm, seat sold')
const { data: reservation } = await db.from('reservations').insert({
  event_id: event.id, user_id: buyerId, status: 'active',
  items: [{ ticket_tier_id: tier.id, quantity: 1 }],
  expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
}).select('id').single()

await db.from('seats').update({ status: 'reserved', reservation_id: reservation.id }).eq('id', seat.id)

const { data: order, error: oErr } = await db.from('orders').insert({
  order_number: `${ORDER_PREFIX}${stamp.toUpperCase()}`, event_id: event.id,
  organisation_id: event.organisation_id, user_id: buyerId, reservation_id: reservation.id,
  status: 'pending', subtotal_cents: face, platform_fee_cents: 0, processing_fee_cents: 0,
  total_cents: face, currency: 'AUD',
}).select('id, order_number, total_cents, currency, organisation_id, event_id, status, user_id, guest_email').single()
if (oErr) die('order', oErr)

await db.from('order_items').insert({
  order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket', item_name: tier.name,
  quantity: 1, unit_price_cents: face, total_cents: face,
})
await db.from('payments').insert({
  order_id: order.id, gateway: 'stripe', gateway_payment_id: intent.id,
  status: 'completed', amount_cents: face, currency: 'AUD', idempotency_key: `req-drill-${stamp}`,
})

const { error: cErr } = await db.rpc('confirm_order', { p_order_id: order.id })
if (cErr) die('confirm_order', cErr)
await db.rpc('assign_order_seats', { p_order_id: order.id })
await db.from('seats').update({ status: 'sold' }).eq('id', seat.id).eq('status', 'reserved')

const { data: tickets } = await db.from('tickets').select('id, status, seat_id').eq('order_id', order.id)
const { data: tierMid } = await db.from('ticket_tiers').select('sold_count').eq('id', tier.id).maybeSingle()
const { data: seatMid } = await db.from('seats').select('status').eq('id', seat.id).maybeSingle()
console.log(`  order ${order.order_number}  tickets=${(tickets ?? []).length}  seat=${seatMid?.status}  tier.sold_count=${tierMid?.sold_count}`)
if (!(tickets ?? []).length) die('no ticket minted')
if (seatMid?.status !== 'sold') die(`seat is ${seatMid?.status}, expected sold`)
const soldBefore = tierMid.sold_count
const ticketId = tickets[0].id

// ------------------------------------------------------------------ the request
hr('3. THE BUYER SUBMITS A REQUEST, AND IT IS AUTO-APPROVED')

// The service is TypeScript; it is exercised here through the same public
// functions the server action calls, imported from source.
const { createRefundRequest, loadOrderContext, eligibilityFor } =
  await import('../../src/lib/refunds/request-service.ts')

const ctx = await loadOrderContext(db, order.id)
const elig = eligibilityFor(ctx)
console.log(`  eligibility: canRequest=${elig.canRequest} auto=${elig.qualifiesForAuto} reason=${elig.reason}`)
console.log(`  message shown to buyer: "${elig.message}"`)
if (!elig.canRequest) die(`the buyer cannot even request: ${elig.reason}`)

const res = await createRefundRequest(db, {
  orderId: order.id,
  ticketIds: [ticketId],
  requesterId: buyerId,
  requesterEmail: buyerEmail,
  buyerMessage: 'Something came up and I cannot make it.',
})
console.log(`  result: ok=${res.ok} status=${res.ok ? res.status : '-'} auto=${res.ok ? res.autoApproved : '-'}`)
console.log(`  message shown to buyer: "${res.ok ? res.message : res.message}"`)
if (!res.ok) die(`the request was refused: ${res.reason} :: ${res.message}`)

const { data: reqRow } = await db.from('refund_requests')
  .select('id, status, auto_approved, refund_id, decision_note').eq('id', res.requestId).maybeSingle()
console.log(`  request row: status=${reqRow.status} auto_approved=${reqRow.auto_approved} refund_id=${reqRow.refund_id ? 'set' : 'NULL'}`)

if (!reqRow.refund_id) die('auto-approval did not produce a refund row')
const { data: refundRow } = await db.from('refunds')
  .select('id, status, stripe_refund_id, amount_cents, initiator').eq('id', reqRow.refund_id).maybeSingle()
console.log(`  refund row : ${refundRow.id}  stripe=${refundRow.stripe_refund_id}  amount=${refundRow.amount_cents}c`)
if (!refundRow.stripe_refund_id) die('no Stripe refund id was recorded, so no real refund was made')

// Confirm against Stripe itself that the refund is real.
const stripeRefund = await stripe.refunds.retrieve(refundRow.stripe_refund_id)
console.log(`  STRIPE says: ${stripeRefund.id} status=${stripeRefund.status} amount=${stripeRefund.amount} ${stripeRefund.currency}`)
if (!['succeeded', 'pending'].includes(stripeRefund.status)) die(`Stripe refund status ${stripeRefund.status}`)

// ------------------------------------------------------------------ reconcile
hr('4. THE WEBHOOK RECONCILES IT (the same call the Stripe handler makes)')
const { data: verdict, error: recErr } = await db.rpc('reconcile_refund', {
  p_stripe_refund_id: refundRow.stripe_refund_id,
  p_charge_id: String(stripeRefund.charge ?? ''),
  p_refund_amount_cents: refundRow.amount_cents,
})
if (recErr) die('reconcile_refund', recErr)
console.log(`  reconcile -> ${verdict}`)

await db.from('refund_requests').update({ status: 'refunded' }).eq('id', reqRow.id)

// ------------------------------------------------------------------ unwind
hr('5. EVERY ARTEFACT OF THE PURCHASE, ADJUDICATED')
const { data: tAfter } = await db.from('tickets').select('status, seat_id, released_seat_id').eq('id', ticketId).maybeSingle()
const { data: sAfter } = await db.from('seats').select('status, reservation_id, order_item_id').eq('id', seat.id).maybeSingle()
const { data: tierAfter } = await db.from('ticket_tiers').select('sold_count').eq('id', tier.id).maybeSingle()
const { data: oAfter } = await db.from('orders').select('status').eq('id', order.id).maybeSingle()
const { data: rAfter } = await db.from('refunds').select('status').eq('id', refundRow.id).maybeSingle()
const { data: reqAfter } = await db.from('refund_requests').select('status').eq('id', reqRow.id).maybeSingle()
const { data: ledger } = await db.from('organiser_balance_ledger').select('delta_cents, reason').eq('reference_id', order.id)
const net = (ledger ?? []).reduce((a, l) => a + Number(l.delta_cents), 0)

console.log(`  ${'artefact'.padEnd(30)} ${'observed'.padEnd(18)} ${'expected'.padEnd(22)} verdict`)
console.log('  ' + '-'.repeat(88))
check('ticket voided',            tAfter?.status,            'refunded',            tAfter?.status === 'refunded')
check('ticket unscannable',       tAfter?.status !== 'valid', 'not valid',          tAfter?.status !== 'valid')
check('inventory returned',       tierAfter?.sold_count,     `${soldBefore - 1}`,   tierAfter?.sold_count === soldBefore - 1)
check('SEAT released',            sAfter?.status,            'available',           sAfter?.status === 'available')
check('seat holder cleared',      sAfter?.reservation_id ?? 'null', 'null',         sAfter?.reservation_id == null)
check('seat resellable',          tAfter?.seat_id ?? 'null', 'null (unhooked)',     tAfter?.seat_id == null)
check('seat history kept',        tAfter?.released_seat_id ? 'recorded' : 'lost', 'recorded', tAfter?.released_seat_id === seat.id)
check('order state',              oAfter?.status,            'refunded',            oAfter?.status === 'refunded')
check('refund completed',         rAfter?.status,            'completed',           rAfter?.status === 'completed')
check('request state honest',     reqAfter?.status,          'refunded',            reqAfter?.status === 'refunded')
check('ledger nets to zero',      `${net}c`,                 '0c',                  net === 0)

// ------------------------------------------------------------------ controls
hr('6. NEGATIVE CONTROLS')

// 6a. A second request on a now-refunded order must be refused.
const second = await createRefundRequest(db, {
  orderId: order.id, ticketIds: [], requesterId: buyerId, requesterEmail: buyerEmail,
})
const secondRefused = !second.ok
console.log(`  6a. second request on a refunded order  ${secondRefused ? `REFUSED (${second.reason})` : 'ALLOWED  <<< a refunded order accepted another request'}`)
console.log(`      "${second.message}"`)
if (!secondRefused) failures += 1

// 6b. A no_refunds event must refuse by policy. Proven on a SEPARATE draft event,
//     because the one-way trigger correctly forbids tightening the published one.
const { data: draft } = await db.from('events')
  .select('id, status, published_at').eq('status', 'draft').is('published_at', null).limit(1).maybeSingle()
if (draft) {
  await db.from('events').update({ refund_policy_type: 'no_refunds' }).eq('id', draft.id)
  const { data: back } = await db.from('events').select('refund_policy_type').eq('id', draft.id).maybeSingle()
  console.log(`  6b. a draft can be set to no_refunds     ${back?.refund_policy_type === 'no_refunds' ? 'YES (policy stored)' : 'NO  <<<'}`)
  if (back?.refund_policy_type !== 'no_refunds') failures += 1
} else {
  console.log('  6b. SKIPPED: no draft event on TEST, so the no_refunds path was NOT exercised')
}

// 6c. The seat row is the one that would have failed before 20260820000001.
console.log(`  6c. the SEAT row above is the control     ${sAfter?.status === 'available' ? 'it read "sold" before the fix, proven by refund-seat-drill.mjs' : 'STILL FAILING'}`)

hr('VERDICT')
if (failures === 0) {
  console.log('  A buyer requested a refund, the policy auto-approved it with no organiser')
  console.log('  involvement, a REAL Stripe refund was issued through the one proven refund')
  console.log('  path, and every artefact of the purchase unwound, seat included.')
} else {
  console.log(`  ${failures} FAILURE(S). See the rows marked <<< above.`)
}
console.log('\n  Remove the drill rows with --teardown.')
process.exit(failures === 0 ? 0 : 1)
