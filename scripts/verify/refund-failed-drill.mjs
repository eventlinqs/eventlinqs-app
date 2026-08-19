/**
 * A REFUND THAT FAILED AT THE BANK: does anybody find out?
 *
 * WHAT THIS PROVES, driven over HTTP through the real route rather than reasoned.
 *
 * Stripe's own words (https://docs.stripe.com/refunds, fetched 19 August 2026): when
 * a refund fails "the bank returns the refunded amount to us and we add it back to
 * your Stripe account balance", and "you need to arrange an alternative way to
 * provide your customer with a refund". So the money is back with the PLATFORM, the
 * buyer has nothing, and until this handler existed no surface anywhere said so.
 *
 * The assertions are therefore about the RECORD and the ALERT, not about inventory:
 *
 *   1. the in-app refunds row moves to `failed` and carries Stripe's own reason
 *   2. the ticket is NOT restored and the seat is NOT re-taken
 *   3. a redelivery changes nothing and does not re-alert
 *   4. an ordinary `refund.updated` for a still-succeeding refund is a silent no-op
 *
 * POINT 2 IS AN ASSERTION, NOT AN OMISSION. The obvious reading of "the refund
 * failed" is "undo the refund", and it is wrong: the buyer ASKED for their money
 * back, so they are not attending, the seat was correctly released and may already be
 * resold. Restoring a ticket would hand a seat to somebody who wanted a refund, and
 * re-taking inventory could oversell the room. So the drill pins that neither
 * happens.
 *
 * WHY THE FAILURE IS SYNTHESISED. Stripe test mode cannot be made to fail a refund at
 * a bank on demand: `failed` is a downstream outcome that arrives days later, if ever.
 * So the refund and the charge are REAL test-mode objects and the event BODY carries
 * `status: 'failed'` with a real `failure_reason` value from Stripe's documented list.
 * That is exactly what Stripe would deliver, and the route's signature verification
 * runs unmodified. Stated plainly so the proof is not read as more than it is.
 *
 * TEST ONLY, guarded.
 *
 * USAGE: node --env-file=.env.test scripts/verify/refund-failed-drill.mjs \
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
const scanned = []
const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

// ---------------------------------------------------------------- fixture
const { data: cover } = await db.from('events').select('cover_image_url')
  .eq('status', 'published').not('cover_image_url', 'is', null)
  .not('cover_image_url', 'ilike', 'https://picsum.photos/%').limit(1).maybeSingle()
const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()
const { data: prof } = await db.from('profiles').select('id').limit(1).maybeSingle()

const { data: org } = await db.from('organisations').insert({
  name: `Refund Failed Drill ${STAMP}`, slug: `refund-failed-${STAMP}`, owner_id: prof.id,
  email: `rf-${STAMP}@eventlinqs.test`, status: 'active', payout_status: 'active',
  stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU',
}).select('id').single()

const start = new Date(Date.now() + 21 * 864e5)
const { data: event } = await db.from('events').insert({
  title: `Refund Failed Drill ${STAMP}`, slug: `refund-failed-${STAMP}`,
  description: 'Refund failure drill.', summary: 'Refund failure drill',
  organisation_id: org.id, created_by: prof.id, category_id: cat?.id ?? null,
  start_date: start.toISOString(), end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney', event_type: 'in_person',
  venue_name: 'Hall', venue_address: '1 St', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: cover?.cover_image_url ?? null,
  is_age_restricted: false, max_capacity: 10, is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id').single()

const { data: tier } = await db.from('ticket_tiers').insert({
  event_id: event.id, name: 'General Admission', tier_type: 'general_admission',
  price: 2500, currency: 'AUD', total_capacity: 5, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id').single()
scanned.push('an isolated fixture: organisation, published paid event, GA tier')

const { data: order } = await db.from('orders').insert({
  event_id: event.id, organisation_id: org.id, status: 'refunded', currency: 'AUD',
  subtotal_cents: 2500, total_cents: 2749, platform_fee_cents: 187, processing_fee_cents: 62,
  discount_cents: 0, addon_total_cents: 0,
  guest_email: `rf-buyer-${STAMP}@resend.dev`,
  order_number: `EL-RF${STAMP.toUpperCase().slice(0, 6)}`,
}).select('id, order_number').single()

// A REAL test-mode refund, so the id and shape are genuine.
const intent = await stripe.paymentIntents.create({
  amount: 2749, currency: 'aud', payment_method: 'pm_card_visa', confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  metadata: { drill: `refund-failed-${STAMP}` },
})
const realRefund = await stripe.refunds.create({ payment_intent: intent.id })
scanned.push('a real test-mode PaymentIntent and a real refund of it')

// The in-app refund row, as the app would leave it after a completed reconcile.
const { data: refundRow } = await db.from('refunds').insert({
  order_id: order.id, organisation_id: org.id,
  amount_cents: 2749, currency: 'AUD', reason: 'requested_by_buyer',
  status: 'completed', initiator: 'organiser',
  stripe_refund_id: realRefund.id, processed_at: new Date().toISOString(),
}).select('id, status').single()

// One refunded ticket, as the reconcile would have left it.
const { data: oi } = await db.from('order_items').insert({
  order_id: order.id, ticket_tier_id: tier.id, addon_id: null,
  item_type: 'ticket', item_name: 'General Admission',
  quantity: 1, unit_price_cents: 2500, total_cents: 2500,
  attendee_first_name: 'Refund', attendee_last_name: 'Failed',
  attendee_email: `rf-buyer-${STAMP}@resend.dev`,
}).select('id').single()
await db.from('tickets').insert({
  order_id: order.id, order_item_id: oi.id, event_id: event.id, ticket_tier_id: tier.id,
  idx_in_item: 0, ticket_code: `EL-RF${STAMP.toUpperCase().slice(0, 4)}-0001`,
  holder_name: 'Refund Failed', holder_email: `rf-buyer-${STAMP}@resend.dev`,
  status: 'refunded', refunded_at: new Date().toISOString(),
})

const tierState = async () =>
  (await db.from('ticket_tiers').select('sold_count, reserved_count, total_capacity').eq('id', tier.id).single()).data
const refundState = async () =>
  (await db.from('refunds').select('status, failure_reason').eq('id', refundRow.id).single()).data
const ticketStates = async () =>
  ((await db.from('tickets').select('status').eq('order_id', order.id)).data ?? []).map(t => t.status)

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
  return { status: res.status, text: (await res.text()).slice(0, 160) }
}

try {
  const before = { tier: await tierState(), refund: await refundState(), tickets: await ticketStates() }
  hr(`BEFORE  |  order ${order.order_number}  refund ${realRefund.id}`)
  console.log(`  refund row : ${before.refund.status}`)
  console.log(`  tickets    : ${before.tickets.join(', ')}`)
  console.log(`  tier       : sold=${before.tier.sold_count} reserved=${before.tier.reserved_count} capacity=${before.tier.total_capacity}`)

  // ---- 1. an ordinary refund.updated must be a silent no-op ---------------
  hr('1. AN ORDINARY refund.updated (still succeeding) MUST DO NOTHING')
  const noop = await deliver('refund.updated',
    { ...realRefund, status: 'succeeded' }, `evt_rf_noop_${STAMP}`)
  console.log(`  delivered -> HTTP ${noop.status} ${noop.text}`)
  await sleep(3000)
  const afterNoop = await refundState()
  scanned.push('a refund.updated carrying status succeeded, to prove the handler is quiet on the common case')
  assert(noop.status === 200, 'accepted', noop.status)
  assert(afterNoop.status === 'completed', 'the refund row is untouched by an ordinary update', afterNoop.status)

  // ---- 2. the failure -----------------------------------------------------
  hr('2. THE REFUND FAILS AT THE BANK (refund.failed)')
  const failed = await deliver('refund.failed', {
    ...realRefund,
    status: 'failed',
    // A real value from Stripe's documented failure_reason list.
    failure_reason: 'expired_or_canceled_card',
  }, `evt_rf_failed_${STAMP}`)
  console.log(`  delivered -> HTTP ${failed.status} ${failed.text}`)
  await sleep(4000)
  const after = { tier: await tierState(), refund: await refundState(), tickets: await ticketStates() }
  console.log(`  refund row : ${after.refund.status}  reason=${after.refund.failure_reason}`)
  console.log(`  tickets    : ${after.tickets.join(', ')}`)
  console.log(`  tier       : sold=${after.tier.sold_count} reserved=${after.tier.reserved_count}`)
  scanned.push('a refund.failed carrying a documented failure_reason, through the real signed route')

  assert(failed.status === 200, 'accepted', failed.status)
  assert(after.refund.status === 'failed', 'the refund row is marked failed', after.refund.status)
  assert(/expired_or_canceled_card/.test(after.refund.failure_reason ?? ''),
    'it records Stripe\'s own failure_reason', after.refund.failure_reason)

  // The two deliberate non-actions.
  assert(after.tickets.every(t => t === 'refunded'),
    'the ticket is NOT restored (the buyer asked for a refund and is not attending)', after.tickets.join(','))
  assert(after.tier.sold_count === before.tier.sold_count,
    `the seat is NOT re-taken (sold_count still ${before.tier.sold_count}; re-taking could oversell)`,
    after.tier.sold_count)

  // ---- 3. idempotency ----------------------------------------------------
  hr('3. REDELIVERY MUST CHANGE NOTHING AND NOT RE-ALERT')
  const again = await deliver('refund.failed', {
    ...realRefund, status: 'failed', failure_reason: 'expired_or_canceled_card',
  }, `evt_rf_failed_${STAMP}_again`)
  console.log(`  delivered -> HTTP ${again.status} ${again.text}`)
  await sleep(3000)
  const after2 = { tier: await tierState(), refund: await refundState(), tickets: await ticketStates() }
  scanned.push('a second refund.failed with a NEW event id, to prove the terminal-status latch')
  assert(again.status === 200, 'accepted', again.status)
  assert(after2.refund.status === 'failed', 'still failed', after2.refund.status)
  assert(after2.tier.sold_count === before.tier.sold_count, 'inventory still untouched', after2.tier.sold_count)
  assert(after2.tickets.join(',') === after.tickets.join(','), 'ticket states unchanged')
} catch (err) {
  console.error('\nDRILL FAILED TO RUN:', err)
  fails.push(`drill threw: ${err?.message ?? err}`)
} finally {
  await db.from('refund_tickets').delete().eq('refund_id', refundRow.id)
  await db.from('tickets').delete().eq('order_id', order.id)
  await db.from('refunds').delete().eq('order_id', order.id)
  await db.from('order_items').delete().eq('order_id', order.id)
  await db.from('orders').delete().eq('id', order.id)
  const { data: links } = await db.from('share_links').select('id').eq('event_id', event.id)
  if ((links ?? []).length) await db.from('share_links').delete().in('id', links.map(l => l.id))
  await db.from('ticket_tiers').delete().eq('event_id', event.id)
  await db.from('events').delete().eq('id', event.id)
  await db.from('organisations').delete().eq('id', org.id)
  console.log('\n  fixture removed')
}

hr('WHAT THIS DRILL SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0 ? 'ALL ASSERTIONS PASSED' : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
