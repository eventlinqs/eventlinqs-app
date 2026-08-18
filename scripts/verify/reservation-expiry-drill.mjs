/**
 * RESERVATION EXPIRY: the three cases, and the one where money and a seat can both
 * go wrong at once.
 *
 * Tickets are held for about 10 minutes. Three things must be true and only one of
 * them is obvious:
 *
 *   A. An ABANDONED reservation returns the seat. If it does not, every abandoned
 *      checkout permanently shrinks the room.
 *   B. An EXPIRED reservation cannot be paid for as though it were live.
 *   C. A PAYMENT LANDING EXACTLY AS THE HOLD EXPIRES does not take money for a seat
 *      that has already been released, and above all does not issue a ticket for a
 *      seat somebody else has since bought.
 *
 * C IS THE DANGEROUS ONE and it is not hypothetical. Reading confirm_order:
 *
 *     UPDATE public.orders SET status = 'confirmed' ...        -- unconditional
 *     IF v_order.reservation_id IS NOT NULL THEN
 *       SELECT * INTO v_reservation ... FOR UPDATE;
 *       IF FOUND AND v_reservation.status = 'active' THEN      -- conditional
 *         ... sold_count = sold_count + v_quantity ...
 *
 * The order is confirmed unconditionally; inventory only moves if the reservation is
 * still ACTIVE. So a payment that lands after the sweeper has expired the hold
 * confirms the order, and the ticket-issuing trigger fires on that confirmation,
 * while sold_count is never incremented. The seat was already returned to sale and
 * may already belong to somebody else. Two buyers, one seat, and this time the row
 * lock cannot help because the second buyer's purchase was entirely legitimate.
 *
 * This drill establishes what actually happens rather than arguing from the source,
 * because "the trigger fires on confirmation" is an assumption until a ticket row is
 * counted.
 *
 * TEST ONLY, guarded. Time is advanced by moving `expires_at` into the past, which
 * is what the sweeper reads, so no clock is faked and the real function is exercised.
 *
 * USAGE: node --env-file=.env.test scripts/verify/reservation-expiry-drill.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { assertNotProduction, assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

/**
 * --fix installs 20260819000003 (confirm_order re-acquires a lapsed hold) before the
 * drill runs, so the SAME three cases are measured against the fixed function. It is
 * applied for real rather than in a rolled-back transaction, because the drill's own
 * writes go through PostgREST on other connections and would not see an uncommitted
 * function. --restore puts the previous body back.
 *
 * Both modes print which body is live, so a run can never be mistaken for the other.
 */
const FIX = process.argv.includes('--fix')
const RESTORE = process.argv.includes('--restore')
const MIGRATION = 'supabase/migrations/20260819000003_confirm_order_reacquires_lapsed_hold.sql'
const PREVIOUS = 'supabase/migrations/20260705000003_confirm_order_seat_reservations.sql'

if (FIX || RESTORE) {
  const target = assertNotProductionDatabase()
  const admin = new pg.Client(target.clientConfig)
  await admin.connect()
  const file = FIX ? MIGRATION : PREVIOUS
  const sql = readFileSync(file, 'utf8')
  // The previous migration file carries more than the function; take only the
  // CREATE OR REPLACE FUNCTION confirm_order statement out of it.
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.confirm_order')
  const body = sql.slice(start)
  await admin.query(body.slice(0, body.indexOf('$$;') + 3))
  await admin.end()
  console.log(`[confirm_order] installed the ${FIX ? 'FIXED' : 'PREVIOUS'} body from ${file}`)
  if (RESTORE) process.exit(0)
}

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !SVC) { console.error('missing Supabase env'); process.exit(2) }
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const STAMP = Date.now().toString(36)
const fails = []
const findings = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
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
  name: `Expiry Drill ${STAMP}`, slug: `expiry-drill-${STAMP}`, owner_id: prof.id,
  email: `expiry-${STAMP}@eventlinqs.test`, status: 'active', payout_status: 'active',
}).select('id').single()

const start = new Date(Date.now() + 21 * 864e5)
const { data: event } = await db.from('events').insert({
  title: `Expiry Drill ${STAMP}`, slug: `expiry-drill-${STAMP}`, description: 'Expiry drill.',
  summary: 'Expiry drill', organisation_id: org.id, created_by: prof.id, category_id: cat?.id ?? null,
  start_date: start.toISOString(), end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney', event_type: 'in_person',
  venue_name: 'Hall', venue_address: '1 St', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: coverDonor?.cover_image_url ?? null,
  is_age_restricted: false, max_capacity: 10, is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id').single()

const { data: tier } = await db.from('ticket_tiers').insert({
  event_id: event.id, name: 'General Admission', tier_type: 'general_admission',
  price: 2500, currency: 'AUD', total_capacity: 1, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id').single()
scanned.push('an isolated fixture with a ONE-seat tier')

const tierState = async () =>
  (await db.from('ticket_tiers').select('total_capacity, sold_count, reserved_count').eq('id', tier.id).single()).data
const reset = async () => {
  await db.from('reservations').delete().eq('event_id', event.id)
  await db.from('ticket_tiers').update({ total_capacity: 1, sold_count: 0, reserved_count: 0 }).eq('id', tier.id)
}
async function reserve(session, qty = 1) {
  const { data } = await db.rpc('create_reservation', {
    p_event_id: event.id, p_user_id: null, p_session_id: session,
    p_items: [{ ticket_tier_id: tier.id, quantity: qty }], p_ttl_minutes: 10,
  })
  return data
}
async function makeOrder(reservationId, qty = 1) {
  const { data, error } = await db.from('orders').insert({
    event_id: event.id, organisation_id: org.id, reservation_id: reservationId,
    status: 'pending', currency: 'AUD',
    subtotal_cents: 2500 * qty, total_cents: 2749 * qty,
    platform_fee_cents: 187 * qty, processing_fee_cents: 62 * qty,
    discount_cents: 0, addon_total_cents: 0,
    guest_email: `expiry-${STAMP}-${Math.random().toString(36).slice(2, 7)}@resend.dev`,
    order_number: `EL-EXP${STAMP.toUpperCase().slice(0, 5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
  }).select('id, order_number').single()
  if (error) throw new Error(`order insert: ${error.message}`)

  /*
   * ORDER ITEMS ARE NOT OPTIONAL HERE, and leaving them out made the first run of
   * this drill measure nothing. issue_tickets_for_order loops
   * `order_items WHERE item_type = 'ticket'`, so an order with no items issues ZERO
   * tickets no matter what else happens. The first version reported "0 tickets for
   * 1 seat, no oversell" and passed, which was a property of the fixture rather than
   * of the platform: the drill could not have detected an oversell if there had been
   * one. Same class as the vacuous measurement this project has been burnt by before.
   */
  const items = Array.from({ length: qty }, () => ({
    order_id: data.id,
    ticket_tier_id: tier.id,
    addon_id: null,
    item_type: 'ticket',
    item_name: 'General Admission',
    quantity: 1,
    unit_price_cents: 2500,
    total_cents: 2500,
    attendee_first_name: 'Expiry',
    attendee_last_name: 'Drill',
    attendee_email: `expiry-${STAMP}@resend.dev`,
  }))
  const { error: itemsError } = await db.from('order_items').insert(items)
  if (itemsError) throw new Error(`order_items insert: ${itemsError.message}`)
  return data
}
const ticketCount = async (orderId) =>
  (await db.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', orderId)).count ?? 0

try {
  // ------------------------------------------------------------------ A
  hr('A. AN ABANDONED RESERVATION RETURNS THE SEAT')
  await reset()
  const rA = await reserve(`expiry-A-${STAMP}`)
  assert(rA?.success === true, 'reservation created')
  const afterReserve = await tierState()
  assert(afterReserve.reserved_count === 1, 'the seat is held (reserved_count 1)', afterReserve.reserved_count)

  const soldOutWhileHeld = await reserve(`expiry-A2-${STAMP}`)
  assert(soldOutWhileHeld?.success === false, 'a second buyer is refused while the seat is held')

  // Advance time the way the sweeper reads it.
  await db.from('reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('event_id', event.id).eq('status', 'active')
  const { data: swept } = await db.rpc('expire_stale_reservations')
  scanned.push('expire_stale_reservations executed against a hold moved into the past')
  console.log(`  sweeper expired ${swept} reservation(s)`)
  const afterSweep = await tierState()
  assert(afterSweep.reserved_count === 0, 'the seat came back (reserved_count 0)', afterSweep.reserved_count)
  const nowFree = await reserve(`expiry-A3-${STAMP}`)
  assert(nowFree?.success === true, 'the returned seat is purchasable again by somebody else')

  // ------------------------------------------------------------------ B
  hr('B. AN EXPIRED RESERVATION CANNOT BE PAID FOR AS THOUGH IT WERE LIVE')
  await reset()
  const rB = await reserve(`expiry-B-${STAMP}`)
  const { data: resvB } = await db.from('reservations').select('id').eq('event_id', event.id)
    .eq('status', 'active').limit(1).maybeSingle()
  const orderB = await makeOrder(resvB.id)
  await db.from('reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', resvB.id)
  await db.rpc('expire_stale_reservations')
  const beforeConfirmB = await tierState()
  console.log(`  hold expired. tier sold=${beforeConfirmB.sold_count} reserved=${beforeConfirmB.reserved_count}`)

  const { error: confirmErr } = await db.rpc('confirm_order', { p_order_id: orderB.id })
  const orderBAfter = (await db.from('orders').select('status').eq('id', orderB.id).single()).data
  const afterConfirmB = await tierState()
  const ticketsB = await ticketCount(orderB.id)
  scanned.push('confirm_order called on an order whose reservation had already expired')

  console.log(`  confirm_order error: ${confirmErr ? `${confirmErr.code} ${confirmErr.message}` : 'none'}`)
  console.log(`  order status      : ${orderBAfter.status}`)
  console.log(`  tier after        : sold=${afterConfirmB.sold_count} reserved=${afterConfirmB.reserved_count} capacity=${afterConfirmB.total_capacity}`)
  console.log(`  tickets issued    : ${ticketsB}`)

  const moneyWithoutSeat = orderBAfter.status === 'confirmed' && afterConfirmB.sold_count === 0
  if (moneyWithoutSeat) {
    findings.push(
      'confirm_order on an EXPIRED reservation confirms the order '
      + `(status=${orderBAfter.status}) and issues ${ticketsB} ticket(s) while sold_count stays `
      + `${afterConfirmB.sold_count}. The seat was already released, so the platform has taken money and `
      + 'issued a ticket for inventory it does not believe it sold.',
    )
    console.log('\n  >>> FINDING: the order confirmed and inventory did NOT move.')
    console.log('  >>> The seat had already been returned to sale before this payment landed.')
  }
  assert(!moneyWithoutSeat,
    'an expired reservation does not confirm into a ticket without counting the seat',
    `order=${orderBAfter.status} sold_count=${afterConfirmB.sold_count} tickets=${ticketsB}`)

  // ------------------------------------------------------------------ C
  hr('C. THE PAYMENT THAT LANDS AFTER SOMEBODY ELSE BOUGHT THE SEAT')
  await reset()
  const rC1 = await reserve(`expiry-C1-${STAMP}`)
  const { data: resvC1 } = await db.from('reservations').select('id').eq('event_id', event.id)
    .eq('status', 'active').limit(1).maybeSingle()
  const orderC1 = await makeOrder(resvC1.id)

  // The hold lapses and the sweeper returns the seat.
  await db.from('reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', resvC1.id)
  await db.rpc('expire_stale_reservations')

  // A second buyer legitimately buys the returned seat, all the way to confirmed.
  await reserve(`expiry-C2-${STAMP}`)
  const { data: resvC2 } = await db.from('reservations').select('id').eq('event_id', event.id)
    .eq('status', 'active').limit(1).maybeSingle()
  const orderC2 = await makeOrder(resvC2.id)
  await db.rpc('confirm_order', { p_order_id: orderC2.id })
  const afterSecondBuyer = await tierState()
  console.log(`  second buyer confirmed: sold=${afterSecondBuyer.sold_count}/${afterSecondBuyer.total_capacity}`)
  assert(afterSecondBuyer.sold_count === 1, 'the second buyer legitimately holds the only seat', afterSecondBuyer.sold_count)

  // Now the FIRST buyer's payment finally lands.
  await db.rpc('confirm_order', { p_order_id: orderC1.id })
  const finalTier = await tierState()
  const t1 = await ticketCount(orderC1.id)
  const t2 = await ticketCount(orderC2.id)
  const o1 = (await db.from('orders').select('status').eq('id', orderC1.id).single()).data
  scanned.push('a late payment confirmed AFTER the released seat had been resold')

  console.log(`  late payment confirmed: order1=${o1.status}`)
  console.log(`  tier final           : sold=${finalTier.sold_count}/${finalTier.total_capacity}`)
  console.log(`  tickets: order1=${t1}  order2=${t2}   TOTAL ADMITTING=${t1 + t2}`)

  const oversold = (t1 + t2) > finalTier.total_capacity
  if (oversold) {
    findings.push(
      `${t1 + t2} admitting tickets exist for a tier with capacity ${finalTier.total_capacity}. `
      + 'A payment that landed after its hold expired was confirmed into a ticket for a seat '
      + 'another buyer had already been sold. Both buyers were charged and both hold a ticket.',
    )
    console.log(`\n  >>> OVERSELL: ${t1 + t2} tickets for ${finalTier.total_capacity} seat(s).`)
    console.log('  >>> Both buyers paid. One of them is turned away at the door.')
  }
  assert(!oversold,
    `no oversell via late confirmation: ${t1 + t2} ticket(s) for ${finalTier.total_capacity} seat(s)`,
    `${t1 + t2} > ${finalTier.total_capacity}`)
} finally {
  // cleanup
  const { data: ords } = await db.from('orders').select('id').eq('event_id', event.id)
  const ids = (ords ?? []).map(o => o.id)
  if (ids.length) {
    await db.from('tickets').delete().in('order_id', ids)
    await db.from('order_items').delete().in('order_id', ids)
    await db.from('orders').delete().in('id', ids)
  }
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
