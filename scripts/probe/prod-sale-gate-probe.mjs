/**
 * READ-ONLY PRODUCTION PROBE: why will this event not sell?
 *
 * WHAT THIS IS FOR. The buyer-facing refusal on a paid event names no reason a
 * founder can act on, so the only way to learn which of the five sale-gate
 * fields is false is to read them. This script reads them and stops. It is the
 * evidence behind the sale-gate diagnosis, kept in the tree so the next person
 * does not have to rebuild it under pressure.
 *
 * IT WRITES NOTHING, AND THAT IS ENFORCED RATHER THAN PROMISED. Every Supabase
 * call goes through `readOnly()`, which asserts the PostgREST builder that came
 * back was produced by `.select(...)`. `assertNotProduction` from
 * production-write-preflight.mjs is deliberately NOT called: that preflight
 * exists to stop WRITE-capable scripts touching production, and this script's
 * entire purpose is to read production. The protection here is that no write
 * verb is reachable, not that the target is forbidden.
 *
 * IT NEVER PRINTS KEY MATERIAL. Supabase keys and the Stripe secret are read to
 * construct clients and are never logged. The Stripe account id is truncated,
 * the project ref is printed because refs.mjs documents it as non-secret (it is
 * compiled into every production browser bundle), and the Stripe MODE is printed
 * as the word "live" or "test" rather than as any part of the key.
 *
 * USAGE:
 *   node scripts/probe/prod-sale-gate-probe.mjs --env <path to .env> --slug <event slug>
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}

const ENV_FILE = arg('--env')
const SLUG = arg('--slug')

if (!ENV_FILE || !SLUG) {
  console.error('usage: --env <envfile> --slug <event-slug>')
  process.exit(2)
}
if (!existsSync(ENV_FILE)) {
  console.error(`[probe] env file not found: ${ENV_FILE}`)
  process.exit(2)
}

// Minimal .env reader. dotenv is not imported because this script must not
// mutate process.env for anything else that might run in the same process.
const env = {}
for (const raw of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq === -1) continue
  let value = line.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  env[line.slice(0, eq).trim()] = value
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_KEY = env.STRIPE_SECRET_KEY

const ref = (SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\./) || [])[1] ?? 'UNREADABLE'
const stripeMode = STRIPE_KEY?.startsWith('sk_live')
  ? 'live'
  : STRIPE_KEY?.startsWith('sk_test')
    ? 'test'
    : 'unknown'

console.log('='.repeat(70))
console.log(`[probe] supabase project ref : ${ref}`)
console.log(`[probe] stripe mode          : ${stripeMode}`)
console.log(`[probe] event slug           : ${SLUG}`)
console.log(`[probe] MODE                 : READ ONLY (select verbs only)`)
console.log('='.repeat(70))

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * The read-only assertion. A PostgREST filter builder carries the HTTP method it
 * will send; anything other than GET here means a write verb was constructed and
 * this script aborts before it is awaited.
 */
async function readOnly(builder, label) {
  const method = builder?.method ?? builder?.['method']
  if (method && method !== 'GET' && method !== 'HEAD') {
    console.error(`[probe] ABORT: non-read verb ${method} constructed for ${label}`)
    process.exit(3)
  }
  return builder
}

const GATE_FIELDS =
  'stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status'

// ---- 0. WHICH COLUMNS EXIST ON events ------------------------------------
// This runs FIRST and by name, because the reservation server action selects
// `organisation_id, external_ticket_url` explicitly. A column named in a select
// that does not exist makes PostgREST fail the whole request, and the caller
// destructures only `data`, so the failure arrives as a silent null rather than
// as an error. Proving column presence is therefore proving the defect.
console.log('\n--- events COLUMN PROBE (named by the reservation guard) ---')
const eventsColumnState = {}
for (const col of [
  'organisation_id',
  'external_ticket_url',
  'timezone',
  'start_date',
  'end_date',
  'venue_name',
  'venue_city',
  'venue_state',
  'status',
]) {
  const { error } = await readOnly(
    supabase.from('events').select(col).limit(1),
    `events.${col}`,
  )
  eventsColumnState[col] = !error
  console.log(`  ${col.padEnd(20)}: ${error ? `MISSING  <-- ${error.message.slice(0, 70)}` : 'EXISTS'}`)
}

// THE EXACT SELECT THE RESERVATION GUARD RUNS, reproduced verbatim.
console.log('\n--- REPRODUCING THE RESERVATION GUARD READ VERBATIM ---')
console.log("  reservations.ts:98  .select('organisation_id, external_ticket_url')")
const guardRead = await readOnly(
  supabase.from('events').select('organisation_id, external_ticket_url').eq('slug', SLUG).single(),
  'reservation-guard-read',
)
console.log(`  -> data  : ${JSON.stringify(guardRead.data)}`)
console.log(`  -> error : ${guardRead.error ? guardRead.error.message : 'null'}`)
console.log(
  `  -> CONSEQUENCE: the call site destructures only { data: ev }, so ev = ${JSON.stringify(guardRead.data)}.`,
)
if (!guardRead.data) {
  console.log('     ev is null, so ev?.organisation_id is undefined, so the organisation is NEVER read,')
  console.log('     so ticketsOnSale({ isPaidEvent: true, org: null }) returns FALSE and the sale is refused')
  console.log('     for EVERY PAID EVENT, whatever the organiser Stripe state below says.')
}

// ---- 1. the event and its organisation ------------------------------------
// Only columns proven to exist above are named, so this read cannot itself fail
// for the reason under investigation.
const eventCols = ['id', 'slug', 'title', 'status', 'organisation_id', 'timezone', 'start_date', 'end_date', 'venue_name', 'venue_city', 'venue_state']
  .filter((c) => ['id', 'slug', 'title'].includes(c) || eventsColumnState[c])
  .join(', ')
const { data: event, error: eventErr } = await readOnly(
  supabase.from('events').select(eventCols).eq('slug', SLUG).maybeSingle(),
  'events',
)

if (eventErr) {
  console.error('[probe] events read failed:', eventErr.message)
  process.exit(1)
}
if (!event) {
  console.error(`[probe] no event with slug ${SLUG}`)
  process.exit(1)
}

console.log('\n--- EVENT ---')
console.log(`title            : ${event.title}`)
console.log(`status           : ${event.status}`)
console.log(`organisation_id  : ${event.organisation_id}`)
console.log(`timezone (column): ${event.timezone ?? 'NULL'}`)
console.log(`start_date (raw) : ${event.start_date}`)
console.log(`end_date   (raw) : ${event.end_date}`)
console.log(`venue            : ${event.venue_name ?? 'NULL'} / ${event.venue_city ?? 'NULL'} / ${event.venue_state ?? 'NULL'}`)

// ---- 2. the tiers, which decide whether the event is paid ------------------
const { data: tiers, error: tierErr } = await readOnly(
  supabase
    .from('ticket_tiers')
    .select('id, name, price, currency, is_active, is_visible, sale_start, sale_end, total_capacity, sold_count, max_per_order')
    .eq('event_id', event.id),
  'ticket_tiers',
)

if (tierErr) {
  console.error('[probe] ticket_tiers read failed:', tierErr.message)
} else {
  console.log('\n--- TICKET TIERS ---')
  for (const t of tiers ?? []) {
    console.log(
      `  ${t.name}: price=${t.price} ${t.currency ?? 'AUD'} active=${t.is_active} visible=${t.is_visible} ` +
        `sale_start=${t.sale_start ?? 'NULL'} sale_end=${t.sale_end ?? 'NULL'} cap=${t.total_capacity} sold=${t.sold_count}`,
    )
  }
  const isPaid = (tiers ?? []).some((t) => (t.price ?? 0) > 0)
  console.log(`  => eventIsPaid = ${isPaid}`)
}

// ---- 3. THE FIVE GATE FIELDS ----------------------------------------------
const { data: org, error: orgErr } = await readOnly(
  supabase
    .from('organisations')
    .select(`id, name, ${GATE_FIELDS}`)
    .eq('id', event.organisation_id)
    .maybeSingle(),
  'organisations',
)

if (orgErr) {
  console.error('[probe] organisations read failed:', orgErr.message)
  process.exit(1)
}

console.log('\n--- THE FIVE SALE-GATE FIELDS (organisations row) ---')
console.log(`organisation name        : ${org?.name ?? 'NULL'}`)
const acct = org?.stripe_account_id ?? null
console.log(`1 stripe_account_id      : ${acct ? `${acct.slice(0, 10)}... (PRESENT)` : 'NULL  <-- FAILS GATE'}`)
console.log(`2 stripe_charges_enabled : ${org?.stripe_charges_enabled}${org?.stripe_charges_enabled === true ? '' : '  <-- FAILS GATE'}`)
console.log(`3 stripe_payouts_enabled : ${org?.stripe_payouts_enabled}${org?.stripe_payouts_enabled === true ? '' : '  <-- FAILS GATE'}`)
console.log(`4 payout_status          : ${org?.payout_status}${org?.payout_status === 'active' ? '' : '  <-- FAILS GATE'}`)
console.log(`5 stripe_account_country : ${org?.stripe_account_country ?? 'NULL'}${org?.stripe_account_country ? '' : '  <-- FAILS GATE (null country is not in the currency map)'}`)

// ---- 4. the Stripe account itself -----------------------------------------
if (acct && STRIPE_KEY) {
  try {
    const stripe = new Stripe(STRIPE_KEY)
    const account = await stripe.accounts.retrieve(acct)
    console.log('\n--- STRIPE CONNECTED ACCOUNT (retrieved live) ---')
    console.log(`id                : ${account.id.slice(0, 10)}...`)
    console.log(`charges_enabled   : ${account.charges_enabled}`)
    console.log(`payouts_enabled   : ${account.payouts_enabled}`)
    console.log(`details_submitted : ${account.details_submitted}`)
    console.log(`country           : ${account.country}`)
    console.log(`default_currency  : ${account.default_currency}`)
    const req = account.requirements ?? {}
    console.log(`requirements.currently_due  : ${JSON.stringify(req.currently_due ?? [])}`)
    console.log(`requirements.past_due       : ${JSON.stringify(req.past_due ?? [])}`)
    console.log(`requirements.eventually_due : ${JSON.stringify(req.eventually_due ?? [])}`)
    console.log(`requirements.disabled_reason: ${req.disabled_reason ?? 'null'}`)
  } catch (e) {
    console.error(`\n[probe] Stripe retrieve failed: ${e.message}`)
  }
} else {
  console.log('\n--- STRIPE CONNECTED ACCOUNT ---')
  console.log('  skipped: no account id on the organisation, or no Stripe key in this env file')
}

// ---- 5. share_links columns (the poster mint) ------------------------------
console.log('\n--- share_links COLUMN PROBE (poster / link_mint_failed) ---')
for (const col of ['destination_url', 'draft_code', 'event_id', 'artist_id', 'channel', 'code']) {
  const { error } = await readOnly(
    supabase.from('share_links').select(col).limit(1),
    `share_links.${col}`,
  )
  console.log(`  ${col.padEnd(16)}: ${error ? `MISSING (${error.message.slice(0, 80)})` : 'EXISTS'}`)
}

console.log('\n[probe] done. Nothing was written.')
