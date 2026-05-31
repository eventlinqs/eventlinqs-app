/**
 * GMV analytics - end-to-end verification of the GMV definition against the
 * real Sydney database (real order_status enum + columns), inside
 * BEGIN ... ROLLBACK. Inserts known orders across statuses plus one completed
 * refund for a throwaway org, then runs the same aggregation the analytics lib
 * uses (scoped to that org so production rows don't interfere) and asserts the
 * gross / platform-revenue / refunded / net figures.
 *
 * Run: node scripts/verify/analytics-gmv-e2e.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const client = new pg.Client({
  host: 'db.gndnldyfudbytbboxesk.supabase.co',
  port: 5432, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD_SYDNEY,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})

const fails = []
function assert(cond, msg, detail) {
  if (cond) console.log('  PASS:', msg)
  else { console.log('  FAIL:', msg, detail !== undefined ? `(got ${JSON.stringify(detail)})` : ''); fails.push(msg) }
}
const q = (t, p) => client.query(t, p)
const one = async (t, p) => (await q(t, p)).rows[0]

const owner = randomUUID(), orgId = randomUUID(), eventId = randomUUID()
const sfx = Date.now().toString(36)

await client.connect()
try {
  await q('BEGIN')
  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [owner, `o_${sfx}@test.invalid`])
  await q(`INSERT INTO public.profiles (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email`, [owner, `o_${sfx}@test.invalid`])
  await q(`INSERT INTO public.organisations (id, name, slug, owner_id, status) VALUES ($1,$2,$3,$4,'active')`, [orgId, `GMV Org ${sfx}`, `gmv-${sfx}`, owner])
  await q(`INSERT INTO public.events (id, title, slug, organisation_id, created_by, start_date, end_date, status)
           VALUES ($1,$2,$3,$4,$5, now()+interval '30 days', now()+interval '31 days','draft')`,
    [eventId, `GMV Event ${sfx}`, `gmv-ev-${sfx}`, orgId, owner])

  // Known orders. Only confirmed/partially_refunded/refunded count toward GMV.
  const orders = [
    { total: 10000, plat: 500, status: 'confirmed' },
    { total: 5000, plat: 250, status: 'partially_refunded' },
    { total: 3000, plat: 150, status: 'refunded' },
    { total: 2000, plat: 100, status: 'pending' },     // excluded
    { total: 1000, plat: 50, status: 'cancelled' },    // excluded
  ]
  let firstOrderId = null
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    const id = randomUUID()
    if (i === 0) firstOrderId = id
    await q(`INSERT INTO public.orders (id, order_number, event_id, organisation_id, status, subtotal_cents, platform_fee_cents, total_cents, currency, guest_email, guest_name)
             VALUES ($1,$2,$3,$4,$5::order_status,$6,$7,$6,'AUD',$8,'GMV Buyer')`,
      [id, `GMV-${sfx}-${i}`, eventId, orgId, o.status, o.total, o.plat, `b_${sfx}@test.invalid`])
  }
  // One completed refund (counts) + one processing (excluded).
  await q(`INSERT INTO public.refunds (order_id, organisation_id, amount_cents, currency, reason, status, initiator)
           VALUES ($1,$2,2000,'AUD','requested_by_buyer','completed','admin'),($1,$2,500,'AUD','requested_by_buyer','processing','admin')`,
    [firstOrderId, orgId])

  console.log('\n[GMV aggregation scoped to the test org]')
  const agg = await one(`
    SELECT
      COALESCE(SUM(total_cents) FILTER (WHERE status IN ('confirmed','partially_refunded','refunded')),0) AS gross,
      COALESCE(SUM(platform_fee_cents) FILTER (WHERE status IN ('confirmed','partially_refunded','refunded')),0) AS plat,
      COUNT(*) FILTER (WHERE status IN ('confirmed','partially_refunded','refunded')) AS paid
    FROM public.orders WHERE organisation_id=$1 AND currency='AUD'`, [orgId])
  const refunded = Number((await one(`SELECT COALESCE(SUM(amount_cents),0) r FROM public.refunds WHERE organisation_id=$1 AND currency='AUD' AND status='completed'`, [orgId])).r)

  assert(Number(agg.gross) === 18000, 'gross GMV = 18000 (paid statuses only)', agg.gross)
  assert(Number(agg.plat) === 900, 'platform revenue = 900', agg.plat)
  assert(Number(agg.paid) === 3, 'paid orders = 3 (pending/cancelled excluded)', agg.paid)
  assert(refunded === 2000, 'refunded = 2000 (only completed)', refunded)
  assert(Number(agg.gross) - refunded === 16000, 'net GMV = 16000', Number(agg.gross) - refunded)

  await q('ROLLBACK')
  console.log('\n[cleanup] ROLLBACK complete - no fixture rows persisted')
} catch (err) {
  try { await q('ROLLBACK') } catch {}
  console.error('\nGMV E2E ERROR:', err.message)
  fails.push('exception: ' + err.message)
} finally {
  await client.end()
}

console.log(`\n${'='.repeat(60)}`)
if (fails.length === 0) console.log('GMV ANALYTICS E2E: ALL ASSERTIONS PASSED (against real DB, rolled back)')
else { console.log(`GMV ANALYTICS E2E: ${fails.length} FAILURE(S):`); fails.forEach(f => console.log('  -', f)) }
process.exit(fails.length === 0 ? 0 : 1)
