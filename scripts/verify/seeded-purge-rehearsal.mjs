/**
 * THE SEEDED-DATA PURGE. Complete removal, in dependency order, in one
 * transaction, with the row counts proved before and after.
 *
 * ============================================================================
 * IDENTIFICATION: THE OWNER, AND ONLY THE OWNER (founder ruling 15 August 2026)
 * ============================================================================
 *
 * The demo catalogue belongs to ONE synthetic seed account:
 *
 *     owner_id = 00000000-0000-4000-8000-000000000001
 *
 * an all-zeros UUID on an `eventlinqs.app` address, created the day the demo
 * catalogue was written, owning sixteen organisations and holding no Stripe
 * Connect account anywhere. Everything under that owner is demo content.
 *
 * TWO OTHER MARKERS WERE TRIED AND ARE BANNED. They are named here because each
 * one looks correct and each one destroys real data:
 *
 *   NEVER key on `is_seed_data`. On production the column is `false` on all 48
 *   rows, and that is the column DEFAULT rather than a measurement: migration
 *   20260628000001 added it `NOT NULL DEFAULT false` and the backfill that sets
 *   it true runs in the seeder under a TEST-only guard. Every production row
 *   predates the migration and inherited `false` regardless of what it is. A
 *   marker-keyed purge therefore matches ZERO rows on production and reports
 *   "nothing to do" over a database full of demo content.
 *
 *   NEVER key on the creation date. An earlier draft used
 *   `created_at::date = 2026-04-25`. Seven of the cohort carry events created on
 *   9 and 14 May as well, so a date test flags real organisations as demo and
 *   misses part of the cohort it was meant to catch.
 *
 *   NEVER key on "has no Connect account". That is the closest wrong answer and
 *   the most dangerous: it would match OANH, a genuine icloud.com signup from
 *   8 August 2026 who has listed nothing yet, and delete a real person's
 *   organisation. The whole reason the marker is the OWNER is to not do this.
 *
 * ============================================================================
 * EXPLICIT EXCLUSIONS, belt and braces
 * ============================================================================
 *
 * Keying on the owner already excludes both of the names below, because neither
 * is owned by the seed account. They are ALSO listed explicitly and asserted, so
 * that if the owner marker is ever wrong the run aborts instead of proceeding:
 *
 *   OANH           a real person. Never deleted by anything, ever.
 *   Party Pty Ltd  the founder's TEST organiser record, created with a made-up
 *                  name so a real card could go through a $1 checkout. It is NOT
 *                  a company and NOT EventLinqs' legal entity. It must survive
 *                  this purge because the $1 purchase lands on it; it is deleted
 *                  separately, by hand, after that purchase passes and is
 *                  refunded, together with its Connect account.
 *
 * ============================================================================
 * SAFETY
 * ============================================================================
 *
 * DRY RUN IS THE DEFAULT. Without `--commit` everything runs inside one
 * transaction and is rolled back, having printed every row it would remove.
 *
 * COMMITTING REQUIRES READING THE LIST. `--commit` alone is REFUSED. It must be
 * accompanied by `--confirm=<N>`, where N is the exact number of organisations
 * the dry run printed. The number cannot be supplied without having run the dry
 * run and read its output, which is the point: a purge should not be one
 * keystroke away from a tired person.
 *
 * Before committing, four invariants are asserted, and any failure rolls back:
 *
 *   1. Zero seed-owned events remain.
 *   2. No row anywhere was left orphaned by a SET NULL.
 *   3. THE REAL DATA IS UNTOUCHED. Events, orders and tickets NOT under the seed
 *      owner must have exactly the counts they started with.
 *   4. No excluded organisation was touched.
 *
 * WHAT AUTHORISES DELETION AT ALL. scripts/verify/seeded-order-forensics.mjs
 * establishes, per order, that every order behind a seeded event carries a
 * fixture identity and that its Stripe objects were created with a TEST-mode
 * key. It must print SAFE TO PURGE for the environment being purged, run against
 * THAT environment. This script does not re-derive that and does not assume it.
 *
 * ORDER MATTERS, AND SET NULL IS THE TRAP. Deleting an event does not delete
 * everything under it. Three relationships behave three different ways:
 *
 *   CASCADE     the child goes automatically.
 *   RESTRICT    the delete is REFUSED while children exist.
 *   SET NULL    THE CHILD SURVIVES with a null foreign key. Left alone this is
 *               the worst of the three because it is silent: measured on TEST it
 *               orphaned 1737 share_links, 104 ledger rows, 43 payout_holds and
 *               14 payouts, all pointing at nothing. Every SET NULL child is
 *               deleted EXPLICITLY, before its parent.
 *
 * The children are enumerated FROM THE LIVE SCHEMA, never from a hand-written
 * list, so a table added later cannot be silently missed.
 *
 * Usage:
 *   node --env-file=.env.test scripts/verify/seeded-purge-rehearsal.mjs
 *   node --env-file=.env.test scripts/verify/seeded-purge-rehearsal.mjs --commit --confirm=16
 */
import _pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

/** The one marker. Everything under this owner is demo content. */
const SEED_OWNER_ID = '00000000-0000-4000-8000-000000000001'

/**
 * Names that must never be removed by this script, checked by name AND slug so a
 * rename on one side does not slip past. Matching is case-insensitive and
 * whitespace-insensitive.
 */
const NEVER_DELETE = ['OANH', 'Party Pty Ltd']

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const NEVER_DELETE_NORM = new Set(NEVER_DELETE.map(norm))

/*
 * The POSTGRES preflight, and it matters most here, because this is the script
 * that DELETES. It connects over SUPABASE_DB_URL as the database owner, so that
 * connection string is what must be judged; `assertNotProduction()` judges
 * NEXT_PUBLIC_SUPABASE_URL, a different variable that can name TEST while the
 * connection string names production. The password is never printed.
 */
const target = assertNotProductionDatabase()

const COMMIT = process.argv.includes('--commit')
const confirmArg = process.argv.find(a => a.startsWith('--confirm='))
const CONFIRM = confirmArg ? Number.parseInt(confirmArg.split('=')[1], 10) : null

const db = await target.connect()

const q = async (sql, params) => (await db.query(sql, params)).rows
const exists = async t =>
  (await q(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [t])).length > 0

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
const orgSetNull = await childrenOf('organisations', 'SET NULL')
const orgCascade = await childrenOf('organisations', 'CASCADE')
const orgRestrict = await childrenOf('organisations', 'RESTRICT')

console.log('')
console.log('='.repeat(78))
console.log(`SEEDED PURGE ${COMMIT ? '(COMMIT REQUESTED)' : '(DRY RUN, will roll back)'}`)
console.log('='.repeat(78))
console.log(`Database   : ${target.ref}`)
console.log(`Keyed on   : organisations.owner_id = ${SEED_OWNER_ID}`)
console.log(`Never touch: ${NEVER_DELETE.join(', ')}`)
console.log('')
console.log('Dependency graph read from the live schema:')
console.log(`   events        : ${eventCascade.length} CASCADE, ${eventRestrict.length} RESTRICT, ${eventSetNull.length} SET NULL`)
console.log(`   orders        : ${orderCascade.length} CASCADE, ${orderRestrict.length} RESTRICT, ${orderSetNull.length} SET NULL`)
console.log(`   organisations : ${orgCascade.length} CASCADE, ${orgRestrict.length} RESTRICT, ${orgSetNull.length} SET NULL`)

const direct = [
  ...eventCascade, ...eventRestrict, ...eventSetNull,
  ...orderCascade, ...orderRestrict, ...orderSetNull,
  ...orgCascade, ...orgRestrict, ...orgSetNull,
].map(r => r.child)
const grand = []
for (const t of new Set(direct)) {
  for (const g of await childrenOf(t, 'CASCADE')) grand.push(g.child)
  for (const g of await childrenOf(t, 'SET NULL')) grand.push(g.child)
}
const WATCH = [...new Set(['events', 'orders', 'organisations', 'venues', ...direct, ...grand])].sort()

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

/**
 * THE REAL-DATA FINGERPRINT. "Real" means NOT under the seed owner, which is the
 * only definition consistent with the identification above. Proving the seeded
 * rows are gone does not prove a real row did not go with them, so the two are
 * counted separately and compared.
 */
async function realDataFingerprint() {
  const notSeed = `o.owner_id is distinct from '${SEED_OWNER_ID}'`
  return {
    realOrgs: (await q(`select count(*)::int n from public.organisations o where ${notSeed}`))[0].n,
    realEvents: (await q(
      `select count(*)::int n from public.events e
         join public.organisations o on o.id = e.organisation_id where ${notSeed}`))[0].n,
    realOrders: (await q(
      `select count(*)::int n from public.orders ord
         join public.events e on e.id = ord.event_id
         join public.organisations o on o.id = e.organisation_id where ${notSeed}`))[0].n,
    realTickets: (await q(
      `select count(*)::int n from public.tickets t
         join public.orders ord on ord.id = t.order_id
         join public.events e on e.id = ord.event_id
         join public.organisations o on o.id = e.organisation_id where ${notSeed}`))[0].n,
    excludedSurvive: (await q(
      `select count(*)::int n from public.organisations
        where lower(btrim(name)) = any($1::text[])`, [[...NEVER_DELETE_NORM]]))[0].n,
  }
}

// ---------------------------------------------------------------- the row list
const targetOrgs = await q(
  `select id, name, slug, stripe_account_id, stripe_charges_enabled, created_at
     from public.organisations where owner_id = $1 order by name`,
  [SEED_OWNER_ID],
)

console.log(`\n===== THE ROW LIST: ${targetOrgs.length} organisation(s) owned by the seed account =====`)
if (targetOrgs.length === 0) {
  console.log('   none. Nothing matches the owner marker on this database.')
}
for (const o of targetOrgs) {
  const evs = (await q(`select count(*)::int n from public.events where organisation_id = $1`, [o.id]))[0].n
  const ords = (await q(
    `select count(*)::int n from public.orders ord join public.events e on e.id = ord.event_id
      where e.organisation_id = $1`, [o.id]))[0].n
  console.log(
    `   ${String(o.name).padEnd(34)} events=${String(evs).padStart(4)} orders=${String(ords).padStart(4)}` +
      ` connect=${o.stripe_account_id ?? 'none'} created=${String(o.created_at).slice(0, 10)}`,
  )
}

// ------------------------------------------------------------ the hard refusals
const collisions = targetOrgs.filter(o => NEVER_DELETE_NORM.has(norm(o.name)) || NEVER_DELETE_NORM.has(norm(o.slug)))
if (collisions.length > 0) {
  console.error(
    `\nABORT. The owner marker matched an organisation on the never-delete list: ` +
      `${collisions.map(o => o.name).join(', ')}.\n` +
      `That means the marker is wrong, not that the exclusion should be relaxed. Nothing was changed.`,
  )
  await db.end()
  process.exit(1)
}

/*
 * CONNECT ACCOUNTS ARE HANDLED PER ORGANISATION, NOT BY ABORTING THE RUN.
 *
 * The first version of this refused the WHOLE purge if any seed-owned
 * organisation held a Connect account. Rehearsing on TEST proved that too blunt:
 * 24 of the 26 seed-owned organisations there share a single seeder-created
 * account, so the run aborted having deleted nothing, including the events,
 * which are the actual target and whose removal has nothing to do with Stripe.
 *
 * The correct split, and it follows the shape of the risk rather than the shape
 * of the query:
 *
 *   EVENTS AND ORDERS are purged for every seed-owned organisation. Deleting an
 *   event cannot orphan a Connect account, because no event names one.
 *
 *   THE ORGANISATION ROW is deleted ONLY when it holds no Connect account.
 *   Deleting a row that does hold one severs a live connected account from the
 *   only record naming it, which is worse than the empty profile page it would
 *   fix, and unwinding a Connect account is a deliberate Stripe-side job.
 *
 * Both sets are printed, so what was kept is visible rather than inferred.
 */
const orgsToDelete = targetOrgs.filter(o => !o.stripe_account_id)
const orgsKeptForConnect = targetOrgs.filter(o => o.stripe_account_id)
if (orgsKeptForConnect.length > 0) {
  const accounts = [...new Set(orgsKeptForConnect.map(o => o.stripe_account_id))]
  console.log(
    `\n   NOTE: ${orgsKeptForConnect.length} of these hold a Stripe Connect account ` +
      `(${accounts.length} distinct: ${accounts.join(', ')}).`,
  )
  console.log('   Their EVENTS AND ORDERS are purged; the organisation ROW is KEPT, because')
  console.log('   deleting it would orphan a live connected account. Unwind those on the')
  console.log('   Stripe side first, then re-run to remove the rows.')
}

if (targetOrgs.length === 0) {
  console.log('\nNothing to purge on this database. Exiting without opening a transaction.')
  await db.end()
  process.exit(0)
}

// ---------------------------------------------------------- the confirmation
if (COMMIT && CONFIRM !== targetOrgs.length) {
  console.error(
    `\nREFUSED. --commit requires --confirm=${targetOrgs.length}, matching the row list above.\n` +
      `   You passed: ${confirmArg ?? '(nothing)'}\n` +
      `   Read the list, then re-run:\n` +
      `       node --env-file=<env> scripts/verify/seeded-purge-rehearsal.mjs --commit --confirm=${targetOrgs.length}\n` +
      `   Nothing was changed.`,
  )
  await db.end()
  process.exit(1)
}

const before = await census('BEFORE')
const realBefore = await realDataFingerprint()
console.log(`\nREAL (non-seed-owner) fingerprint BEFORE: ${JSON.stringify(realBefore)}`)

const nullsBefore = {}
for (const { child, col } of [...eventSetNull, ...orderSetNull, ...orgSetNull]) {
  if (!(await exists(child))) continue
  nullsBefore[`${child}.${col}`] = (await q(`select count(*)::int n from public.${child} where ${col} is null`))[0].n
}

await db.query('begin')
let ok = true
const failures = []

const seededOrgs = `select id from public.organisations where owner_id = '${SEED_OWNER_ID}'`
const seededEvents = `select id from public.events where organisation_id in (${seededOrgs})`
const seededOrders = `select ord.id from public.orders ord where ord.event_id in (${seededEvents})`

try {
  const evCount = (await q(`select count(*)::int n from public.events where organisation_id in (${seededOrgs})`))[0].n
  console.log(`\n   ${targetOrgs.length} organisations, ${evCount} events identified by owner\n`)

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
  const delOrders = await db.query(`delete from public.orders where event_id in (${seededEvents})`)
  console.log(`           ${String(delOrders.rowCount).padStart(6)}  orders`)

  console.log(`   STEP 5  the events themselves (${eventCascade.length} cascade tables follow)`)
  /*
   * ONE STATEMENT, deliberately. events.parent_event_id is NO ACTION, and a NO
   * ACTION constraint is checked at the END of the statement rather than per
   * row, so a parent and its child both disappearing in the same statement is
   * legal. Deleting them in two statements would not be.
   */
  const delEvents = await db.query(`delete from public.events where organisation_id in (${seededOrgs})`)
  console.log(`           ${String(delEvents.rowCount).padStart(6)}  events`)

  /*
   * STEPS 6 AND 7 apply ONLY to the organisations that hold no Connect account.
   * The ones that do keep their row, and therefore keep their children, because
   * removing a child of a row that survives would leave the row half-emptied.
   */
  const deletableIds = orgsToDelete.map(o => o.id)
  if (deletableIds.length === 0) {
    console.log('   STEP 6  skipped: every seed-owned organisation holds a Connect account')
    console.log('   STEP 7  skipped: nothing safe to delete. Their events and orders are gone.')
  } else {
    console.log(`   STEP 6  SET NULL and RESTRICT children of the ${deletableIds.length} deletable ORGANISATIONS`)
    for (const { child, col } of orgSetNull) {
      if (!(await exists(child)) || child === 'events') continue
      const res = await db.query(`delete from public.${child} where ${col} = any($1::uuid[])`, [deletableIds])
      console.log(`           ${String(res.rowCount).padStart(6)}  ${child}.${col}  (SET NULL)`)
    }
    for (const { child, col } of orgRestrict) {
      if (!(await exists(child)) || child === 'events') continue
      const res = await db.query(`delete from public.${child} where ${col} = any($1::uuid[])`, [deletableIds])
      console.log(`           ${String(res.rowCount).padStart(6)}  ${child}.${col}  (RESTRICT)`)
    }

    /*
     * STEP 7. THE ORGANISATION ROWS. Leaving these behind is not the safe option,
     * it is a Law 5 defect: each keeps serving a live `/organisers/[handle]`
     * profile and stays in the sitemap, so the purge would otherwise trade a
     * catalogue of demo events for a set of indexed pages with nothing on them.
     * Only the Connect-free ones are removed; see the note above the transaction.
     */
    console.log('   STEP 7  the organisation rows that hold no Connect account')
    const delOrgs = await db.query(`delete from public.organisations where id = any($1::uuid[])`, [deletableIds])
    console.log(`           ${String(delOrgs.rowCount).padStart(6)}  organisations`)
  }

  // ---------------------------------------------------------------- assertions
  console.log('\n   ASSERTIONS')

  const leftEvents = (await q(`select count(*)::int n from public.events where organisation_id in (${seededOrgs})`))[0].n
  const leftOrgs = (await q(`select count(*)::int n from public.organisations where owner_id = $1`, [SEED_OWNER_ID]))[0].n
  /*
   * The expected survivor count is the Connect-holding set, NOT zero. This
   * assertion demanded zero when it was written, which was correct while the
   * script deleted every seed-owned organisation unconditionally. It became
   * wrong the moment Connect-holding rows were deliberately kept, and it failed
   * the whole rehearsal on TEST over 24 rows the script had decided on purpose
   * not to touch. Asserting the DECISION rather than a constant is what makes
   * this check mean something on both databases: on production the seed owner
   * holds no Connect account, so the expectation there is zero and this same
   * line enforces it.
   */
  const expectedOrgsLeft = orgsKeptForConnect.length
  console.log(`           seed-owned events remaining       : ${leftEvents} (must be 0)`)
  console.log(
    `           seed-owned organisations remaining: ${leftOrgs} ` +
      `(must be ${expectedOrgsLeft}, the Connect-holding rows kept on purpose)`,
  )
  if (leftEvents !== 0) failures.push(`${leftEvents} seed-owned events survived`)
  if (leftOrgs !== expectedOrgsLeft) {
    failures.push(`seed-owned organisations remaining is ${leftOrgs}, expected ${expectedOrgsLeft}`)
  }

  for (const { child, col } of [...eventSetNull, ...orderSetNull, ...orgSetNull]) {
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

  const survivors = await q(
    `select name from public.organisations where lower(btrim(name)) = any($1::text[]) order by name`,
    [[...NEVER_DELETE_NORM]],
  )
  console.log(`           never-delete list still present   : ${survivors.map(s => s.name).join(', ') || '(none present on this DB)'}`)
  if (failures.length === 0) console.log('           real data untouched: confirmed')

  /*
   * VENUES are reported, not deleted. They carry no owner_id, so the owner
   * marker cannot reach them and no other marker here is trustworthy enough to
   * delete by. Production holds zero venues, so this is a TEST-only remainder.
   */
  const orphanVenues = (await q(`
    select count(*)::int n from public.venues v
     where not exists (select 1 from public.events e where e.venue_id = v.id)`))[0].n
  console.log('\n   NOT REMOVED BY THIS PURGE, and reported rather than hidden:')
  console.log(`           venues with zero events after it: ${orphanVenues}`)
  console.log('           Venues carry no owner_id, so the owner marker cannot reach them and')
  console.log('           no other marker is safe enough to delete by. Production holds zero.')

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
    console.log(`\n=== ROLLED BACK ${ok ? '(dry run: pass --commit --confirm=<N> to apply)' : '(because it failed)'} ===`)
  }
}

const after = await census('AFTER')
const drift = Object.keys(before).filter(t => before[t] !== after[t])
console.log(`\ntables whose count changed on disk: ${drift.length === 0 ? 'none' : drift.map(t => `${t} ${before[t]}->${after[t]}`).join(', ')}`)
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL')
await db.end()
process.exit(ok ? 0 : 1)
