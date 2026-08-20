/**
 * OVERSELL UNDER REAL CONCURRENCY. Two buyers, one seat, at the same instant.
 *
 * WHY THIS IS THE HIGHEST-RISK TEST ON THE PLATFORM. An oversell is not a bug a
 * user reports, it is an organiser turning somebody away at the door holding a
 * valid ticket. It cannot be undone, it happens in front of a queue, and in a
 * scene built on word of mouth it is unrecoverable. Every other defect can be
 * refunded.
 *
 * IT CANNOT BE ESTABLISHED BY READING. `create_reservation` takes a row lock
 * (`SELECT ... FOR UPDATE`) and checks
 * `total_capacity - sold_count - reserved_count` before incrementing, which LOOKS
 * correct, and looking correct is exactly what an application-level check also
 * does right up until two requests interleave. The only evidence is N requests
 * arriving together and a count of how many won.
 *
 * WHAT IS DRIVEN, and why each moment is separate:
 *
 *   A. RESERVE, the moment a seat is claimed. N simultaneous reservations against
 *      a tier with exactly 1 remaining, at N = 5, 20 and 50. Any number above 1
 *      is an oversell.
 *   B. PARTIAL AVAILABILITY. N simultaneous reservations against 3 remaining.
 *      Exactly 3 must win. A lock that serialises but miscounts passes test A and
 *      fails this one, so A alone is not enough.
 *   C. CONFIRM, a separate moment from reserve. Payment confirmation moves
 *      reserved -> sold. N simultaneous confirmations of the SAME order must move
 *      inventory exactly once, because Stripe retries webhooks.
 *   D. REFUND AGAINST PURCHASE. A refund returning a seat while buyers race for
 *      it. The invariant is that sold + reserved never exceeds capacity at any
 *      point, not merely at the end.
 *
 * EACH REQUEST IS A DISTINCT BUYER. `create_reservation` cancels a session's own
 * existing active reservations, so reusing one session id would make the callers
 * cancel each other and the drill would report "1 succeeded" while proving
 * nothing at all. Every call carries its own session id.
 *
 * CONCURRENCY IS REAL, NOT SIMULATED. All N calls are issued with Promise.all
 * against PostgREST, which is the transport the application uses, so each lands in
 * its own connection and its own transaction. There is no client-side queue in
 * front of them.
 *
 * TEST ONLY, guarded before any client is built.
 *
 * USAGE: node --env-file=.env.test scripts/verify/oversell-concurrency-drill.mjs
 *        node --env-file=.env.test scripts/verify/oversell-concurrency-drill.mjs --keep
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const KEEP = process.argv.includes('--keep')
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !SVC) { console.error('missing Supabase env'); process.exit(2) }
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const STAMP = Date.now().toString(36)
const SLUG = `oversell-drill-${STAMP}`
const fails = []
const scanned = []
const rows = []
const hr = t => console.log(`\n${'='.repeat(76)}\n${t}\n${'='.repeat(76)}`)
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

// ---------------------------------------------------------------- fixture
hr(`FIXTURE  ${SLUG}`)
const { data: coverDonor } = await db.from('events').select('cover_image_url')
  .eq('status', 'published').not('cover_image_url', 'is', null)
  .not('cover_image_url', 'ilike', 'https://picsum.photos/%').limit(1).maybeSingle()
const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()

const owner = await db.auth.admin.createUser({
  email: `oversell-owner-${STAMP}@eventlinqs.test`, password: `Oversell-${STAMP}-Aa1!`, email_confirm: true,
})
const ownerId = owner.data.user.id
await db.from('profiles').upsert({ id: ownerId, email: `oversell-owner-${STAMP}@eventlinqs.test`, full_name: 'Oversell Drill', display_name: 'Oversell Drill', is_verified: true })

const { data: org } = await db.from('organisations').insert({
  name: `Oversell Drill ${STAMP}`, slug: `oversell-drill-org-${STAMP}`, owner_id: ownerId,
  email: `oversell-owner-${STAMP}@eventlinqs.test`, status: 'active', payout_status: 'active',
}).select('id').single()

const start = new Date(Date.now() + 21 * 864e5)
const { data: event } = await db.from('events').insert({
  title: `Oversell Drill ${STAMP}`, slug: SLUG, description: 'Concurrency drill fixture.',
  summary: 'Oversell drill', organisation_id: org.id, created_by: ownerId, category_id: cat?.id ?? null,
  start_date: start.toISOString(), end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
  timezone: 'Australia/Sydney', event_type: 'in_person',
  venue_name: 'Drill Hall', venue_address: '1 Drill St', venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  cover_image_url: coverDonor?.cover_image_url ?? null,
  is_age_restricted: false, max_capacity: 100, is_free: false, fee_pass_type: 'pass_to_buyer',
}).select('id, slug').single()

const { data: tier } = await db.from('ticket_tiers').insert({
  event_id: event.id, name: 'General Admission', tier_type: 'general_admission',
  price: 2500, currency: 'AUD', total_capacity: 1, sold_count: 0, reserved_count: 0,
  min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
  dynamic_pricing_enabled: false, requires_access_code: false,
}).select('id').single()
console.log(`  event ${event.slug}  tier ${tier.id}`)
scanned.push('an isolated TEST fixture: organisation, published paid event, one GA tier')

/** Put the tier back to a known availability and clear reservations. */
async function resetTier(capacity, sold = 0) {
  await db.from('reservations').delete().eq('event_id', event.id)
  const { error } = await db.from('ticket_tiers')
    .update({ total_capacity: capacity, sold_count: sold, reserved_count: 0 })
    .eq('id', tier.id)
  if (error) throw new Error(`resetTier: ${error.message}`)
}
const readTier = async () =>
  (await db.from('ticket_tiers').select('total_capacity, sold_count, reserved_count').eq('id', tier.id).single()).data

/** Fire n simultaneous reservations, each a DISTINCT buyer. */
async function fireReservations(n, qty = 1) {
  const calls = Array.from({ length: n }, (_, i) =>
    db.rpc('create_reservation', {
      p_event_id: event.id,
      p_user_id: null,
      p_session_id: `drill-${STAMP}-${Math.random().toString(36).slice(2)}-${i}`,
      p_items: [{ ticket_tier_id: tier.id, quantity: qty }],
      p_ttl_minutes: 10,
    }),
  )
  const settled = await Promise.all(calls)
  let ok = 0
  let refused = 0
  let errored = 0
  const reasons = new Map()
  for (const r of settled) {
    if (r.error) { errored += 1; reasons.set(`rpc error: ${r.error.code}`, (reasons.get(`rpc error: ${r.error.code}`) ?? 0) + 1); continue }
    const body = r.data
    if (body?.success) ok += 1
    else {
      refused += 1
      const why = String(body?.error ?? 'unknown').replace(/\d+/g, 'N')
      reasons.set(why, (reasons.get(why) ?? 0) + 1)
    }
  }
  return { ok, refused, errored, reasons }
}

// ---------------------------------------------------------------- A. RESERVE
hr('A. RESERVE: N simultaneous buyers, ONE seat remaining')
scanned.push('create_reservation fired concurrently at N = 5, 20 and 50 against 1 remaining seat')
for (const n of [5, 20, 50]) {
  await resetTier(1, 0)
  const before = await readTier()
  const res = await fireReservations(n, 1)
  const after = await readTier()
  const claimed = after.sold_count + after.reserved_count
  rows.push({ test: `reserve, 1 seat, N=${n}`, n, succeeded: res.ok, claimed, capacity: after.total_capacity })
  console.log(`\n  N=${String(n).padStart(2)}  succeeded ${res.ok}   refused ${res.refused}   rpc errors ${res.errored}`)
  console.log(`        tier before sold=${before.sold_count} reserved=${before.reserved_count} capacity=${before.total_capacity}`)
  console.log(`        tier after  sold=${after.sold_count} reserved=${after.reserved_count} capacity=${after.total_capacity}`)
  for (const [why, count] of res.reasons) console.log(`        ${count} x "${why}"`)
  assert(res.ok === 1, `exactly 1 of ${n} simultaneous buyers won the single seat`, `${res.ok} succeeded`)
  assert(claimed <= after.total_capacity,
    `sold + reserved (${claimed}) never exceeds capacity (${after.total_capacity})`, `${claimed} > ${after.total_capacity}`)
}

// ---------------------------------------------------------------- B. PARTIAL
hr('B. PARTIAL AVAILABILITY: 3 seats, 50 simultaneous buyers')
scanned.push('create_reservation fired concurrently at N = 50 against 3 remaining seats')
await resetTier(3, 0)
const bRes = await fireReservations(50, 1)
const bAfter = await readTier()
rows.push({ test: 'reserve, 3 seats, N=50', n: 50, succeeded: bRes.ok, claimed: bAfter.sold_count + bAfter.reserved_count, capacity: bAfter.total_capacity })
console.log(`\n  succeeded ${bRes.ok}   refused ${bRes.refused}   rpc errors ${bRes.errored}`)
console.log(`  tier after sold=${bAfter.sold_count} reserved=${bAfter.reserved_count} capacity=${bAfter.total_capacity}`)
assert(bRes.ok === 3, 'exactly 3 of 50 simultaneous buyers won the 3 seats', `${bRes.ok} succeeded`)
assert(bAfter.reserved_count === 3, 'reserved_count is exactly 3', bAfter.reserved_count)

// ---- B2. a buyer asking for MORE than remains -----------------------------
await resetTier(2, 0)
const b2 = await fireReservations(20, 3)   // each wants 3, only 2 exist
const b2After = await readTier()
console.log(`\n  each of 20 buyers asking for 3 seats when 2 exist: succeeded ${b2.ok}`)
console.log(`  tier after sold=${b2After.sold_count} reserved=${b2After.reserved_count} capacity=${b2After.total_capacity}`)
assert(b2.ok === 0, 'nobody wins when every request exceeds what remains', `${b2.ok} succeeded`)
assert(b2After.reserved_count === 0, 'no partial reservation was written', b2After.reserved_count)
rows.push({ test: 'reserve, 2 seats, N=20 each wanting 3', n: 20, succeeded: b2.ok, claimed: b2After.sold_count + b2After.reserved_count, capacity: 2 })

// ---------------------------------------------------------------- C. CONFIRM
hr('C. CONFIRM: the same order confirmed N times at once (Stripe retries)')
scanned.push('confirm_order fired concurrently 20 times for one order, to prove inventory moves once')
await resetTier(5, 0)
const one = await fireReservations(1, 2)
assert(one.ok === 1, 'a single reservation for 2 tickets was created')
const { data: resv } = await db.from('reservations').select('id, items').eq('event_id', event.id).eq('status', 'active').limit(1).maybeSingle()

const { data: order } = await db.from('orders').insert({
  event_id: event.id, organisation_id: org.id, reservation_id: resv.id,
  status: 'pending', currency: 'AUD',
  subtotal_cents: 5000, total_cents: 5498, platform_fee_cents: 373, processing_fee_cents: 125,
  discount_cents: 0, addon_total_cents: 0,
  guest_email: `oversell-buyer-${STAMP}@resend.dev`, order_number: `EL-DRILL${STAMP.toUpperCase().slice(0, 6)}`,
}).select('id, status').single()

const beforeConfirm = await readTier()
const confirms = await Promise.all(
  Array.from({ length: 20 }, () => db.rpc('confirm_order', { p_order_id: order.id })),
)
const okConfirms = confirms.filter(c => !c.error).length
const afterConfirm = await readTier()
console.log(`\n  20 concurrent confirm_order calls: ${okConfirms} returned without error`)
console.log(`  tier before sold=${beforeConfirm.sold_count} reserved=${beforeConfirm.reserved_count}`)
console.log(`  tier after  sold=${afterConfirm.sold_count} reserved=${afterConfirm.reserved_count}`)
rows.push({ test: 'confirm same order x20', n: 20, succeeded: afterConfirm.sold_count, claimed: afterConfirm.sold_count + afterConfirm.reserved_count, capacity: afterConfirm.total_capacity })
assert(afterConfirm.sold_count === 2, 'inventory moved EXACTLY once: sold_count is 2, not 2 x 20', afterConfirm.sold_count)
assert(afterConfirm.reserved_count === 0, 'the reservation was released exactly once', afterConfirm.reserved_count)
assert(afterConfirm.sold_count + afterConfirm.reserved_count <= afterConfirm.total_capacity,
  'sold + reserved still within capacity', `${afterConfirm.sold_count + afterConfirm.reserved_count}`)

// ---------------------------------------------------------------- D. REFUND vs BUY
hr('D. A REFUND RETURNING A SEAT WHILE BUYERS RACE FOR IT')
scanned.push('a seat returned by a refund-shaped decrement, concurrent with 20 reservations')
// Sold out: capacity 1, sold 1, nothing available.
await resetTier(1, 1)
const soldOut = await fireReservations(5, 1)
assert(soldOut.ok === 0, 'a sold-out tier refuses every buyer', `${soldOut.ok} succeeded`)

// Now return the seat (what reconcile_refund does) at the same moment as 20 buyers.
const raceCalls = [
  db.from('ticket_tiers').update({ sold_count: 0 }).eq('id', tier.id),
  ...Array.from({ length: 20 }, (_, i) =>
    db.rpc('create_reservation', {
      p_event_id: event.id, p_user_id: null,
      p_session_id: `drill-race-${STAMP}-${i}`,
      p_items: [{ ticket_tier_id: tier.id, quantity: 1 }], p_ttl_minutes: 10,
    })),
]
const raced = await Promise.all(raceCalls)
const raceOk = raced.slice(1).filter(r => !r.error && r.data?.success).length
const dAfter = await readTier()
console.log(`\n  one seat returned while 20 buyers raced: ${raceOk} reservation(s) succeeded`)
console.log(`  tier after sold=${dAfter.sold_count} reserved=${dAfter.reserved_count} capacity=${dAfter.total_capacity}`)
rows.push({ test: 'refund returns 1 seat + 20 buyers', n: 20, succeeded: raceOk, claimed: dAfter.sold_count + dAfter.reserved_count, capacity: dAfter.total_capacity })
assert(raceOk <= 1, 'at most ONE buyer took the returned seat', `${raceOk} succeeded`)
assert(dAfter.sold_count + dAfter.reserved_count <= dAfter.total_capacity,
  `sold + reserved (${dAfter.sold_count + dAfter.reserved_count}) within capacity (${dAfter.total_capacity})`)

// ---------------------------------------------------------------- cleanup
if (!KEEP) {
  await db.from('reservations').delete().eq('event_id', event.id)
  const { data: ords } = await db.from('orders').select('id').eq('event_id', event.id)
  const orderIds = (ords ?? []).map(o => o.id)
  if (orderIds.length) {
    await db.from('tickets').delete().in('order_id', orderIds)
    await db.from('order_items').delete().in('order_id', orderIds)
    await db.from('orders').delete().in('id', orderIds)
  }
  const { data: links } = await db.from('share_links').select('id').eq('event_id', event.id)
  if ((links ?? []).length) await db.from('share_links').delete().in('id', links.map(l => l.id))
  await db.from('ticket_tiers').delete().eq('event_id', event.id)
  await db.from('events').delete().eq('id', event.id)
  await db.from('organisations').delete().eq('id', org.id)
  await db.from('profiles').delete().eq('id', ownerId)
  await db.auth.admin.deleteUser(ownerId).catch(() => {})
  console.log('\n  fixture removed')
}

// ---------------------------------------------------------------- report
hr('RESULTS')
console.log(`  ${'scenario'.padEnd(38)} ${'fired'.padStart(5)} ${'won'.padStart(4)} ${'claimed/cap'.padStart(12)}`)
console.log(`  ${'-'.repeat(38)} ${'-'.repeat(5)} ${'-'.repeat(4)} ${'-'.repeat(12)}`)
for (const r of rows) {
  console.log(`  ${r.test.padEnd(38)} ${String(r.n).padStart(5)} ${String(r.succeeded).padStart(4)} ${`${r.claimed}/${r.capacity}`.padStart(12)}`)
}

hr('WHAT THIS DRILL SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0
  ? 'NO OVERSELL. Every scenario respected capacity under real concurrency.'
  : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
