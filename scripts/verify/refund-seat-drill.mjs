/**
 * A SEATED REFUND, DRIVEN END TO END, AND WHAT IT LEAVES BEHIND.
 *
 * THE CLAIM UNDER TEST: when a seated ticket is refunded, the seat must return to
 * the map so it can be resold. `reconcile_refund` is the single place a completed
 * refund is applied, and it touches tickets, ticket_tiers.sold_count, the ledger,
 * payout_holds, the order status and the refund status. It does NOT touch
 * `public.seats`. So the seat stays 'sold' with its ticket voided: dead for the
 * event, invisible on every dashboard, and only discovered at the door.
 *
 * THIS DRILL IS THE NEGATIVE CONTROL FOR ITS OWN FIX. It drives a real seated
 * purchase through the real functions (confirm_order mints the tickets,
 * assign_order_seats pairs them to seats, the seat is marked sold exactly as the
 * Stripe webhook marks it), then refunds through the real path
 * (create_refund_request then reconcile_refund) and reads the seat back.
 *
 * Run it BEFORE the fix and it must report LEAK. Run it AFTER and it must report
 * RELEASED. A drill that cannot produce the failure proves nothing about the fix,
 * and this project has been caught by that twice.
 *
 * NO STRIPE CALL. The money leg is not what is under test: reconcile_refund is
 * driven directly with a synthetic refund id, which is exactly what the webhook
 * passes it. The Stripe leg is proven separately and was already proven.
 *
 * TEST ONLY, guarded. Every row it creates is tagged and removable with --teardown.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-seat-drill.mjs
 *   node --env-file=.env.test scripts/verify/refund-seat-drill.mjs --teardown
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const TEARDOWN = argv.includes('--teardown')
const TAG = 'refund-seat-drill'
const ROW_LABEL = 'ZZDRILL'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const hr = t => { console.log('\n' + '='.repeat(88)); console.log('  ' + t); console.log('='.repeat(88)) }
const die = (m, e) => { console.error(`  FAILED: ${m}${e ? ` :: ${e.message ?? e}` : ''}`); process.exit(1) }

// ------------------------------------------------------------------ teardown
if (TEARDOWN) {
  const { data: seats } = await db.from('seats').select('id').eq('row_label', ROW_LABEL)
  const seatIds = (seats ?? []).map(s => s.id)
  const { data: orders } = await db.from('orders').select('id').like('order_number', 'ELDRILL-%')
  const orderIds = (orders ?? []).map(o => o.id)

  for (const oid of orderIds) {
    const { data: rf } = await db.from('refunds').select('id').eq('order_id', oid)
    for (const r of rf ?? []) await db.from('refund_tickets').delete().eq('refund_id', r.id)
    await db.from('refunds').delete().eq('order_id', oid)
    await db.from('organiser_balance_ledger').delete().eq('reference_id', oid)
    await db.from('payments').delete().eq('order_id', oid)
    await db.from('tickets').delete().eq('order_id', oid)
    await db.from('order_items').delete().eq('order_id', oid)
  }
  for (const oid of orderIds) await db.from('squad_members').delete().eq('order_id', oid)
  const { data: dsq } = await db.from('squads').select('id').like('share_token', 'seatdrill-%')
  for (const sq of dsq ?? []) { await db.from('squad_members').delete().eq('squad_id', sq.id); await db.from('squads').delete().eq('id', sq.id) }
  if (seatIds.length) await db.from('seats').delete().in('id', seatIds)
  for (const oid of orderIds) {
    const { data: o } = await db.from('orders').select('reservation_id').eq('id', oid).maybeSingle()
    await db.from('orders').delete().eq('id', oid)
    if (o?.reservation_id) await db.from('reservations').delete().eq('id', o.reservation_id)
  }
  console.log(`  removed ${orderIds.length} drill order(s) and ${seatIds.length} drill seat(s)`)
  process.exit(0)
}

// ------------------------------------------------------------------ fixture
hr('0. FIXTURE: a real published event, with two drill seats added to it')

/*
 * The tier must belong to a PUBLISHED event whose organisation still exists. The
 * first attempt at this took the first active paid tier on the project and got an
 * orphan whose event row was gone, which is worth keeping as a comment: TEST
 * carries residue from every drill anybody has ever run, so a fixture picked by
 * "the first row" is a fixture picked at random.
 */
const { data: candidates, error: tierErr } = await db
  .from('ticket_tiers')
  .select('id, event_id, name, price, total_capacity, sold_count, is_active, events!inner(id, title, organisation_id, status)')
  .eq('is_active', true)
  .gt('price', 0)
  .eq('events.status', 'published')
  .limit(25)
if (tierErr) die('tier lookup failed', tierErr)
if (!candidates?.length) die('no active paid tier on a published event exists on TEST to drive')

const tier = candidates.find(t => t.events?.organisation_id)
if (!tier) die('no candidate tier has an organisation')
const event = tier.events

console.log(`  event  ${event.id}  ${event.title}`)
console.log(`  tier   ${tier.id}  ${tier.name}  price=${tier.price}c  sold_count=${tier.sold_count}`)

const stamp = Date.now().toString(36)
const buyerEmail = `seat-drill-${stamp}@eventlinqs.test`
const { data: buyer, error: buyerErr } = await db.auth.admin.createUser({
  email: buyerEmail, password: `${randomUUID()}Aa1`, email_confirm: true,
})
if (buyerErr) die('could not create buyer', buyerErr)
const buyerId = buyer.user.id
await db.from('profiles').upsert({ id: buyerId, email: buyerEmail, full_name: 'Seat Drill', display_name: 'Seat Drill' })

// ONE seat, on the real event, tied to the real tier.
const { data: seat, error: seatErr } = await db
  .from('seats')
  .insert({
    event_id: event.id, ticket_tier_id: tier.id, row_label: ROW_LABEL, seat_number: `${stamp}`,
    seat_type: 'standard', status: 'available', price_cents: tier.price, metadata: { tag: TAG },
  })
  .select('id, row_label, seat_number, status')
  .single()
if (seatErr) die('could not create drill seat', seatErr)
console.log(`  seat   ${seat.id}  ${seat.row_label}${seat.seat_number}  status=${seat.status}`)

// ------------------------------------------------------------------ purchase
hr('1. PURCHASE: reservation, order, confirm_order, assign_order_seats, seat sold')

const expires = new Date(Date.now() + 30 * 60_000).toISOString()
const { data: reservation, error: resErr } = await db
  .from('reservations')
  .insert({
    event_id: event.id, user_id: buyerId, status: 'active',
    items: [{ ticket_tier_id: tier.id, quantity: 1 }], expires_at: expires,
  })
  .select('id')
  .single()
if (resErr) die('reservation failed', resErr)

// The seat is held by that reservation, exactly as the seat checkout holds it.
await db.from('seats').update({ status: 'reserved', reservation_id: reservation.id }).eq('id', seat.id)
await db.from('ticket_tiers').update({ reserved_count: 1 }).eq('id', tier.id)

const orderNumber = `ELDRILL-${stamp.toUpperCase()}`
const face = tier.price
const { data: order, error: orderErr } = await db
  .from('orders')
  .insert({
    order_number: orderNumber, event_id: event.id, organisation_id: event.organisation_id,
    user_id: buyerId, reservation_id: reservation.id, status: 'pending',
    subtotal_cents: face, platform_fee_cents: 0, processing_fee_cents: 0,
    total_cents: face, currency: 'AUD',
  })
  .select('id, order_number, status, total_cents')
  .single()
if (orderErr) die('order failed', orderErr)

const { data: orderItem, error: oiErr } = await db
  .from('order_items')
  .insert({
    order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket', item_name: tier.name,
    quantity: 1, unit_price_cents: face, total_cents: face,
  })
  .select('id')
  .single()
if (oiErr) die('order_item failed', oiErr)

const { error: confirmErr } = await db.rpc('confirm_order', { p_order_id: order.id })
if (confirmErr) die('confirm_order failed', confirmErr)

const { data: assigned, error: assignErr } = await db.rpc('assign_order_seats', { p_order_id: order.id })
if (assignErr) die('assign_order_seats failed', assignErr)

// The webhook marks the held seats sold at this point (route.ts ~line 392).
await db.from('seats').update({ status: 'sold' }).eq('id', seat.id).eq('status', 'reserved')

const { data: tickets } = await db.from('tickets').select('id, status, seat_id').eq('order_id', order.id)
const { data: seatAfterBuy } = await db.from('seats').select('id, status').eq('id', seat.id).maybeSingle()
const { data: tierAfterBuy } = await db.from('ticket_tiers').select('sold_count').eq('id', tier.id).maybeSingle()

console.log(`  order        ${order.order_number}  status now confirmed`)
console.log(`  seats paired ${assigned}`)
console.log(`  tickets      ${(tickets ?? []).length} minted, status=${(tickets ?? [])[0]?.status}, seat_id=${(tickets ?? [])[0]?.seat_id ? 'set' : 'NULL'}`)
console.log(`  seat         status=${seatAfterBuy?.status}`)
console.log(`  tier         sold_count=${tierAfterBuy?.sold_count}`)

if (!(tickets ?? []).length) die('no ticket was minted, the drill cannot test a refund')
if (!(tickets ?? [])[0].seat_id) die('the ticket carries no seat, the drill would prove nothing about seats')
if (seatAfterBuy?.status !== 'sold') die(`seat did not reach sold (it is ${seatAfterBuy?.status})`)

const ticketId = tickets[0].id

/*
 * A SQUAD SLOT ON THE SAME ORDER. Squad completion counts squad_members at
 * 'paid', and nothing on the refund path used to move them, so a refunded
 * member kept filling a slot and a squad could complete one ticket short of
 * what its own count claimed. Migration 20260820000003 moves them to
 * 'refunded' inside reconcile_refund, so every trigger gets it.
 */
const { data: squad, error: sqErr } = await db.from('squads').insert({
  event_id: event.id, leader_user_id: buyerId, ticket_tier_id: tier.id,
  total_spots: 2, status: 'forming', share_token: `seatdrill-${stamp}`,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
}).select('id').single()
if (sqErr) die('squad', sqErr)
const { error: smErr } = await db.from('squad_members').insert({
  squad_id: squad.id, user_id: buyerId, status: 'paid', order_id: order.id,
  position: 1, paid_at: new Date().toISOString(),
})
if (smErr) die('squad member', smErr)
console.log(`  squad        ${squad.id} with 1 member at 'paid' on this order`)
const soldBefore = tierAfterBuy?.sold_count ?? 0

// ------------------------------------------------------------------ refund
hr('2. REFUND: create_refund_request then reconcile_refund, the real path')

/*
 * A payment intent is required by create_refund_request, and it reads it from
 * public.payments.gateway_payment_id, NOT from a column on orders. The first
 * version of this drill set `orders.stripe_payment_intent_id` and got
 * "no payment intent for order", because that column does not exist: the order
 * carries no intent, the payment row does.
 */
const { error: payErr } = await db.from('payments').insert({
  order_id: order.id,
  gateway: 'stripe',
  gateway_payment_id: `pi_drill_${stamp}`,
  status: 'completed',
  amount_cents: face,
  currency: 'AUD',
  idempotency_key: `drill-${stamp}`,
})
if (payErr) die('payments row failed', payErr)

const { data: org } = await db.from('organisations').select('owner_id').eq('id', event.organisation_id).maybeSingle()
const actorId = org?.owner_id
if (!actorId) die('organisation has no owner to act as the refunding organiser')

const { data: reqRow, error: reqErr } = await db.rpc('create_refund_request', {
  p_order_id: order.id,
  p_ticket_ids: [ticketId],
  p_reason: 'requested_by_buyer',
  p_initiator: 'organiser',
  p_actor_id: actorId,
  p_buyer_message: 'seat drill',
})
if (reqErr) die('create_refund_request failed', reqErr)
const req = Array.isArray(reqRow) ? reqRow[0] : reqRow
console.log(`  refund row   ${req.refund_id}  amount=${req.amount_cents}c`)

const synthetic = `re_drill_${stamp}`
await db.from('refunds').update({ stripe_refund_id: synthetic }).eq('id', req.refund_id)

const { data: verdict, error: recErr } = await db.rpc('reconcile_refund', {
  p_stripe_refund_id: synthetic,
  p_charge_id: `ch_drill_${stamp}`,
  p_refund_amount_cents: req.amount_cents,
})
if (recErr) die('reconcile_refund failed', recErr)
console.log(`  reconcile    ${verdict}`)

// ------------------------------------------------------------------ read back
hr('3. WHAT THE REFUND ACTUALLY UNWOUND')

const { data: tAfter } = await db.from('tickets').select('id, status, seat_id').eq('id', ticketId).maybeSingle()
const { data: sAfter } = await db.from('seats').select('id, status, reservation_id, order_item_id').eq('id', seat.id).maybeSingle()
const { data: tierAfter } = await db.from('ticket_tiers').select('sold_count').eq('id', tier.id).maybeSingle()
const { data: oAfter } = await db.from('orders').select('status').eq('id', order.id).maybeSingle()
const { data: ledger } = await db.from('organiser_balance_ledger').select('delta_cents, reason').eq('reference_id', order.id)
const { data: rAfter } = await db.from('refunds').select('status').eq('id', req.refund_id).maybeSingle()
const { data: smAfter } = await db.from('squad_members').select('status').eq('order_id', order.id).maybeSingle()

const rows = [
  ['ticket status', tAfter?.status, 'refunded', tAfter?.status === 'refunded'],
  ['tier sold_count', String(tierAfter?.sold_count), `${soldBefore - 1} (one returned)`, tierAfter?.sold_count === soldBefore - 1],
  ['order status', oAfter?.status, 'refunded', oAfter?.status === 'refunded'],
  ['refund status', rAfter?.status, 'completed', rAfter?.status === 'completed'],
  ['SEAT status', sAfter?.status, 'available', sAfter?.status === 'available'],
  ['SQUAD member', smAfter?.status, 'refunded', smAfter?.status === 'refunded'],
]
console.log(`  ${'artefact'.padEnd(18)} ${'observed'.padEnd(16)} ${'expected'.padEnd(22)} verdict`)
console.log('  ' + '-'.repeat(80))
for (const [k, got, want, ok] of rows) {
  console.log(`  ${k.padEnd(18)} ${String(got).padEnd(16)} ${want.padEnd(22)} ${ok ? 'OK' : 'FAIL  <<<'}`)
}
console.log(`  ledger rows: ${(ledger ?? []).length}, net ${(ledger ?? []).reduce((a, l) => a + Number(l.delta_cents), 0)}c`)

hr('4. VERDICT')
/*
 * NAME THE ARTEFACT THAT ACTUALLY FAILED. The first version printed the seat
 * sentence whenever anything failed, so the squad negative control reported
 * "SEAT LEAK REPRODUCED" under a seat row reading OK. A verdict that blames the
 * wrong thing sends the next reader to the wrong code.
 */
const seatFreed = sAfter?.status === 'available'
const squadFreed = smAfter?.status === 'refunded'
if (!seatFreed || !squadFreed) {
  if (!seatFreed) {
    console.log(`  SEAT LEAK REPRODUCED. Seat ${seat.row_label}${seat.seat_number} is '${sAfter?.status}' after a completed refund.`)
    console.log('  The ticket is void, so nobody can sit in it, and the seat is not available,')
    console.log('  so nobody can buy it. That seat is dead for the event.')
  }
  if (!squadFreed) {
    console.log(`  SQUAD SLOT LEAK REPRODUCED. The member is '${smAfter?.status}' after a completed refund.`)
    console.log('  Squad completion counts members at "paid", so this refunded member still')
    console.log('  fills a slot and the squad can complete one ticket short of its own count.')
  }
  console.log('')
  console.log('  Drill rows are left in place for inspection. Remove them with --teardown.')
  process.exit(1)
}
console.log('  SEAT RELEASED and SQUAD SLOT RELEASED. The refund returned the seat to the map')
console.log('  so it can be resold, and the squad no longer counts a refunded member as paid.')
console.log('')
console.log('  Remove the drill rows with --teardown.')
