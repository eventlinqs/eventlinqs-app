/**
 * THE SEEDED-DATA PURGE. Complete removal, in dependency order, in one
 * transaction, with the row counts proved before and after.
 *
 * THE RULING THIS IMPLEMENTS (founder, 14 August 2026): seeded rows are removed
 * completely, not hidden. Setting them draft and private was rejected, and
 * rightly. A hidden row is still in the database, still joins to payouts and
 * ledgers, still appears in any query that forgets the filter, and still has to
 * be explained to whoever audits the books later. "Not visible" is not "not
 * there".
 *
 * WHAT AUTHORISES DELETION HERE, and it is NOT a general principle.
 * scripts/verify/seeded-order-forensics.mjs establishes, per order, that every
 * order behind a seeded event carries a fixture identity and that its Stripe
 * objects were created with a TEST-mode key. That script must print SAFE TO
 * PURGE for the environment being purged, and it must be run against THAT
 * environment: a TEST result says nothing about production. This script does not
 * re-derive that finding and does not assume it.
 *
 * ORDER MATTERS, AND SET NULL IS THE TRAP. Deleting an event does not delete
 * everything under it. Three relationships behave three different ways:
 *
 *   CASCADE     the child goes automatically. 17 tables under events.
 *   RESTRICT    the delete is REFUSED while children exist. orders under events;
 *               payments, refunds and community_contributions under orders. This
 *               is what made the earlier runbook impossible to complete: it tried
 *               to delete the parent first and Postgres simply said no.
 *   SET NULL    THE CHILD SURVIVES with a null foreign key. Ten tables under
 *               events and four under orders. Left alone this is the WORST
 *               outcome of the three, because it is silent: measured on TEST it
 *               orphaned 1737 share_links, 104 organiser_balance_ledger rows, 43
 *               payout_holds and 14 payouts, all pointing at nothing. Seeded
 *               financial debris in a live ledger is exactly what this purge
 *               exists to remove, so every SET NULL child is deleted EXPLICITLY,
 *               before its parent.
 *
 * The SET NULL children are enumerated FROM THE LIVE SCHEMA rather than from a
 * hand-written list, so a table added later cannot be silently missed. A previous
 * version of this file carried a hardcoded list of nine and was missing all four
 * of the ORDER-side ones (share_link_events, organiser_marketing_consents,
 * venue_share_ledger, squad_members).
 *
 * SAFETY. Everything runs inside one transaction and is ROLLED BACK unless
 * --commit is passed. Before committing, three invariants are asserted, and any
 * failure rolls back:
 *
 *   1. Zero seeded events remain.
 *   2. No row anywhere was left orphaned by a SET NULL.
 *   3. THE REAL DATA IS UNTOUCHED. Orders on non-seeded events, and the
 *      non-seeded events themselves, must have exactly the counts they started
 *      with. A purge that quietly took a real row with it is a catastrophe, and
 *      "the seeded rows are gone" does not prove it did not happen.
 *
 * Usage:
 *   node --env-file=.env.test scripts/verify/seeded-purge-rehearsal.mjs
 *   node --env-file=.env.test scripts/verify/seeded-purge-rehearsal.mjs --commit
 */
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

/*
 * The POSTGRES preflight, and it matters most here, because this is the script
 * that DELETES. It connects over SUPABASE_DB_URL as the database owner, so that
 * connection string is what must be judged; `assertNotProduction()` judges
 * NEXT_PUBLIC_SUPABASE_URL, a different variable that can name TEST while the
 * connection string names production. The shared parser hands pg discrete fields
 * because the password is not percent-encoded. The password is never printed.
 */
const target = assertNotProductionDatabase()

const COMMIT = process.argv.includes('--commit')

const db = new pg.Client(target.clientConfig)
await db.connect()

const q = async (sql, params) => (await db.query(sql, params)).rows
const exists = async t =>
  (await q(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [t])).length > 0

/**
 * Children of `parent` with the given delete rule, read from the live schema.
 * Nothing here is hardcoded, so a table added tomorrow is handled tomorrow.
 */
async function childrenOf(parent, rule) {
  return q(
    `select distinct tc.table_name as child, kcu.column_name as col
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
        and rc.delete_rule = $2
      order by tc.table_name`,
    [parent, rule],
  )
}

const eventSetNull = await childrenOf('events', 'SET NULL')
const orderSetNull = await childrenOf('orders', 'SET NULL')
const eventCascade = await childrenOf('events', 'CASCADE')
const orderCascade = await childrenOf('orders', 'CASCADE')
const eventRestrict = await childrenOf('events', 'RESTRICT')
const orderRestrict = await childrenOf('orders', 'RESTRICT')

console.log('')
console.log('='.repeat(78))
console.log(`SEEDED PURGE ${COMMIT ? '(COMMIT)' : '(REHEARSAL, will roll back)'}`)
console.log('='.repeat(78))
console.log(`Database: ${target.ref}`)
console.log('')
console.log('Dependency graph read from the live schema:')
console.log(`   events   : ${eventCascade.length} CASCADE, ${eventRestrict.length} RESTRICT, ${eventSetNull.length} SET NULL`)
console.log(`   orders   : ${orderCascade.length} CASCADE, ${orderRestrict.length} RESTRICT, ${orderSetNull.length} SET NULL`)
console.log(`   SET NULL under events: ${eventSetNull.map(r => r.child).join(', ')}`)
console.log(`   SET NULL under orders: ${orderSetNull.map(r => r.child).join(', ')}`)

/**
 * EVERY table this purge can touch, derived rather than listed: events, orders,
 * every direct child of either, and every child of THOSE (refund_tickets under
 * refunds, share_link_events under share_links, squad_members under squads).
 * The brief is row counts for every table touched, so the list is built to be
 * complete by construction instead of by memory.
 */
const direct = [...eventCascade, ...eventRestrict, ...eventSetNull, ...orderCascade, ...orderRestrict, ...orderSetNull].map(r => r.child)
const grand = []
for (const t of new Set(direct)) {
  for (const g of await childrenOf(t, 'CASCADE')) grand.push(g.child)
  for (const g of await childrenOf(t, 'SET NULL')) grand.push(g.child)
}
const WATCH = [...new Set(['events', 'orders', ...direct, ...grand])].sort()

async function census(tag) {
  const out = {}
  for (const t of WATCH) {
    if (!(await exists(t))) continue
    out[t] = (await q(`select count(*)::int n from public.${t}`))[0].n
  }
  console.log(`\n===== CENSUS ${tag} (${Object.keys(out).length} tables) =====`)
  for (const [t, n] of Object.entries(out)) console.log(`   ${t.padEnd(34)} ${String(n).padStart(6)}`)
  return out
}

/** The invariants that must hold for the purge to be committed. */
async function realDataFingerprint() {
  return {
    realEvents: (await q(`select count(*)::int n from public.events where is_seed_data = false`))[0].n,
    realOrders: (await q(
      `select count(*)::int n from public.orders o join public.events e on e.id = o.event_id
        where e.is_seed_data = false`))[0].n,
    realTickets: (await q(
      `select count(*)::int n from public.tickets t
         join public.orders o on o.id = t.order_id
         join public.events e on e.id = o.event_id
        where e.is_seed_data = false`))[0].n,
  }
}

const before = await census('BEFORE')
const realBefore = await realDataFingerprint()
console.log(`\nREAL (non-seeded) fingerprint BEFORE: ${JSON.stringify(realBefore)}`)

/** Null foreign keys BEFORE the purge, so a NEW orphan can be told from an old one. */
const nullsBefore = {}
for (const { child, col } of [...eventSetNull, ...orderSetNull]) {
  if (!(await exists(child))) continue
  nullsBefore[`${child}.${col}`] = (await q(`select count(*)::int n from public.${child} where ${col} is null`))[0].n
}

await db.query('begin')
let ok = true
const failures = []

try {
  const seededCount = (await q(`select count(*)::int n from public.events where is_seed_data = true`))[0].n
  console.log(`\n   ${seededCount} seeded events identified\n`)
  if (seededCount === 0) throw new Error('no seeded events found; nothing to do')

  const seededEvents = `select id from public.events where is_seed_data = true`
  const seededOrders = `select o.id from public.orders o join public.events e on e.id = o.event_id where e.is_seed_data = true`

  console.log('   STEP 1  SET NULL children of ORDERS, removed before the orders')
  for (const { child, col } of orderSetNull) {
    if (!(await exists(child))) { console.log(`           ${child}: table absent, skipped`); continue }
    const res = await db.query(`delete from public.${child} where ${col} in (${seededOrders})`)
    console.log(`           ${String(res.rowCount).padStart(6)}  ${child}.${col}`)
  }

  console.log('   STEP 2  SET NULL children of EVENTS, removed before the events')
  for (const { child, col } of eventSetNull) {
    if (!(await exists(child))) { console.log(`           ${child}: table absent, skipped`); continue }
    const res = await db.query(`delete from public.${child} where ${col} in (${seededEvents})`)
    console.log(`           ${String(res.rowCount).padStart(6)}  ${child}.${col}`)
  }

  console.log('   STEP 3  RESTRICT children of ORDERS (refund_tickets cascades from refunds)')
  for (const { child, col } of orderRestrict) {
    if (!(await exists(child))) { console.log(`           ${child}: table absent, skipped`); continue }
    const res = await db.query(`delete from public.${child} where ${col} in (${seededOrders})`)
    console.log(`           ${String(res.rowCount).padStart(6)}  ${child}.${col}`)
  }

  console.log('   STEP 4  the orders themselves (tickets, order_items, discount_code_usages cascade)')
  const delOrders = await db.query(
    `delete from public.orders o using public.events e
      where o.event_id = e.id and e.is_seed_data = true`)
  console.log(`           ${String(delOrders.rowCount).padStart(6)}  orders`)

  console.log(`   STEP 5  the seeded events themselves (${eventCascade.length} cascade tables follow)`)
  /*
   * ONE STATEMENT, deliberately. events.parent_event_id is NO ACTION, and a NO
   * ACTION constraint is checked at the END of the statement rather than per
   * row, so a parent and its child both disappearing in the same statement is
   * legal. Deleting them in two statements would not be.
   */
  const delEvents = await db.query(`delete from public.events where is_seed_data = true`)
  console.log(`           ${String(delEvents.rowCount).padStart(6)}  events`)

  // ---------------------------------------------------------------- assertions
  console.log('\n   ASSERTIONS')

  const left = (await q(`select count(*)::int n from public.events where is_seed_data = true`))[0].n
  console.log(`           seeded events remaining: ${left} (must be 0)`)
  if (left !== 0) failures.push(`${left} seeded events survived`)

  /*
   * ORPHANS THE PURGE ITSELF CREATED, which is the only kind that matters.
   * A null foreign key here is not automatically wrong: share_links legitimately
   * carries nulls from before this ran. What would be wrong is a null that did
   * NOT exist beforehand, because that is a row this purge severed from its
   * parent instead of removing. So the counts are compared, not just printed.
   */
  for (const { child, col } of [...eventSetNull, ...orderSetNull]) {
    if (!(await exists(child))) continue
    const now = (await q(`select count(*)::int n from public.${child} where ${col} is null`))[0].n
    const was = nullsBefore[`${child}.${col}`] ?? 0
    if (now > was) {
      failures.push(`ORPHANED: ${child}.${col} gained ${now - was} null row(s) (${was} -> ${now})`)
      console.log(`           ${child}.${col}: ${was} -> ${now} nulls  <-- ORPHANED BY THIS PURGE`)
    } else if (now > 0) {
      console.log(`           ${child}.${col}: ${now} null(s), unchanged and pre-existing`)
    }
  }

  const realAfter = await realDataFingerprint()
  console.log(`           REAL fingerprint AFTER : ${JSON.stringify(realAfter)}`)
  for (const k of Object.keys(realBefore)) {
    if (realBefore[k] !== realAfter[k]) failures.push(`REAL DATA CHANGED: ${k} went ${realBefore[k]} -> ${realAfter[k]}`)
  }
  if (failures.length === 0) console.log('           real data untouched: confirmed')

  /*
   * WHAT THIS PURGE DELIBERATELY DOES NOT REMOVE, reported rather than hidden.
   *
   * Deleting the events does not delete the ORGANISATIONS or VENUES the seeder
   * created for them. Those rows survive with zero events, and on production the
   * organiser profile page and the sitemap both read `organisations` and
   * `venues` independently of `events`, so each one becomes a live, indexed page
   * with nothing on it.
   *
   * THEY ARE NOT DELETED HERE, and the reason is a measured fact rather than
   * caution: on TEST, 31 of the 33 affected organisations hold a
   * `stripe_account_id` with `stripe_charges_enabled` true, and all 33 have an
   * `owner_id` pointing at a real user. Deleting the row does NOT delete the
   * Stripe Connect account: it orphans a live connected account from the only
   * record that names it. That is a worse outcome than the empty page, and it is
   * a Stripe-side operation that has to be done deliberately, not a side effect
   * of a database delete.
   *
   * So this counts them and says so. Removing them is a separate decision with a
   * separate procedure. Reported, never quietly left.
   */
  const orphanOrgs = (await q(`
    select count(*)::int n from public.organisations o
     where not exists (select 1 from public.events e where e.organisation_id = o.id)`))[0].n
  const orphanVenues = (await q(`
    select count(*)::int n from public.venues v
     where not exists (select 1 from public.events e where e.venue_id = v.id)`))[0].n
  console.log('\n   NOT REMOVED BY THIS PURGE, and reported rather than hidden:')
  console.log(`           organisations with zero events after it: ${orphanOrgs}`)
  console.log(`           venues with zero events after it       : ${orphanVenues}`)
  console.log('           These keep serving a live profile page and stay in the sitemap.')
  console.log('           Most hold a live Stripe Connect account, so deleting the row would')
  console.log('           orphan that account. Removing them is a separate, deliberate job.')

  await census('AFTER the purge, inside the transaction')

  if (failures.length > 0) throw new Error(failures.join('; '))
} catch (err) {
  ok = false
  console.error(`\n   PURGE FAILED: ${err.message}`)
} finally {
  if (COMMIT && ok) {
    await db.query('commit')
    console.log('\n=== COMMITTED ===')
  } else {
    await db.query('rollback')
    console.log(`\n=== ROLLED BACK ${ok ? '(rehearsal: pass --commit to apply)' : '(because it failed)'} ===`)
  }
}

const after = await census('AFTER')
const drift = Object.keys(before).filter(t => before[t] !== after[t])
console.log(`\ntables whose count changed on disk: ${drift.length === 0 ? 'none' : drift.map(t => `${t} ${before[t]}->${after[t]}`).join(', ')}`)
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL')
await db.end()
process.exit(ok ? 0 : 1)
