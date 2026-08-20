/**
 * Remove the TEST fixtures the refund proofs created.
 *
 * The proofs deliberately LEAVE their fixtures behind, because a fixture carrying
 * a real order and a real refund is the evidence for the report. Once the report
 * is read they are residue, and residue on TEST is not harmless: the seeded-data
 * purge has to reason about every organisation with zero events, and an
 * accumulating pile of proof organisations makes that harder every time.
 *
 * Scoped by the `refund-proof-presents-%` slug, so it can only reach fixtures this
 * harness created. It reports what it will remove BEFORE removing it, and requires
 * --commit to act, so a mistaken invocation prints instead of deleting.
 *
 * TEST ONLY: guarded by the preflight before any client is built.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-fixture-cleanup.mjs
 *   node --env-file=.env.test scripts/verify/refund-fixture-cleanup.mjs --commit
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { purgeFixtures } from './lib/refund-proof-fixture.mjs'

assertNotProduction({ envFile: '.env.test' })

const COMMIT = process.argv.includes('--commit')
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !SVC) { console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

const log = (...a) => console.log('[fixture-cleanup]', ...a)

// ---- What is there, before touching anything ------------------------------
const { data: orgs } = await db
  .from('organisations')
  .select('id, slug, owner_id')
  .like('slug', 'refund-proof-presents-%')

console.log(`\nrefund-proof fixtures on TEST: ${orgs?.length ?? 0}`)
let totalEvents = 0
let totalOrders = 0
let totalTickets = 0
let totalRefunds = 0
for (const org of orgs ?? []) {
  const { data: events } = await db.from('events').select('id, slug').eq('organisation_id', org.id)
  const eventIds = (events ?? []).map(e => e.id)
  let orders = []
  if (eventIds.length) {
    const { data } = await db.from('orders').select('id, order_number, status').in('event_id', eventIds)
    orders = data ?? []
  }
  const orderIds = orders.map(o => o.id)
  const { count: tickets } = orderIds.length
    ? await db.from('tickets').select('id', { count: 'exact', head: true }).in('order_id', orderIds)
    : { count: 0 }
  const { count: refunds } = orderIds.length
    ? await db.from('refunds').select('id', { count: 'exact', head: true }).in('order_id', orderIds)
    : { count: 0 }

  totalEvents += eventIds.length
  totalOrders += orders.length
  totalTickets += tickets ?? 0
  totalRefunds += refunds ?? 0

  console.log(`  ${org.slug}`)
  console.log(`      events ${eventIds.length}  orders ${orders.length} (${orders.map(o => `${o.order_number}=${o.status}`).join(', ') || 'none'})`)
  console.log(`      tickets ${tickets ?? 0}  refunds ${refunds ?? 0}`)
}
console.log(`\n  totals: ${totalEvents} event(s), ${totalOrders} order(s), ${totalTickets} ticket(s), ${totalRefunds} refund(s)`)

// The Stripe objects are NOT deleted and cannot be: a test-mode charge and its
// refunds stay in the Stripe sandbox as history. Said out loud so nobody assumes
// this leaves no trace anywhere.
console.log('\n  NOTE: the Stripe test-mode charges and refunds are NOT removed by this.')
console.log('  They remain in the sandbox account as history and cost nothing.')

if (!COMMIT) {
  console.log('\n  DRY RUN. Nothing was deleted. Re-run with --commit to remove the above.\n')
  process.exit(0)
}

const { removed, errors } = await purgeFixtures(db, log)

// ---- Confirm by RE-READING, never by trusting the return value -------------
// The first version of this reported "removed 4; 4 remaining" and exited 0 on the
// second number because it printed both without comparing them. The verdict is now
// the re-read, and a non-empty error list fails the run outright.
const { data: left } = await db
  .from('organisations')
  .select('id, slug')
  .like('slug', 'refund-proof-presents-%')
const remaining = left?.length ?? 0

console.log(`\n  attempted ${removed} fixture(s); ${remaining} organisation(s) remaining`)
if (remaining > 0) {
  for (const l of left ?? []) console.log(`      STILL PRESENT: ${l.slug}`)
}
if (errors.length > 0) {
  console.log(`\n  ${errors.length} delete(s) errored, listed above. Nothing is assumed clean.`)
}
console.log(`\n  ${remaining === 0 && errors.length === 0
  ? 'CLEAN: no refund-proof fixture remains on TEST.'
  : 'NOT CLEAN. See the errors above.'}`)
process.exitCode = remaining === 0 && errors.length === 0 ? 0 : 2
