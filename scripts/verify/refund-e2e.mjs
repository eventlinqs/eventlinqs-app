/**
 * Refund operator path - end-to-end verification against the real Sydney
 * database, the real create_refund_request and reconcile_refund RPCs, and the
 * real schema/constraints. The entire run is wrapped in BEGIN ... ROLLBACK so
 * nothing persists (the cleanest possible "restore"): a fresh fixture is built,
 * exercised, asserted, and discarded.
 *
 * Covered: full refund (ledger inverse sums to zero, reserve hold released,
 * inventory returned, tickets refunded, order/refund status), idempotent
 * webhook replay (no double-reversal), partial refund (proportional), and
 * unauthorised actor rejection.
 *
 * The Stripe API call (refund.ts) and the webhook HTTP delivery + email are
 * the external boundary; they are unit-tested separately and confirmed on the
 * Vercel preview. Here the Stripe success is simulated by setting
 * refunds.stripe_refund_id, exactly as the refund service does after Stripe.
 *
 * Run: node scripts/verify/refund-e2e.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const client = new pg.Client({
  host: 'db.gndnldyfudbytbboxesk.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD_SYDNEY,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const fails = []
function assert(cond, msg, detail) {
  if (cond) console.log('  PASS:', msg)
  else { console.log('  FAIL:', msg, detail !== undefined ? `(got ${JSON.stringify(detail)})` : ''); fails.push(msg) }
}
const q = (text, params) => client.query(text, params)
const one = async (text, params) => (await q(text, params)).rows[0]

// Fixture ids
const ownerUser = randomUUID(), adminUser = randomUUID(), stranger = randomUUID()
const orgId = randomUUID(), eventId = randomUUID(), tierId = randomUUID()
const order1 = randomUUID(), oi1 = randomUUID()
const order2 = randomUUID(), oi2 = randomUUID()
const t1 = [randomUUID(), randomUUID(), randomUUID()]
const t2 = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
const hold1 = randomUUID(), hold2 = randomUUID()
const sfx = Date.now().toString(36)

await client.connect()
try {
  await q('BEGIN')

  // Verifies the LIVE applied reconcile_refund (migration 20260531000002 is
  // applied to the database). No in-transaction patch: this proves the real
  // function on the DB is the fixed version.

  // --- Users / org / event / tier ---
  // auth.users insert fires a profile-creation trigger; give each a real email
  // and upsert profiles to coexist with whatever the trigger writes.
  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4),($5,$6)',
    [ownerUser, `owner_${sfx}@test.invalid`, adminUser, `admin_${sfx}@test.invalid`, stranger, `stranger_${sfx}@test.invalid`])
  await q(`INSERT INTO public.profiles (id, email) VALUES ($1,$2),($3,$4),($5,$6)
           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [ownerUser, `owner_${sfx}@test.invalid`, adminUser, `admin_${sfx}@test.invalid`, stranger, `stranger_${sfx}@test.invalid`])
  await q(`INSERT INTO public.admin_users (id, role, display_name) VALUES ($1,'admin','E2E Admin')`, [adminUser])

  await q(`INSERT INTO public.organisations (id, name, slug, owner_id, stripe_account_country, hold_amount_cents, total_volume_cents)
           VALUES ($1,$2,$3,$4,'AU',0,0)`, [orgId, `E2E Org ${sfx}`, `e2e-org-${sfx}`, ownerUser])
  await q(`INSERT INTO public.events (id, title, slug, organisation_id, created_by, start_date, end_date, status)
           VALUES ($1,$2,$3,$4,$5, now() + interval '30 days', now() + interval '31 days', 'draft')`,
    [eventId, `E2E Event ${sfx}`, `e2e-event-${sfx}`, orgId, ownerUser])
  await q(`INSERT INTO public.ticket_tiers (id, event_id, name, total_capacity, sold_count)
           VALUES ($1,$2,'General',100,8)`, [tierId, eventId])

  // --- Helper to build a confirmed order + items + tickets + payment + sale ledger ---
  async function buildOrder({ orderId, oiId, ticketIds, unitPrice, num, pi, holdId, orderNo }) {
    const total = 10000, platform = 500, processing = 300
    const share = total - platform - processing      // 9200
    const reserve = Math.floor(share * 20 / 100)      // 1840
    await q(`INSERT INTO public.orders (id, order_number, event_id, organisation_id, status, subtotal_cents,
               platform_fee_cents, processing_fee_cents, total_cents, currency, guest_email, guest_name)
             VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,'AUD',$9,'E2E Buyer')`,
      [orderId, orderNo, eventId, orgId, total, platform, processing, total, `buyer_${sfx}@test.invalid`])
    await q(`INSERT INTO public.order_items (id, order_id, item_type, item_name, ticket_tier_id, quantity, unit_price_cents)
             VALUES ($1,$2,'ticket','General',$3,$4,$5)`, [oiId, orderId, tierId, num, unitPrice])
    for (let i = 0; i < ticketIds.length; i++) {
      await q(`INSERT INTO public.tickets (id, order_id, order_item_id, event_id, ticket_tier_id, idx_in_item, ticket_code, holder_email, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'valid')`,
        [ticketIds[i], orderId, oiId, eventId, tierId, i, `EL-${sfx}-${orderNo}-${i}`, `buyer_${sfx}@test.invalid`])
    }
    await q(`INSERT INTO public.payments (id, order_id, amount_cents, currency, gateway, idempotency_key, gateway_payment_id)
             VALUES ($1,$2,$3,'AUD','stripe',$4,$5)`,
      [randomUUID(), orderId, total, `idem_${orderNo}_${sfx}`, pi])
    // Sale ledger (mirrors recordOrderConfirmedLedger): credit share, hold reserve.
    await q(`INSERT INTO public.organiser_balance_ledger (organisation_id, delta_cents, currency, reason, reference_type, reference_id)
             VALUES ($1,$2,'AUD','order_confirmed','order',$3)`, [orgId, share, orderId])
    await q(`INSERT INTO public.payout_holds (id, organisation_id, event_id, hold_type, amount_cents, currency, release_at, metadata)
             VALUES ($1,$2,$3,'reserve',$4,'AUD', now() + interval '33 days', jsonb_build_object('order_id',$5::text))`,
      [holdId, orgId, eventId, reserve, orderId])
    await q(`INSERT INTO public.organiser_balance_ledger (organisation_id, delta_cents, currency, reason, reference_type, reference_id)
             VALUES ($1,$2,'AUD','reserve_hold','hold',$3)`, [orgId, -reserve, holdId])
    await q(`UPDATE public.organisations SET hold_amount_cents = hold_amount_cents + $2 WHERE id = $1`, [orgId, reserve])
    return { total, share, reserve }
  }

  console.log('\n[Fixture] building confirmed orders + sale ledger')
  const o1 = await buildOrder({ orderId: order1, oiId: oi1, ticketIds: t1, unitPrice: 3000, num: 3, pi: `pi_full_${sfx}`, holdId: hold1, orderNo: `E2E1${sfx}` })
  await buildOrder({ orderId: order2, oiId: oi2, ticketIds: t2, unitPrice: 2000, num: 5, pi: `pi_part_${sfx}`, holdId: hold2, orderNo: `E2E2${sfx}` })

  const ledgerSum = async () => Number((await one(`SELECT COALESCE(SUM(delta_cents),0) s FROM public.organiser_balance_ledger WHERE organisation_id=$1`, [orgId])).s)
  const holdAmt = async () => Number((await one(`SELECT hold_amount_cents h FROM public.organisations WHERE id=$1`, [orgId])).h)
  const soldCount = async () => Number((await one(`SELECT sold_count s FROM public.ticket_tiers WHERE id=$1`, [tierId])).s)

  const sumAfterSales = await ledgerSum()  // 2 * 7360 = 14720
  assert(sumAfterSales === 14720, 'sale ledger nets to 2x organiser share', sumAfterSales)
  assert(await holdAmt() === 3680, 'hold_amount_cents = 2x reserve after sales', await holdAmt())
  assert(await soldCount() === 8, 'tier sold_count = 8 after sales', await soldCount())

  // ===== Test A: full refund of order1 (all 3 tickets) =====
  console.log('\n[A] full refund (admin, all 3 tickets)')
  const reqA = await one(
    `SELECT * FROM public.create_refund_request($1,$2,'requested_by_buyer','admin',$3,'sorry')`,
    [order1, t1, adminUser])
  assert(Number(reqA.amount_cents) === 10000, 'full refund amount = order total', reqA.amount_cents)
  assert(reqA.currency === 'AUD', 'currency AUD')
  assert(reqA.payment_intent_id === `pi_full_${sfx}`, 'payment intent resolved', reqA.payment_intent_id)
  const refundA = reqA.refund_id
  assert((await one(`SELECT status FROM public.refunds WHERE id=$1`, [refundA])).status === 'processing', 'refund row processing')
  assert(Number((await one(`SELECT count(*) c FROM public.refund_tickets WHERE refund_id=$1 AND is_active`, [refundA])).c) === 3, '3 active ticket claims')

  await q(`UPDATE public.refunds SET stripe_refund_id=$2 WHERE id=$1`, [refundA, `re_full_${sfx}`])
  const recA = (await one(`SELECT public.reconcile_refund($1,$2,$3) r`, [`re_full_${sfx}`, `ch_full_${sfx}`, 10000])).r
  assert(recA === 'reconciled', 'reconcile returned reconciled', recA)

  assert(Number((await one(`SELECT count(*) c FROM public.tickets WHERE order_id=$1 AND status='refunded'`, [order1])).c) === 3, 'all 3 tickets refunded')
  assert(Number((await one(`SELECT count(*) c FROM public.tickets WHERE order_id=$1 AND status IN ('valid','scanned')`, [order1])).c) === 0, 'no admitting tickets remain (QR rejected)')
  assert(await soldCount() === 5, 'inventory returned: sold_count 8 -> 5', await soldCount())

  const ledA = (await q(`SELECT reason, delta_cents FROM public.organiser_balance_ledger WHERE reference_id=$1 AND (metadata->>'refund_id')=$2 ORDER BY reason`, [order1, refundA])).rows
  const byReason = Object.fromEntries(ledA.map(r => [r.reason, Number(r.delta_cents)]))
  assert(byReason.reserve_release === 1840, 'reserve_release +1840', byReason.reserve_release)
  assert(byReason.refund_from_reserve === -1840, 'refund_from_reserve -1840', byReason.refund_from_reserve)
  assert(byReason.refund_from_balance === -7360, 'refund_from_balance -7360', byReason.refund_from_balance)

  const holdRowA = await one(`SELECT amount_cents, released_at FROM public.payout_holds WHERE id=$1`, [hold1])
  assert(Number(holdRowA.amount_cents) === 0 && holdRowA.released_at !== null, 'reserve hold released (amount 0, released_at set)', holdRowA)
  assert((await one(`SELECT status FROM public.orders WHERE id=$1`, [order1])).status === 'refunded', 'order1 status refunded')
  assert((await one(`SELECT status FROM public.refunds WHERE id=$1`, [refundA])).status === 'completed', 'refund completed')
  // Invariant: order1 fully reversed -> its net ledger contribution is zero.
  // Global sum should drop by order1's full share (7360): 14720 -> 7360.
  assert(await ledgerSum() === 7360, 'ledger inverse exact: order1 contribution zeroed (sum 14720 -> 7360)', await ledgerSum())
  assert(await holdAmt() === 1840, 'hold_amount_cents 3680 -> 1840 (order1 reserve released)', await holdAmt())

  // ===== Test B: idempotent webhook replay =====
  console.log('\n[B] idempotent replay')
  const ledgerCountBefore = Number((await one(`SELECT count(*) c FROM public.organiser_balance_ledger WHERE organisation_id=$1`, [orgId])).c)
  const recB = (await one(`SELECT public.reconcile_refund($1,$2,$3) r`, [`re_full_${sfx}`, `ch_full_${sfx}`, 10000])).r
  assert(recB === 'already_done', 'replay returns already_done', recB)
  const ledgerCountAfter = Number((await one(`SELECT count(*) c FROM public.organiser_balance_ledger WHERE organisation_id=$1`, [orgId])).c)
  assert(ledgerCountAfter === ledgerCountBefore, 'no new ledger rows on replay (no double-reversal)', { before: ledgerCountBefore, after: ledgerCountAfter })
  assert(await soldCount() === 5, 'sold_count unchanged on replay', await soldCount())

  // ===== Test E: partial refund of order2 (2 of 5 tickets) =====
  console.log('\n[E] partial refund (2 of 5 tickets)')
  const reqE = await one(
    `SELECT * FROM public.create_refund_request($1,$2,'cannot_attend','admin',$3,null)`,
    [order2, [t2[0], t2[1]], adminUser])
  assert(Number(reqE.amount_cents) === 4000, 'partial amount proportional (2/5 of 10000 = 4000)', reqE.amount_cents)
  await q(`UPDATE public.refunds SET stripe_refund_id=$2 WHERE id=$1`, [reqE.refund_id, `re_part_${sfx}`])
  const recE = (await one(`SELECT public.reconcile_refund($1,$2,$3) r`, [`re_part_${sfx}`, `ch_part_${sfx}`, 4000])).r
  assert(recE === 'reconciled', 'partial reconcile reconciled', recE)
  assert(Number((await one(`SELECT count(*) c FROM public.tickets WHERE order_id=$1 AND status='refunded'`, [order2])).c) === 2, 'exactly 2 tickets refunded')
  assert(Number((await one(`SELECT count(*) c FROM public.tickets WHERE order_id=$1 AND status='valid'`, [order2])).c) === 3, '3 tickets still valid')
  assert(await soldCount() === 3, 'inventory returned for 2: sold_count 5 -> 3', await soldCount())
  assert((await one(`SELECT status FROM public.orders WHERE id=$1`, [order2])).status === 'partially_refunded', 'order2 partially_refunded')

  // ===== Test F: unauthorised actor rejected =====
  console.log('\n[F] unauthorised actor rejected')
  let rejected = false, rejErr = ''
  await q('SAVEPOINT before_unauth')
  try {
    await q(`SELECT * FROM public.create_refund_request($1,$2,'other','organiser',$3,null)`, [order2, [t2[2]], stranger])
  } catch (e) { rejected = true; rejErr = e.message; await q('ROLLBACK TO SAVEPOINT before_unauth') }
  assert(rejected && /not authorised/i.test(rejErr), 'stranger refund rejected by RPC', rejErr)
  assert(Number((await one(`SELECT count(*) c FROM public.refunds WHERE order_id=$1`, [order2])).c) === 1, 'no extra refund row created by rejected attempt')

  await q('ROLLBACK')
  console.log('\n[cleanup] ROLLBACK complete - no fixture rows persisted')
} catch (e) {
  try { await q('ROLLBACK') } catch {}
  console.error('\nE2E ERROR:', e.message)
  fails.push('exception: ' + e.message)
} finally {
  await client.end()
}

console.log(`\n${'='.repeat(60)}`)
if (fails.length === 0) console.log('REFUND E2E: ALL ASSERTIONS PASSED (against real DB, rolled back)')
else { console.log(`REFUND E2E: ${fails.length} FAILURE(S):`); fails.forEach(f => console.log('  -', f)) }
process.exit(fails.length === 0 ? 0 : 1)
