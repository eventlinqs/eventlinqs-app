/**
 * Payout disbursement - end-to-end verification against the real Sydney
 * database and the real disburse_payout / void_payout / organiser_available_balance
 * RPCs, inside a single BEGIN ... ROLLBACK transaction (nothing persists).
 *
 * Covers the money invariants: authoritative balance, partial disburse,
 * overpay refusal, full disburse, nothing-to-disburse, void compensation +
 * idempotency, and the payouts-not-active guard. The Stripe payout call
 * (createPayout) is the external boundary and is unit-tested separately; these
 * RPCs are the ledger/claim authority and never touch Stripe.
 *
 * Run: npm install pg --no-save ; node scripts/verify/payout-e2e.mjs
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

const owner = randomUUID(), actor = randomUUID(), orgId = randomUUID()
const sfx = Date.now().toString(36)
const balance = async () => Number((await one(`SELECT public.organiser_available_balance($1,'AUD') b`, [orgId])).b)

await client.connect()
try {
  await q('BEGIN')

  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4)',
    [owner, `owner_${sfx}@test.invalid`, actor, `actor_${sfx}@test.invalid`])
  await q(`INSERT INTO public.profiles (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email`,
    [owner, `owner_${sfx}@test.invalid`])
  await q(`INSERT INTO public.admin_users (id, role, display_name) VALUES ($1,'admin','E2E Payout Admin')`, [actor])
  await q(`INSERT INTO public.organisations (id, name, slug, owner_id, payout_status, stripe_account_id, stripe_account_country, hold_amount_cents, total_volume_cents)
           VALUES ($1,$2,$3,$4,'active','acct_e2e_test','AU',1840,0)`,
    [orgId, `E2E Payout Org ${sfx}`, `e2e-payout-${sfx}`, owner])

  // Sale ledger: order_confirmed +9200, reserve_hold -1840 -> available 7360.
  await q(`INSERT INTO public.organiser_balance_ledger (organisation_id, delta_cents, currency, reason, reference_type, reference_id)
           VALUES ($1, 9200,'AUD','order_confirmed','order',$2), ($1, -1840,'AUD','reserve_hold','hold',$3)`,
    [orgId, randomUUID(), randomUUID()])

  console.log('\n[balance]')
  assert(await balance() === 7360, 'authoritative available balance = 7360 (9200 credit - 1840 reserve hold)', await balance())

  console.log('\n[A] partial disburse 3000')
  const a = (await one(`SELECT public.disburse_payout($1,'AUD',3000,$2) r`, [orgId, actor])).r
  assert(a.success === true && Number(a.amount_cents) === 3000, 'disburse 3000 success', a)
  assert(Number(a.available_after_cents) === 4360, 'available_after = 4360', a.available_after_cents)
  assert(await balance() === 4360, 'balance now 4360 (payout debit recorded)', await balance())
  const payout1 = a.payout_id
  const p1 = await one(`SELECT amount_cents, status, initiated_by, stripe_payout_id FROM public.payouts WHERE id=$1`, [payout1])
  assert(Number(p1.amount_cents) === 3000 && p1.status === 'pending' && p1.initiated_by === actor && p1.stripe_payout_id === null,
    'payout row: pending, 3000, initiated_by actor, no stripe id yet', p1)

  console.log('\n[B] overpay refused')
  const b = (await one(`SELECT public.disburse_payout($1,'AUD',999999,$2) r`, [orgId, actor])).r
  assert(b.success === false && b.error === 'exceeds_available', 'overpay refused (exceeds_available)', b)
  assert(await balance() === 4360, 'balance unchanged after refused overpay', await balance())

  console.log('\n[C] full disburse remaining')
  const c = (await one(`SELECT public.disburse_payout($1,'AUD',NULL,$2) r`, [orgId, actor])).r
  assert(c.success === true && Number(c.amount_cents) === 4360 && Number(c.available_after_cents) === 0, 'full disburse 4360, available 0', c)
  assert(await balance() === 0, 'balance now 0', await balance())

  console.log('\n[D] nothing left to disburse')
  const d = (await one(`SELECT public.disburse_payout($1,'AUD',NULL,$2) r`, [orgId, actor])).r
  assert(d.success === false && d.error === 'nothing_to_disburse', 'nothing_to_disburse when balance 0', d)

  console.log('\n[E] void the first payout compensates the ledger')
  const e = (await one(`SELECT public.void_payout($1,'failed','e2e void') r`, [payout1])).r
  assert(e.success === true && e.reversed === true, 'void success/reversed', e)
  assert(await balance() === 3000, 'balance restored by 3000 after void', await balance())
  const p1b = await one(`SELECT status, reversed_at FROM public.payouts WHERE id=$1`, [payout1])
  assert(p1b.status === 'failed' && p1b.reversed_at !== null, 'payout marked failed + reversed_at set', p1b)

  console.log('\n[F] void is idempotent')
  const ledgerCountBefore = Number((await one(`SELECT count(*) c FROM public.organiser_balance_ledger WHERE organisation_id=$1`, [orgId])).c)
  const f = (await one(`SELECT public.void_payout($1,'failed') r`, [payout1])).r
  assert(f.success === true && f.already_reversed === true, 'second void returns already_reversed', f)
  const ledgerCountAfter = Number((await one(`SELECT count(*) c FROM public.organiser_balance_ledger WHERE organisation_id=$1`, [orgId])).c)
  assert(ledgerCountAfter === ledgerCountBefore, 'no new ledger row on idempotent void', { before: ledgerCountBefore, after: ledgerCountAfter })
  assert(await balance() === 3000, 'balance unchanged on idempotent void', await balance())

  console.log('\n[G] payouts-not-active guard')
  await q(`UPDATE public.organisations SET payout_status='on_hold' WHERE id=$1`, [orgId])
  const g = (await one(`SELECT public.disburse_payout($1,'AUD',1000,$2) r`, [orgId, actor])).r
  assert(g.success === false && g.error === 'payouts_not_active', 'disburse refused when payouts not active', g)

  await q('ROLLBACK')
  console.log('\n[cleanup] ROLLBACK complete - no fixture rows persisted')
} catch (err) {
  try { await q('ROLLBACK') } catch {}
  console.error('\nPAYOUT E2E ERROR:', err.message)
  fails.push('exception: ' + err.message)
} finally {
  await client.end()
}

console.log(`\n${'='.repeat(60)}`)
if (fails.length === 0) console.log('PAYOUT E2E: ALL ASSERTIONS PASSED (against real DB, rolled back)')
else { console.log(`PAYOUT E2E: ${fails.length} FAILURE(S):`); fails.forEach(f => console.log('  -', f)) }
process.exit(fails.length === 0 ? 0 : 1)
