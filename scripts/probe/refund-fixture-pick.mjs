/**
 * READ-ONLY: find a TEST fixture that can actually prove the dashboard refund.
 *
 * The dashboard refund proof needs all of these true at once, and they are held
 * by four different tables, so guessing wastes a whole drive:
 *   - an auth user I can log in as
 *   - who OWNS (or owner/admin/manages) an organisation
 *   - whose Stripe posture passes assertCanCreateDestinationCharge, which is
 *     charges_enabled AND payouts_enabled AND stripe_account_country NOT NULL
 *     AND payout_status active. A null country is rejected as
 *     `org_country_unsupported` before Stripe is called, so the payment element
 *     never mounts and the drive fails for an unrelated reason.
 *   - with a published, paid, non-seated event carrying an on-sale tier that has
 *     stock left
 *
 * Read-only, enforced server-side with default_transaction_read_only=on.
 * USAGE: node scripts/probe/refund-fixture-pick.mjs --env .env.test [--email <organiser email>]
 */
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ENV_FILE = arg('--env', '.env.test')
const EMAIL = arg('--email', null)

if (!existsSync(ENV_FILE)) { console.error(`env file not found: ${ENV_FILE}`); process.exit(2) }
const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}
const s = env.SUPABASE_DB_URL.trim()
const at = s.lastIndexOf('@'), se = s.indexOf('://')
const creds = s.slice(se + 3, at), sep = creds.indexOf(':')
const tail = s.slice(at + 1), cut = tail.search(/[/?]/)
const hp = cut === -1 ? tail : tail.slice(0, cut), colon = hp.indexOf(':')
const client = new pg.Client({
  user: creds.slice(0, sep), password: creds.slice(sep + 1),
  host: colon === -1 ? hp : hp.slice(0, colon), port: Number(colon === -1 ? 5432 : hp.slice(colon + 1)),
  database: 'postgres', ssl: { rejectUnauthorized: false },
  options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000,
})

await client.connect()
try {
  await client.query('BEGIN READ ONLY')

  // Charge-ready organisations, with the owner's login email, and their sellable
  // events. One query so the four conditions cannot drift apart.
  const rows = (await client.query(
    `select u.email                as owner_email,
            o.id                   as org_id,
            o.name                 as org_name,
            o.stripe_account_id,
            o.stripe_account_country,
            o.payout_status::text   as payout_status,
            e.id                   as event_id,
            e.slug,
            e.title,
            e.start_date,
            tt.id                  as tier_id,
            tt.name                as tier_name,
            tt.price,
            tt.total_capacity,
            tt.sold_count
       from public.organisations o
       join auth.users u on u.id = o.owner_id
       join public.events e on e.organisation_id = o.id
       join public.ticket_tiers tt on tt.event_id = e.id
      where o.stripe_charges_enabled is true
        and o.stripe_payouts_enabled is true
        and o.stripe_account_country is not null
        and o.payout_status = 'active'
        and e.status = 'published'
        and e.is_free is false
        and e.has_reserved_seating is false
        and e.organiser_assigns_seats is false
        and e.start_date > now()
        and tt.price > 0
        and tt.sold_count < tt.total_capacity
        ${EMAIL ? 'and lower(u.email) = lower($1)' : ''}
      order by u.email, e.start_date
      limit 40`,
    EMAIL ? [EMAIL] : [],
  )).rows

  console.log(`CHARGE-READY FIXTURES: ${rows.length}\n`)
  for (const r of rows) {
    console.log(`  ${r.owner_email}`)
    console.log(`     org    ${r.org_name}  (${r.stripe_account_id}, ${r.stripe_account_country}, payout=${r.payout_status})`)
    console.log(`     event  ${r.slug}   "${r.title}"  starts ${String(r.start_date).slice(0, 10)}`)
    console.log(`     tier   ${r.tier_name}  price=${r.price}  sold=${r.sold_count}/${r.total_capacity}  tier_id=${r.tier_id}`)
    console.log(`     ids    event_id=${r.event_id}  org_id=${r.org_id}`)
    console.log('')
  }

  if (!EMAIL) {
    // Which of those owner emails is a known repo credential.
    const known = ['broadcast.gate.organiser@eventlinqs.com', 'test-user@eventlinqs.com']
    const present = (await client.query(
      `select email, (encrypted_password is not null) as has_password, email_confirmed_at is not null as confirmed
         from auth.users where lower(email) = any($1::text[])`,
      [known],
    )).rows
    console.log('KNOWN REPO CREDENTIAL ACCOUNTS ON THIS DATABASE:')
    for (const p of present) console.log(`  ${p.email}  password_set=${p.has_password} confirmed=${p.confirmed}`)
    if (!present.length) console.log('  none of the known repo credential emails exist here')
  }

  await client.query('ROLLBACK')
} finally { await client.end() }
