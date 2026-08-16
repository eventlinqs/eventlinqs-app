/**
 * The full dependency graph beneath a seeded event, and the money question.
 *
 * TWO JOBS.
 *
 * 1. WHERE IS STRIPE? `orders` has no payment-intent column, so before anything
 *    is deleted this establishes whether a Stripe identifier exists ANYWHERE for
 *    these rows. "No payment intent on orders" is not the same as "no money",
 *    and the difference is the whole ruling.
 *
 * 2. THE CORRECT DELETION ORDER. Every foreign key pointing at events or at
 *    orders, with its delete rule, so a clean removal can be written that takes
 *    dependents out in the right sequence instead of hiding the parent when a
 *    constraint refuses.
 *
 * READ ONLY.
 * Usage: node --env-file=.env.test scripts/verify/seeded-dependency-map.mjs
 */
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

/*
 * The POSTGRES preflight, and the shared connection parser. See the same note in
 * seeded-order-forensics.mjs: this connects over SUPABASE_DB_URL as the database
 * owner, so SUPABASE_DB_URL is the target that must be judged, and the parser
 * lives once rather than four times.
 */
const target = assertNotProductionDatabase()
const db = new pg.Client(target.clientConfig)
await db.connect()

// ---------------------------------------------------------------- 1. Stripe
console.log('===== ANY STRIPE IDENTIFIER ON A SEEDED ORDER? =====')
const stripeCols = await db.query(`
  select table_name, column_name
    from information_schema.columns
   where table_schema = 'public'
     and (column_name ilike '%stripe%' or column_name ilike '%payment_intent%'
          or column_name ilike '%charge_id%')
   order by table_name, column_name`)
console.log(`columns anywhere that look like Stripe identifiers: ${stripeCols.rowCount}`)
for (const r of stripeCols.rows) console.log(`   ${r.table_name}.${r.column_name}`)

// orders.metadata may carry one as JSON.
const meta = await db.query(`
  select count(*)::int as n
    from public.orders o join public.events e on e.id = o.event_id
   where e.is_seed_data = true
     and o.metadata::text ilike '%pi_%'`)
console.log(`\nseeded orders whose metadata mentions a pi_ identifier: ${meta.rows[0].n}`)

const anyPaid = await db.query(`
  select count(*)::int as n
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.events e on e.id = o.event_id
   where e.is_seed_data = true`).catch(() => ({ rows: [{ n: 'payments table does not exist' }] }))
console.log(`payments rows tied to seeded events: ${anyPaid.rows[0].n}`)

// ------------------------------------------------- 2. The dependency graph
async function dependents(target) {
  const { rows } = await db.query(
    `select tc.table_name  as child_table,
            kcu.column_name as child_column,
            rc.delete_rule
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name
       join information_schema.referential_constraints rc
         on rc.constraint_name = tc.constraint_name
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_name = $1
      order by rc.delete_rule, tc.table_name`,
    [target],
  )
  return rows
}

for (const parent of ['events', 'orders']) {
  const rows = await dependents(parent)
  console.log(`\n===== FOREIGN KEYS POINTING AT ${parent} (${rows.length}) =====`)
  for (const r of rows) {
    const mark = r.delete_rule === 'CASCADE' ? '  (auto)' : '  <-- MUST BE HANDLED'
    console.log(`   ${r.child_table}.${r.child_column}`.padEnd(52) + r.delete_rule + mark)
  }
}

// How many rows actually exist for the blocking ones, tied to seeded events.
console.log('\n===== ROWS THAT WOULD BLOCK A SEEDED-EVENT DELETE =====')
const blocking = [
  ['orders', 'select count(*)::int n from public.orders o join public.events e on e.id=o.event_id where e.is_seed_data'],
  ['tickets', 'select count(*)::int n from public.tickets t join public.orders o on o.id=t.order_id join public.events e on e.id=o.event_id where e.is_seed_data'],
  ['refunds', 'select count(*)::int n from public.refunds r join public.orders o on o.id=r.order_id join public.events e on e.id=o.event_id where e.is_seed_data'],
]
for (const [name, sql] of blocking) {
  try {
    const { rows } = await db.query(sql)
    console.log(`   ${name.padEnd(12)} ${rows[0].n}`)
  } catch (err) {
    console.log(`   ${name.padEnd(12)} could not count: ${err.message.split('\n')[0]}`)
  }
}

await db.end()
