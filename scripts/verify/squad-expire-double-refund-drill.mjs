/**
 * CAN THE SQUAD-EXPIRE CRON REFUND THE SAME MEMBER TWICE?
 *
 * I reported that it could, in the one-refund-path guard allowlist, on this
 * reasoning: `stripe.refunds.create` is called with no idempotency key, the cron
 * runs every five minutes, and members are selected on `payments.status =
 * 'completed'` which is only set to 'refunded' AFTER the Stripe call returns. A
 * failure in between therefore looked like it would leave the member selectable
 * and refundable again.
 *
 * THAT REASONING SKIPPED A STEP, and this script exists to settle it by driving
 * the thing rather than reading it. `expire_stale_squads()` (effective definition
 * in 20260412000001) is a single atomic CTE that flips squads from 'forming' to
 * 'expired' and RETURNS the rows it flipped. A squad is therefore returned
 * exactly once, so the second run has nothing to iterate and never reaches the
 * member at all.
 *
 * So the question is empirical: hit the route twice against one real fixture with
 * one real Stripe test charge, then ask STRIPE how many refunds exist against
 * that payment intent. One means the double refund is not reachable and my report
 * was wrong. Two means it is, and it gets fixed.
 *
 * THE DRILL ALSO FORCES THE INTERESTING FAILURE. Run with --simulate-crash and it
 * refunds through Stripe itself first, exactly as the route would, then leaves
 * `payments.status = 'completed'` and `squad_members.status = 'paid'` untouched,
 * which is the state the route would be in if it died between the Stripe call and
 * its status writes. Then it runs the cron. If the member is re-selectable, this
 * is where the second refund appears.
 *
 * TEST ONLY, guarded. Removable with --teardown.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/squad-expire-double-refund-drill.mjs --url http://localhost:3100
 *   node --env-file=.env.test scripts/verify/squad-expire-double-refund-drill.mjs --url http://localhost:3100 --simulate-crash
 *   node --env-file=.env.test scripts/verify/squad-expire-double-refund-drill.mjs --teardown
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const BASE = (arg('--url', 'http://localhost:3100')).replace(/\/+$/, '')
const TEARDOWN = argv.includes('--teardown')
const SIMULATE_CRASH = argv.includes('--simulate-crash')
const TOKEN_PREFIX = 'sqdrill-'
const ORDER_PREFIX = 'ELSQ-'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const key = process.env.STRIPE_SECRET_KEY || ''
if (!key.startsWith('sk_test_')) { console.error(`  REFUSED: STRIPE_SECRET_KEY is not a test key`); process.exit(1) }
const stripe = new Stripe(key)

const hr = t => { console.log('\n' + '='.repeat(90)); console.log('  ' + t); console.log('='.repeat(90)) }
const die = (m, e) => { console.error(`  FAILED: ${m}${e ? ` :: ${e.message ?? e}` : ''}`); process.exit(1) }

// ------------------------------------------------------------------ teardown
if (TEARDOWN) {
  const { data: sq } = await db.from('squads').select('id').like('share_token', `${TOKEN_PREFIX}%`)
  for (const s of sq ?? []) {
    await db.from('squad_members').delete().eq('squad_id', s.id)
    await db.from('squads').delete().eq('id', s.id)
  }
  const { data: orders } = await db.from('orders').select('id, reservation_id').like('order_number', `${ORDER_PREFIX}%`)
  for (const o of orders ?? []) {
    const { data: rf } = await db.from('refunds').select('id').eq('order_id', o.id)
    for (const r of rf ?? []) await db.from('refund_tickets').delete().eq('refund_id', r.id)
    await db.from('refunds').delete().eq('order_id', o.id)
    await db.from('organiser_balance_ledger').delete().eq('reference_id', o.id)
    await db.from('payments').delete().eq('order_id', o.id)
    await db.from('tickets').delete().eq('order_id', o.id)
    await db.from('order_items').delete().eq('order_id', o.id)
    await db.from('orders').delete().eq('id', o.id)
    if (o.reservation_id) await db.from('reservations').delete().eq('id', o.reservation_id)
  }
  console.log(`  removed ${(sq ?? []).length} drill squad(s) and ${(orders ?? []).length} order(s)`)
  process.exit(0)
}

const CRON_SECRET = process.env.CRON_SECRET
if (!CRON_SECRET) die('CRON_SECRET is not set, so the cron route cannot be driven')

// ------------------------------------------------------------------ fixture
hr('0. A SQUAD THAT HAS ALREADY EXPIRED, WITH ONE PAID MEMBER AND A REAL CHARGE')

const { data: candidates } = await db
  .from('ticket_tiers')
  .select('id, event_id, name, price, events!inner(id, title, organisation_id, status)')
  .eq('is_active', true).gt('price', 0).eq('events.status', 'published').limit(25)
const tier = (candidates ?? []).find(t => t.events?.organisation_id)
if (!tier) die('no active paid tier on a published event')
const event = tier.events

const stamp = Date.now().toString(36)
const email = `sq-drill-${stamp}@eventlinqs.test`
const { data: buyer, error: bErr } = await db.auth.admin.createUser({
  email, password: `${randomUUID()}Aa1`, email_confirm: true,
})
if (bErr) die('buyer', bErr)
const buyerId = buyer.user.id
await db.from('profiles').upsert({ id: buyerId, email, full_name: 'Squad Drill', display_name: 'Squad Drill' })

const face = tier.price
const intent = await stripe.paymentIntents.create({
  amount: face, currency: 'aud', payment_method: 'pm_card_visa', confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  metadata: { drill: 'squad-expire-double-refund', stamp },
})
if (intent.status !== 'succeeded') die(`payment intent ${intent.status}`)
console.log(`  charge       ${intent.id}  ${intent.amount}c  ${intent.status}`)

/*
 * THE ORDER MUST ACTUALLY CARRY TICKETS.
 *
 * The first version of this fixture inserted the order straight to 'confirmed'
 * and never minted any. The refund loop skips a member with no live tickets, so
 * the drill reported "0 refunds, no double refund" and passed while proving
 * nothing at all. That is precisely the shape this project has been caught by
 * twice: a fixture that cannot produce the behaviour reads identical to a
 * platform that prevents it. So the order is created 'pending' and put through
 * the real confirm_order, which mints the tickets through the issuance trigger.
 */
const { data: order, error: oErr } = await db.from('orders').insert({
  order_number: `${ORDER_PREFIX}${stamp.toUpperCase()}`, event_id: event.id,
  organisation_id: event.organisation_id, user_id: buyerId, status: 'pending',
  subtotal_cents: face, platform_fee_cents: 0, processing_fee_cents: 0,
  total_cents: face, currency: 'AUD',
}).select('id, order_number').single()
if (oErr) die('order', oErr)

const { error: oiErr } = await db.from('order_items').insert({
  order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket', item_name: tier.name,
  quantity: 1, unit_price_cents: face, total_cents: face,
})
if (oiErr) die('order_item', oiErr)

const { error: cErr } = await db.rpc('confirm_order', { p_order_id: order.id })
if (cErr) die('confirm_order', cErr)

const { data: minted } = await db.from('tickets').select('id, status').eq('order_id', order.id)
if (!(minted ?? []).length) die('no ticket was minted, so the refund loop would skip this member and the drill would prove nothing')
console.log(`  tickets      ${(minted ?? []).length} minted, status=${minted[0].status}`)

await db.from('payments').insert({
  order_id: order.id, gateway: 'stripe', gateway_payment_id: intent.id,
  status: 'completed', amount_cents: face, currency: 'AUD', idempotency_key: `sq-drill-${stamp}`,
})

// A squad that is still 'forming' but whose expiry has passed, so the cron picks it up.
const { data: squad, error: sqErr } = await db.from('squads').insert({
  event_id: event.id, leader_user_id: buyerId, ticket_tier_id: tier.id,
  total_spots: 2, status: 'forming', share_token: `${TOKEN_PREFIX}${stamp}`,
  expires_at: new Date(Date.now() - 3600_000).toISOString(),
}).select('id').single()
if (sqErr) die('squad', sqErr)

await db.from('squad_members').insert({
  squad_id: squad.id, user_id: buyerId, status: 'paid', order_id: order.id,
  position: 1, paid_at: new Date().toISOString(),
})
console.log(`  squad        ${squad.id}  status=forming, expired an hour ago`)
console.log(`  member       1 at 'paid' on order ${order.order_number}`)

async function refundCount() {
  const list = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 })
  return list.data.length
}
async function refundTotal() {
  const list = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 })
  return list.data.reduce((a, r) => a + (r.amount ?? 0), 0)
}

console.log(`  stripe refunds against this intent, before anything: ${await refundCount()}`)

// ------------------------------------------------------------------ crash sim
if (SIMULATE_CRASH) {
  hr('0b. FORCING THE INTERESTING FAILURE')
  /*
   * Exactly what the route does, and then nothing else: the Stripe refund lands
   * but the two status writes that follow it never happen. This is the state the
   * route is left in if the process dies, the function times out, or the database
   * write fails, in the window between the money moving and the record of it.
   */
  const forced = await stripe.refunds.create({
    payment_intent: intent.id,
    reason: 'requested_by_customer',
  })
  console.log(`  forced refund ${forced.id} ${forced.amount}c ${forced.status}`)
  console.log(`  payments.status left at 'completed', squad_members.status left at 'paid'`)
  console.log(`  stripe refunds now: ${await refundCount()}`)
}

// ------------------------------------------------------------------ run twice
hr('1. DRIVE THE CRON ROUTE TWICE OVER HTTP')
async function runCron(label) {
  const res = await fetch(`${BASE}/api/cron/squad-expire`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const body = await res.text()
  console.log(`  ${label.padEnd(8)} HTTP ${res.status}  ${body.slice(0, 200)}`)
  return { status: res.status, body }
}

const first = await runCron('run 1')
const afterFirst = await refundCount()
console.log(`  stripe refunds after run 1: ${afterFirst}`)

const second = await runCron('run 2')
const afterSecond = await refundCount()
console.log(`  stripe refunds after run 2: ${afterSecond}`)

// ------------------------------------------------------------------ verdict
hr('2. WHAT STRIPE SAYS')
const total = await refundTotal()
const count = await refundCount()
const { data: payAfter } = await db.from('payments').select('status').eq('order_id', order.id).maybeSingle()
const { data: ordAfter } = await db.from('orders').select('status').eq('id', order.id).maybeSingle()
const { data: memAfter } = await db.from('squad_members').select('status').eq('order_id', order.id).maybeSingle()
const { data: sqAfter } = await db.from('squads').select('status').eq('id', squad.id).maybeSingle()

console.log(`  charge amount        ${face}c`)
console.log(`  refunds on Stripe    ${count}`)
console.log(`  refunded total       ${total}c`)
console.log(`  payments.status      ${payAfter?.status}`)
console.log(`  orders.status        ${ordAfter?.status}`)
console.log(`  squad_members.status ${memAfter?.status}`)
console.log(`  squads.status        ${sqAfter?.status}`)

hr('3. VERDICT')
let failures = 0
if (total > face) {
  console.log(`  DOUBLE REFUND REPRODUCED. ${total}c was returned against a ${face}c charge.`)
  console.log('  Real money left the platform balance twice.')
  failures += 1
} else if (count > 1) {
  console.log(`  ${count} refund objects exist but they sum to ${total}c, not more than the ${face}c charge.`)
  console.log('  Stripe refused to over-refund, so no money left twice, but the platform ASKED it to.')
  failures += 1
} else {
  console.log(`  NO DOUBLE REFUND. Exactly ${count} refund of ${total}c against a ${face}c charge.`)
}
console.log('')
console.log('  Remove the drill rows with --teardown.')
process.exit(failures === 0 ? 0 : 1)
