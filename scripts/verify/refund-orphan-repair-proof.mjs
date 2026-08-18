/**
 * PROVE THE ORPHAN-REFUND FIX against the real database, by REPAIRING the exact
 * leak the drill created.
 *
 * WHAT IT DOES. scripts/verify/refund-orphan-inventory-drill.mjs creates a real
 * test-mode Stripe refund outside the application and demonstrates that the old
 * handler left the seat sold (sold_count stuck at 1, order stuck at `confirmed`).
 * This script re-delivers that SAME charge.refunded event to a server running the
 * FIXED handler, and asserts the seat comes back and the order status corrects.
 *
 * WHY DELIVERY IS SIGNED LOCALLY RATHER THAN BY STRIPE. Stripe's own delivery for
 * these test charges goes to the enabled staging endpoint, which runs the deployed
 * (unfixed) code, and there is no endpoint pointing at a laptop. Stripe's delivery
 * path is proven separately and independently by refund-dashboard-e2e.mjs, which
 * waits on Stripe's real charge.refunded arriving at staging and reconciling. What
 * is unproven here is the new HANDLER, so the handler is what this exercises: the
 * charge is a real Stripe charge, the refund is a real Stripe refund, the reconcile
 * is the real RPC and the database is the real TEST database. Only the HTTP hop is
 * locally signed, using Stripe's own generateTestHeaderString, so the route's
 * signature verification runs unmodified rather than being bypassed.
 *
 * TEST ONLY, guarded. Reads Stripe, writes nothing to Stripe.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-orphan-repair-proof.mjs \
 *     --order <orderId> [--url http://localhost:3000] [--secret <whsec>]
 *
 * The order id is the one printed by the drill (also in
 * docs/verification/refund-dashboard-2026-08-18/refund-orphan-drill.json).
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }

const ORDER_ID = arg('--order')
const URL_BASE = (arg('--url', 'http://localhost:3000')).replace(/\/+$/, '')
const SECRET = arg('--secret') ?? process.env.STRIPE_WEBHOOK_SECRET
if (!ORDER_ID) { console.error('usage: --order <orderId> [--url <base>] [--secret <whsec>]'); process.exit(2) }
if (!SECRET) { console.error('a webhook signing secret is required (--secret or STRIPE_WEBHOOK_SECRET)'); process.exit(2) }

const SK = process.env.STRIPE_SECRET_KEY
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SK?.startsWith('sk_test_')) { console.error('REFUSING: requires a TEST-mode Stripe key'); process.exit(2) }
const stripe = new Stripe(SK, { apiVersion: STRIPE_API_VERSION })
const db = createClient(SB, SVC, { auth: { persistSession: false } })

const fails = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (got ${JSON.stringify(detail)})` : ''}`); fails.push(msg) }
}

// ---- State before -----------------------------------------------------------
const { data: order } = await db.from('orders')
  .select('id, order_number, status, event_id, total_cents, currency').eq('id', ORDER_ID).maybeSingle()
if (!order) { console.error(`order ${ORDER_ID} not found`); process.exit(2) }
const { data: payment } = await db.from('payments')
  .select('gateway_payment_id').eq('order_id', ORDER_ID)
  .order('created_at', { ascending: false }).limit(1).maybeSingle()
const { data: ticketsBefore } = await db.from('tickets')
  .select('id, ticket_code, status, ticket_tier_id').eq('order_id', ORDER_ID).order('ticket_code')
const tierId = ticketsBefore?.[0]?.ticket_tier_id
const tierBefore = (await db.from('ticket_tiers').select('sold_count, total_capacity').eq('id', tierId).single()).data
const refundsBefore = (await db.from('refunds').select('id, status, stripe_refund_id').eq('order_id', ORDER_ID)).data ?? []
scanned.push('orders, payments, tickets, ticket_tiers and refunds state before delivery')

hr(`STATE BEFORE  |  order ${order.order_number}`)
console.log(`  order status        ${order.status}`)
console.log(`  tickets             ${ticketsBefore.map(t => `${t.ticket_code}=${t.status}`).join('  ')}`)
console.log(`  tier sold_count     ${tierBefore.sold_count} of ${tierBefore.total_capacity}`)
console.log(`  in-app refund rows  ${refundsBefore.length}`)

// ---- The real Stripe objects ------------------------------------------------
const intent = await stripe.paymentIntents.retrieve(payment.gateway_payment_id, { expand: ['latest_charge'] })
const charge = intent.latest_charge
scanned.push('the real Stripe charge and its refunds (GET, no writes)')
const stripeRefunds = []
for await (const r of stripe.refunds.list({ charge: charge.id, limit: 100 })) stripeRefunds.push(r)
console.log(`  stripe charge       ${charge.id}  amount_refunded=${charge.amount_refunded}c`)
console.log(`  stripe refunds      ${stripeRefunds.map(r => `${r.id}(${r.amount}c,${r.status})`).join('  ') || 'none'}`)
if (stripeRefunds.length === 0) { console.error('this charge has no Stripe refund; run the drill first'); process.exit(2) }

// ---- Deliver charge.refunded, signed with Stripe's own helper ---------------
hr('DELIVERING charge.refunded TO THE FIXED HANDLER')
const event = {
  id: `evt_local_${Date.now()}`,
  object: 'event',
  api_version: STRIPE_API_VERSION,
  created: Math.floor(Date.now() / 1000),
  type: 'charge.refunded',
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  // The charge exactly as Stripe returned it. `refunds` is deliberately left as
  // Stripe sends it on modern API versions (not embedded), so the handler's own
  // refunds.list fallback runs, which is the path production takes.
  data: { object: charge },
}
const payload = JSON.stringify(event)
const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
scanned.push('a charge.refunded delivery signed with stripe.webhooks.generateTestHeaderString')

const res = await fetch(`${URL_BASE}/api/webhooks/stripe`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': header },
  body: payload,
})
const bodyText = await res.text()
console.log(`  POST ${URL_BASE}/api/webhooks/stripe -> HTTP ${res.status}  ${bodyText.slice(0, 200)}`)
assert(res.ok, 'the handler accepted the signed delivery (signature verified)', res.status)

// ---- State after ------------------------------------------------------------
await sleep(4000)
const orderAfter = (await db.from('orders').select('status').eq('id', ORDER_ID).single()).data
const ticketsAfter = (await db.from('tickets').select('ticket_code, status').eq('order_id', ORDER_ID).order('ticket_code')).data
const tierAfter = (await db.from('ticket_tiers').select('sold_count, total_capacity').eq('id', tierId).single()).data
const refundsAfter = (await db.from('refunds').select('id, status, amount_cents, initiator, reason, stripe_refund_id').eq('order_id', ORDER_ID)).data ?? []
scanned.push('the same five tables after delivery, to compare')

hr('STATE AFTER')
console.log(`  order status        ${order.status} -> ${orderAfter.status}`)
console.log(`  tickets             ${ticketsAfter.map(t => `${t.ticket_code}=${t.status}`).join('  ')}`)
console.log(`  tier sold_count     ${tierBefore.sold_count} -> ${tierAfter.sold_count} of ${tierAfter.total_capacity}`)
console.log(`  in-app refund rows  ${refundsBefore.length} -> ${refundsAfter.length}`)
for (const r of refundsAfter) {
  console.log(`      ${r.status}  ${r.amount_cents}c  initiator=${r.initiator}  reason=${r.reason}  stripe=${r.stripe_refund_id}`)
}

const refundedTotal = stripeRefunds.reduce((s, r) => s + r.amount, 0)
const fullyRefunded = refundedTotal >= Number(order.total_cents)

/*
 * TWO SCENARIOS, JUDGED DIFFERENTLY, because the same delivery must do opposite
 * things depending on what it finds, and one assertion set cannot express both.
 *
 *   repair    the order has NO in-app refund rows: a genuine orphan. The handler
 *             must adopt it, restore the seats and correct the order status.
 *   no-change the order's refunds were created IN the app and already reconciled.
 *             The handler must do NOTHING: no extra row, no second seat returned.
 *             This is the regression guard on the adoption change, and it is the
 *             failure that would matter most, because a double-restore oversells.
 *
 * The scenario is DETECTED from the state rather than asserted by the caller, so
 * pointing this script at the wrong kind of order cannot produce a false pass.
 * `--expect` may pin it when the caller wants the run to fail on a surprise.
 */
const scenario = refundsBefore.length === 0 ? 'repair' : 'no-change'
const expected = arg('--expect')
hr(`ASSERTIONS  |  scenario detected: ${scenario}${expected ? `  (expected ${expected})` : ''}`)
if (expected && expected !== scenario) {
  console.log(`  FAIL: expected the ${expected} scenario but the state says ${scenario}`)
  fails.push(`scenario mismatch: expected ${expected}, detected ${scenario}`)
}

if (scenario === 'repair') {
  assert(refundsAfter.length > refundsBefore.length, 'the out-of-app refund was adopted into an in-app refunds row')
  assert(refundsAfter.some(r => r.status === 'completed'), 'the adopted refund reconciled to completed', refundsAfter.map(r => r.status))
  assert(refundsAfter.some(r => r.initiator === 'system'), 'the adopted refund is recorded as system-initiated (not falsely attributed to an organiser)')
  assert(tierAfter.sold_count === tierBefore.sold_count - ticketsBefore.length,
    `INVENTORY RESTORED: sold_count ${tierBefore.sold_count} -> ${tierAfter.sold_count} (${ticketsBefore.length} seat(s) returned)`,
    tierAfter.sold_count)
  if (fullyRefunded) {
    assert(orderAfter.status === 'refunded', 'the order status corrected to refunded (it was stuck on confirmed)', orderAfter.status)
  }
} else {
  console.log('  These refunds were created in the app and are already reconciled, so the')
  console.log('  correct behaviour is to change nothing at all.')
  assert(refundsAfter.length === refundsBefore.length,
    `NO duplicate refunds row created for an already-reconciled in-app refund (still ${refundsBefore.length})`,
    refundsAfter.length)
  assert(tierAfter.sold_count === tierBefore.sold_count,
    `NO double-restore of inventory: sold_count unchanged at ${tierBefore.sold_count}`, tierAfter.sold_count)
  assert(orderAfter.status === order.status, `order status unchanged (${order.status})`, orderAfter.status)
  assert(ticketsAfter.every((t, i) => t.status === ticketsBefore[i].status), 'ticket statuses unchanged')
  assert(refundsAfter.every(r => r.initiator === 'organiser' || r.initiator === 'admin'),
    'the existing refunds keep their real initiator (adoption did not overwrite attribution)',
    refundsAfter.map(r => r.initiator))
}

// ---- Idempotency: a redelivery must change nothing --------------------------
hr('IDEMPOTENCY: redelivering the same event')
const res2 = await fetch(`${URL_BASE}/api/webhooks/stripe`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
  body: payload,
})
console.log(`  redelivery -> HTTP ${res2.status}`)
await sleep(4000)
const tierAfter2 = (await db.from('ticket_tiers').select('sold_count').eq('id', tierId).single()).data
const refundsAfter2 = (await db.from('refunds').select('id').eq('order_id', ORDER_ID)).data ?? []
scanned.push('a second identical delivery, to prove no double-restore and no duplicate refund row')
assert(res2.ok, 'the redelivery was accepted', res2.status)
assert(tierAfter2.sold_count === tierAfter.sold_count,
  `no double-restore on redelivery: sold_count still ${tierAfter.sold_count}`, tierAfter2.sold_count)
assert(refundsAfter2.length === refundsAfter.length,
  'no duplicate refunds row on redelivery (uq_refunds_stripe_refund holds)', refundsAfter2.length)

hr('WHAT THIS PROOF SCANNED')
;[...new Set(scanned)].forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0 ? 'ALL ASSERTIONS PASSED: an out-of-app refund now returns the seat.' : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
