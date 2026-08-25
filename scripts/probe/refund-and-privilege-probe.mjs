/**
 * READ-ONLY DATABASE PROBE: the live refund machinery and the live column grants.
 *
 * WHAT THIS ANSWERS, and why reading the migration files could not answer it.
 * A migration file is what somebody INTENDED. The catalogue is what the database
 * DOES. Three of the questions this probe exists for are questions where those
 * two are known to have diverged on this project:
 *
 *   1. WHICH reconcile_refund is live? Migration 20260621000005 carries the
 *      header "Apply to TEST/STAGING only (never production)", and its whole
 *      purpose was to restore an `::public.order_status` cast that 20260621000002
 *      dropped. Without that cast the function RAISES, the refund webhook returns
 *      non-2xx, and inventory never comes back. Whether production carries the
 *      broken body, the fixed body, or the older May body is not readable from
 *      the tree.
 *   2. What can `anon` actually SELECT? 20260808000010 revoked table-level SELECT
 *      on four tables and re-granted a narrow column list. An emergency grant was
 *      then run by hand to restore event pages. A hand-run GRANT leaves no file.
 *   3. Is a table-level SELECT present? That is the distinction that decides
 *      whether the column grants mean anything at all: a table-level SELECT
 *      covers every column, including columns added later, so it silently undoes
 *      a column-privilege design without touching it.
 *
 * IT WRITES NOTHING, AND THAT IS ENFORCED BY THE SERVER RATHER THAN PROMISED BY
 * THIS COMMENT. The connection is opened with `-c default_transaction_read_only=on`,
 * so Postgres itself rejects any INSERT/UPDATE/DELETE/DDL on this session with
 * error 25006, whatever this file asks for. Every statement additionally runs
 * inside `BEGIN ... READ ONLY` and the transaction is ROLLBACKed. There is no
 * write verb anywhere in the query set, and if one were added it would fail.
 *
 * `assertNotProductionDatabase` is deliberately NOT called. That preflight exists
 * to stop WRITE-capable scripts reaching production, and reading production is
 * this script's entire purpose. The protection here is that no write is
 * reachable, not that the target is forbidden. Compare
 * scripts/probe/prod-sale-gate-probe.mjs, which makes the same argument.
 *
 * IT NEVER PRINTS KEY MATERIAL. The database password is read to build the
 * client and is never logged. The project ref IS printed: src/lib/env/refs.mjs
 * documents it as non-secret (it is compiled into every production browser
 * bundle). Stripe account ids are printed in full because the founder asked for
 * them by id and they are not credentials; no Stripe KEY is read by this file.
 *
 * USAGE:
 *   node scripts/probe/refund-and-privilege-probe.mjs --env .env.test
 *   node scripts/probe/refund-and-privilege-probe.mjs --project test
 *   node scripts/probe/refund-and-privilege-probe.mjs --project prod   (approved)
 *
 * CONNECTION: through the shared helper, never assembled here. This file used to
 * carry its own copy of the connection parser and its own target-resolution
 * ladder; both now live once, in scripts/lib/db-credentials.mjs, which also
 * handles a percent-encoded password instead of failing as 28P01.
 */

import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const target = assertNotProductionDatabase()
const ref = target.ref

// SERVER-SIDE read-only enforcement, preserved from the hand-built config this
// replaced. Not advisory: Postgres raises 25006 ("cannot execute ... in a
// read-only transaction") on any write attempted on this session, so the
// no-write claim does not depend on the query list below staying honest.
const client = await target.connect({ readOnly: true })

const SCANNED = []
const scan = (what) => SCANNED.push(what)

const hr = (t) => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)

await client.connect()
try {
  await client.query('BEGIN READ ONLY')

  const meta = (await client.query(
    `select current_user, current_setting('transaction_read_only') as ro, version() as v`,
  )).rows[0]

  hr(`TARGET: project ${ref}  |  connected as ${meta.current_user}  |  transaction_read_only=${meta.ro}`)
  console.log(meta.v.split(' ').slice(0, 2).join(' '))
  if (meta.ro !== 'on') {
    console.error('\n[probe] REFUSING: the session is not read-only. Aborting before reading anything else.')
    process.exit(1)
  }

  // ---------------------------------------------------------------- 1
  hr('1. MIGRATION LEDGER (supabase_migrations.schema_migrations)')
  scan('supabase_migrations.schema_migrations for the 8 refund/lockdown versions')
  const WATCH = [
    '20260503000001', '20260531000001', '20260531000002', '20260531000003',
    '20260621000002', '20260621000005', '20260808000010', '20260815000001',
  ]
  const applied = (await client.query(
    `select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by version`,
    [WATCH],
  )).rows.map(r => r.version)
  for (const v of WATCH) {
    console.log(`  ${applied.includes(v) ? 'APPLIED    ' : 'NOT APPLIED'}  ${v}`)
  }
  const totals = (await client.query(
    `select count(*)::int as n, max(version) as newest from supabase_migrations.schema_migrations`,
  )).rows[0]
  console.log(`  -- ${totals.n} migrations applied in total; newest ${totals.newest}`)

  // ---------------------------------------------------------------- 2
  hr('2. LIVE REFUND FUNCTION BODIES (pg_get_functiondef)')
  scan('pg_proc bodies for reconcile_refund and create_refund_request')
  for (const fn of ['reconcile_refund', 'create_refund_request']) {
    const rows = (await client.query(
      `select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    )).rows
    if (rows.length === 0) {
      console.log(`  ${fn}: ABSENT from this database`)
      continue
    }
    for (const r of rows) {
      const def = r.def
      // The three markers that decide whether a refund restores inventory.
      const marks = {
        'decrements ticket_tiers.sold_count': /sold_count\s*=\s*GREATEST\(0,\s*tt\.sold_count\s*-/i.test(def),
        'order_status cast present (::public.order_status)': /::public\.order_status/.test(def),
        'event_id on ledger inserts': /event_id/.test(def),
        'voids tickets to refunded': /status\s*=\s*'refunded'/.test(def),
      }
      console.log(`  ${r.sig}`)
      for (const [k, v] of Object.entries(marks)) console.log(`      ${v ? 'YES' : 'NO '}  ${k}`)
      console.log(`      body length ${def.length} chars`)
    }
  }

  // ---------------------------------------------------------------- 3
  hr('3. TABLE-LEVEL SELECT held by anon / authenticated')
  scan('information_schema.table_privileges for anon+authenticated SELECT across public')
  // THE DECISIVE QUERY. A table-level SELECT covers EVERY column, present and
  // future, so its presence makes any column-privilege design inert.
  const tbl = (await client.query(
    `select grantee, table_name
       from information_schema.table_privileges
      where table_schema = 'public' and privilege_type = 'SELECT'
        and grantee in ('anon','authenticated')
      order by table_name, grantee`,
  )).rows
  const byGrantee = { anon: [], authenticated: [] }
  for (const r of tbl) byGrantee[r.grantee]?.push(r.table_name)
  const LOCKED = ['organisations', 'venues', 'seats', 'event_artists']
  for (const g of ['anon', 'authenticated']) {
    console.log(`  ${g}: table-level SELECT on ${byGrantee[g].length} tables in public`)
    const hits = LOCKED.filter(t => byGrantee[g].includes(t))
    console.log(`      of the 4 locked-down tables, table-level SELECT on: ${hits.length ? hits.join(', ') : 'NONE'}`)
  }

  // ---------------------------------------------------------------- 4
  hr('4. COLUMN-LEVEL SELECT on the 4 tables 20260808000010 narrowed')
  scan('has_column_privilege for every column of the 4 locked tables, both roles')
  for (const t of LOCKED) {
    const cols = (await client.query(
      `select a.attname as col,
              has_column_privilege('anon',          ('public.'||$1)::regclass, a.attname, 'SELECT') as anon_ok,
              has_column_privilege('authenticated', ('public.'||$1)::regclass, a.attname, 'SELECT') as auth_ok
         from pg_attribute a
        where a.attrelid = ('public.'||$1)::regclass and a.attnum > 0 and not a.attisdropped
        order by a.attnum`,
      [t],
    )).rows
    const anonYes = cols.filter(c => c.anon_ok).map(c => c.col)
    const anonNo = cols.filter(c => !c.anon_ok).map(c => c.col)
    console.log(`\n  public.${t}  (${cols.length} columns)`)
    console.log(`    anon CAN read (${anonYes.length}): ${anonYes.join(', ') || 'none'}`)
    console.log(`    anon CANNOT read (${anonNo.length}): ${anonNo.join(', ') || 'none'}`)
    const authNo = cols.filter(c => !c.auth_ok).map(c => c.col)
    console.log(`    authenticated CANNOT read (${authNo.length}): ${authNo.join(', ') || 'none'}`)
  }

  // ---------------------------------------------------------------- 5
  hr('5. ROW POLICIES on those 4 tables')
  scan('pg_policies for the 4 locked tables')
  const pol = (await client.query(
    `select tablename, policyname, cmd, roles::text, coalesce(qual,'(none)') as qual
       from pg_policies where schemaname='public' and tablename = any($1::text[])
      order by tablename, policyname`,
    [LOCKED],
  )).rows
  for (const p of pol) {
    console.log(`  ${p.tablename} :: ${p.policyname} [${p.cmd}] to ${p.roles}`)
    console.log(`      USING ${p.qual}`)
  }

  // ---------------------------------------------------------------- 6
  hr('6. REFUND STATE IN THIS DATABASE')
  scan('refunds, refund_tickets, orders-by-status, tickets-by-status counts')
  const rs = (await client.query(
    `select status, count(*)::int as n, coalesce(sum(amount_cents),0)::bigint as cents
       from public.refunds group by status order by status`,
  )).rows
  console.log(`  refunds by status: ${rs.length ? rs.map(r => `${r.status}=${r.n} (${r.cents}c)`).join('  ') : 'NO REFUND ROWS AT ALL'}`)
  const os = (await client.query(
    `select status, count(*)::int as n from public.orders group by status order by status`,
  )).rows
  console.log(`  orders by status:  ${os.map(r => `${r.status}=${r.n}`).join('  ') || 'none'}`)
  const ts = (await client.query(
    `select status, count(*)::int as n from public.tickets group by status order by status`,
  )).rows
  console.log(`  tickets by status: ${ts.map(r => `${r.status}=${r.n}`).join('  ') || 'none'}`)

  // The inventory-leak detector: a tier whose sold_count exceeds its live
  // admitting tickets has eaten seats. This is the number a refund bug produces.
  scan('ticket_tiers.sold_count versus live valid/scanned ticket counts (inventory drift)')
  const drift = (await client.query(
    `select tt.id, tt.name, tt.sold_count,
            (select count(*)::int from public.tickets t
              where t.ticket_tier_id = tt.id and t.status in ('valid','scanned')) as live_tickets
       from public.ticket_tiers tt
      where tt.sold_count <> (select count(*)::int from public.tickets t
                               where t.ticket_tier_id = tt.id and t.status in ('valid','scanned'))
      order by (tt.sold_count - (select count(*)::int from public.tickets t
                               where t.ticket_tier_id = tt.id and t.status in ('valid','scanned'))) desc
      limit 20`,
  )).rows
  if (drift.length === 0) {
    console.log('  inventory drift: NONE. Every tier sold_count equals its live valid/scanned ticket count.')
  } else {
    console.log(`  inventory drift on ${drift.length} tier(s) (showing up to 20):`)
    for (const d of drift) {
      console.log(`      ${d.name}  sold_count=${d.sold_count}  live_tickets=${d.live_tickets}  drift=${d.sold_count - d.live_tickets}`)
    }
  }

  // ---------------------------------------------------------------- 7
  hr('7. STRIPE CONNECT REFERENCES HELD BY organisations')
  scan('organisations.stripe_account_id and the Connect posture columns')
  const orgs = (await client.query(
    `select id, name, slug, stripe_account_id, stripe_account_country,
            stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete,
            status, created_at,
            (select count(*)::int from public.events e where e.organisation_id = o.id) as events,
            (select count(*)::int from public.orders od where od.organisation_id = o.id) as orders
       from public.organisations o
      where stripe_account_id is not null
      order by created_at`,
  )).rows
  console.log(`  ${orgs.length} organisation(s) carry a stripe_account_id:`)
  for (const o of orgs) {
    console.log(`      ${o.stripe_account_id}  ${o.name}  [${o.status}] country=${o.stripe_account_country ?? '-'} charges=${o.stripe_charges_enabled} payouts=${o.stripe_payouts_enabled} onboarded=${o.stripe_onboarding_complete} events=${o.events} orders=${o.orders} created=${String(o.created_at).slice(0, 10)}`)
  }
  const noAcct = (await client.query(
    `select count(*)::int as n from public.organisations where stripe_account_id is null`,
  )).rows[0]
  console.log(`  ${noAcct.n} organisation(s) carry NO stripe_account_id`)

  await client.query('ROLLBACK')
} finally {
  await client.end()
}

hr('WHAT THIS PROBE SCANNED')
SCANNED.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  target project: ${ref}`)
console.log('  writes attempted: 0 (session opened with default_transaction_read_only=on; BEGIN READ ONLY; ROLLBACK)')
