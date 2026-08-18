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
 *   node scripts/probe/refund-and-privilege-probe.mjs --env <production env file>
 *
 * It resolves the Postgres target in this order:
 *   SUPABASE_DB_URL                (the pooler shape .env.test uses)
 *   SUPABASE_DB_PASSWORD_SYDNEY    (+ the ref from NEXT_PUBLIC_SUPABASE_URL)
 * With neither, it refuses rather than guess a host.
 */

import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}

const ENV_FILE = arg('--env')
if (!ENV_FILE) {
  console.error('usage: --env <env file>')
  process.exit(2)
}
if (!existsSync(ENV_FILE)) {
  console.error(`[probe] env file not found: ${ENV_FILE}`)
  process.exit(2)
}

// Minimal env reader, matching the shape the repo's other scripts parse. dotenv
// is not imported so this cannot mutate process.env for anything downstream.
const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}

/**
 * The password is not percent-encoded in this repo's stored values, so the
 * connection string is hand-split on the two positional rules that survive an
 * unescaped password: the LAST `@` separates credentials from host, and the
 * FIRST `:` inside the credentials separates user from password. Handing pg a
 * `connectionString` instead makes it throw ERR_INVALID_URL while printing the
 * input as `*****REDACTED*****`, which reads like an unset value rather than a
 * parse failure. Same reasoning as scripts/lib/production-write-preflight.mjs.
 */
function fromConnectionString(raw) {
  const s = String(raw).trim().replace(/^["']|["']$/g, '')
  const schemeEnd = s.indexOf('://')
  const at = s.lastIndexOf('@')
  if (schemeEnd === -1 || at === -1 || at < schemeEnd) return null
  const creds = s.slice(schemeEnd + 3, at)
  const sep = creds.indexOf(':')
  const tail = s.slice(at + 1)
  const cut = tail.search(/[/?]/)
  const hostPort = cut === -1 ? tail : tail.slice(0, cut)
  const colon = hostPort.indexOf(':')
  return {
    user: sep === -1 ? creds : creds.slice(0, sep),
    password: sep === -1 ? '' : creds.slice(sep + 1),
    host: colon === -1 ? hostPort : hostPort.slice(0, colon),
    port: Number(colon === -1 ? 5432 : hostPort.slice(colon + 1)),
    database: 'postgres',
  }
}

const refFromUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || ''

let parts = null
if (env.SUPABASE_DB_URL) {
  parts = fromConnectionString(env.SUPABASE_DB_URL)
} else if (env.SUPABASE_DB_PASSWORD_SYDNEY && refFromUrl) {
  // The shared pooler shape. The host identifies no project; the USERNAME does.
  parts = {
    user: `postgres.${refFromUrl}`,
    password: env.SUPABASE_DB_PASSWORD_SYDNEY,
    host: 'aws-1-ap-southeast-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
  }
}

if (!parts || !parts.host || !parts.password) {
  console.error('[probe] no Postgres target resolvable from this env file.')
  console.error('[probe] set SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD_SYDNEY plus NEXT_PUBLIC_SUPABASE_URL.')
  process.exit(2)
}

// The ref lives in the host on a direct connection and in the username on the
// pooler. Read both so the probe can always NAME what it connected to.
const ref =
  parts.host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1] ||
  parts.user.match(/^postgres\.([a-z0-9]+)$/i)?.[1] ||
  refFromUrl ||
  'UNKNOWN'

const client = new pg.Client({
  user: parts.user,
  password: parts.password,
  host: parts.host,
  port: parts.port,
  database: parts.database,
  ssl: { rejectUnauthorized: false },
  // SERVER-SIDE read-only enforcement. Not advisory: Postgres raises 25006
  // ("cannot execute ... in a read-only transaction") on any write attempted on
  // this session, so the no-write claim above does not depend on this file's
  // query list staying honest.
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 15000,
})

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
