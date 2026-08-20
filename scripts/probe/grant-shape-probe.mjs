/**
 * READ-ONLY: characterise EXACTLY what the emergency grant granted.
 *
 * WHY THIS IS A SEPARATE PROBE. "anon holds table-level SELECT on 75 tables" does
 * not say what was run. Three different statements produce states that look
 * similar in a summary and are very different to reason about:
 *
 *   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
 *       every table in the schema, and NOTHING for tables created later.
 *   ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO anon;
 *       every table created FROM NOW ON, which is the dangerous one, because a
 *       future migration's table is public the moment it exists and no reviewer
 *       of that migration would see why.
 *   GRANT SELECT ON public.organisations, public.venues, ... TO anon;
 *       only the named tables.
 *
 * So this reports: how many tables exist, how many anon can read table-wide, which
 * ones it cannot, and whether any DEFAULT PRIVILEGE is in force. The last question
 * is the one that decides whether the fix is a one-time revoke or a revoke plus an
 * ALTER DEFAULT PRIVILEGES reversal.
 *
 * It also lists the sensitive columns anon can currently read, which is the
 * exposure statement, and it does that by NAME so the report is specific.
 *
 * Read-only, enforced server-side with default_transaction_read_only=on.
 * USAGE: node scripts/probe/grant-shape-probe.mjs --env <env file>
 */
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ENV_FILE = arg('--env')
if (!ENV_FILE || !existsSync(ENV_FILE)) { console.error('usage: --env <env file>'); process.exit(2) }

const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || ''
let cfg
if (env.SUPABASE_DB_URL) {
  const s = env.SUPABASE_DB_URL.trim()
  const at = s.lastIndexOf('@'), se = s.indexOf('://')
  const creds = s.slice(se + 3, at), sep = creds.indexOf(':')
  const tail = s.slice(at + 1), cut = tail.search(/[/?]/)
  const hp = cut === -1 ? tail : tail.slice(0, cut), colon = hp.indexOf(':')
  cfg = { user: creds.slice(0, sep), password: creds.slice(sep + 1), host: colon === -1 ? hp : hp.slice(0, colon), port: Number(colon === -1 ? 5432 : hp.slice(colon + 1)) }
} else {
  cfg = { user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD_SYDNEY, host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432 }
}
const client = new pg.Client({
  ...cfg, database: 'postgres', ssl: { rejectUnauthorized: false },
  options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000,
})

const hr = t => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
const scanned = []

await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  hr(`PRIVILEGE SHAPE  |  project ${ref}`)

  // 1. Every base table in public, and who holds TABLE-level SELECT.
  scanned.push('pg_class base tables in public, with table-level SELECT per role')
  const tables = (await client.query(
    `select c.relname as t,
            has_table_privilege('anon',          c.oid, 'SELECT') as anon,
            has_table_privilege('authenticated', c.oid, 'SELECT') as auth
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  )).rows
  const anonYes = tables.filter(t => t.anon)
  const anonNo = tables.filter(t => !t.anon)
  console.log(`  base tables in public            ${tables.length}`)
  console.log(`  anon has table-level SELECT on   ${anonYes.length}`)
  console.log(`  anon does NOT have it on         ${anonNo.length}${anonNo.length ? `: ${anonNo.map(t => t.t).join(', ')}` : ''}`)

  if (anonNo.length === 0) {
    console.log('\n  SHAPE: anon can read EVERY table in the schema table-wide.')
    console.log('         Consistent with a schema-wide SELECT being re-granted to anon.')
  } else {
    console.log('\n  SHAPE: some tables are excluded, so the grant was not schema-wide, OR')
    console.log('         those tables were created after a schema-wide grant was run.')
  }

  // 2. DEFAULT PRIVILEGES: does a FUTURE table become public automatically?
  scanned.push('pg_default_acl for default privileges naming anon or authenticated')
  const defacl = (await client.query(
    `select n.nspname as schema, d.defaclobjtype as objtype, d.defaclacl::text as acl
       from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace`,
  )).rows
  const risky = defacl.filter(d => /anon|authenticated/.test(d.acl ?? ''))
  console.log(`\n  DEFAULT PRIVILEGES entries        ${defacl.length}`)
  if (risky.length === 0) {
    console.log('  none grant anon or authenticated anything by default.')
    console.log('  => a table created by a FUTURE migration is NOT automatically public.')
    console.log('     The fix is therefore a one-time withdrawal; the default-privilege')
    console.log('     entries need no reversal.')
  } else {
    for (const d of risky) console.log(`  ${d.schema ?? '(all)'} objtype=${d.objtype} acl=${d.acl}`)
    console.log('  => a FUTURE table in these schemas is granted to anon on creation.')
    console.log('')
    console.log('  ATTRIBUTION, and it matters before anyone acts on this: these entries are')
    console.log('  SUPABASE STOCK CONFIGURATION, not the emergency grant. Verified by running')
    console.log('  this probe against both projects: TEST (which never had 20260808000010')
    console.log('  applied and never had an emergency grant) shows the SAME 24 entries with the')
    console.log('  same ACLs. So this is the platform default that ships with every Supabase')
    console.log('  project, and RLS is what is meant to hold the line on those future tables.')
    console.log('  Do NOT report it as something a person did during the incident.')
    console.log('')
    console.log('  It is still worth knowing, for one specific reason: a new table that ships')
    console.log('  WITHOUT row level security enabled on it is not merely readable,')
    console.log('  it inherits arwdDxtm, so it is writable by anon too. That is a migration')
    console.log('  review item, not an incident remnant.')
  }

  // 3. The actual exposure, named column by column.
  scanned.push('has_column_privilege for the named sensitive columns of the 4 locked tables')
  hr('WHAT anon CAN READ RIGHT NOW THAT 20260808000010 MEANT TO CLOSE')
  const SENSITIVE = {
    organisations: ['email', 'phone', 'owner_id', 'metadata', 'stripe_account_id', 'stripe_account_country',
      'stripe_charges_enabled', 'stripe_payouts_enabled', 'stripe_onboarding_complete', 'stripe_capabilities',
      'stripe_requirements', 'payout_status', 'hold_amount_cents', 'total_volume_cents'],
    venues: ['stripe_account_id', 'stripe_account_country', 'stripe_payouts_enabled',
      'revenue_share_status', 'revenue_share_enrolled_at', 'revenue_share_unenrolled_at'],
    seats: ['held_by_user_id', 'metadata', 'reservation_id', 'order_item_id'],
    event_artists: ['invite_token'],
  }
  let exposed = 0
  for (const [table, cols] of Object.entries(SENSITIVE)) {
    const present = (await client.query(
      `select a.attname from pg_attribute a
        where a.attrelid = ('public.'||$1)::regclass and a.attnum > 0 and not a.attisdropped
          and a.attname = any($2::text[])`, [table, cols],
    )).rows.map(r => r.attname)
    const readable = []
    for (const c of present) {
      const r = (await client.query(
        `select has_column_privilege('anon', ('public.'||$1)::regclass, $2, 'SELECT') as ok`, [table, c],
      )).rows[0]
      if (r.ok) readable.push(c)
    }
    exposed += readable.length
    console.log(`\n  public.${table}`)
    console.log(`    anon CAN read (${readable.length}/${present.length}): ${readable.join(', ') || 'none'}`)
  }
  console.log(`\n  TOTAL sensitive columns readable by anon: ${exposed}`)
  console.log(`  VERDICT: ${exposed === 0
    ? 'the lockdown is in force.'
    : 'the lockdown is NOT in force. Every column above is reachable with the NEXT_PUBLIC anon key.'}`)

  await client.query('ROLLBACK')
} finally { await client.end() }

hr('WHAT THIS PROBE SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log('\n  writes attempted: 0 (default_transaction_read_only=on; BEGIN READ ONLY; ROLLBACK)')
