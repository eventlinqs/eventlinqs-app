/**
 * READ-ONLY STRIPE ACCOUNT AUDIT: every account this platform can see, in both
 * modes, cross-referenced against the organisations that reference them.
 *
 * WHAT THIS EXISTS TO SETTLE. Three Stripe account ids surfaced during the first
 * live purchase and nobody could say what all three were. An unidentified account
 * on a live payment system is not a tidiness problem: an organiser attached to
 * the wrong one is paid into the wrong place, and a connected account nothing
 * references is a loose end that still holds a capability.
 *
 * MODE COMES FROM THE KEY, NOT FROM THE ID. A test-mode and a live-mode Stripe id
 * are indistinguishable as strings: both begin `acct_`. The only way to know which
 * data space an account lives in is which key can see it. So this script runs the
 * same listing twice, once per key, and labels each result with the mode of the
 * key that returned it. It never infers a mode from an id.
 *
 * IT WRITES NOTHING. Every Stripe call is a GET (accounts.retrieve, accounts.list,
 * balance.retrieve, charges.list, transfers.list). No create, update or delete verb
 * appears in this file. The Supabase read goes through .select() only.
 *
 * IT NEVER PRINTS KEY MATERIAL. Keys are read to construct clients. The MODE is
 * printed as the word "live" or "test", derived from the key PREFIX only, and no
 * other part of any key is read or emitted. Stripe account ids ARE printed in
 * full: they are identifiers, not credentials, and identifying them is the point.
 *
 * USAGE:
 *   node scripts/probe/stripe-account-audit.mjs --live <prod env> --test .env.test
 * Either flag may be omitted to audit one mode only.
 */
import { readFileSync, existsSync } from 'node:fs'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Pinned to the same version the application uses (src/lib/payments/refund.ts),
// so what this audit sees is what the platform sees.
const STRIPE_API_VERSION = '2026-03-25.dahlia'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }

function readEnv(file) {
  if (!file) return null
  if (!existsSync(file)) { console.error(`[audit] env file not found: ${file}`); process.exit(2) }
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
  }
  return env
}

/** The only thing read from a key: its mode. Never any other part. */
const keyMode = (k) => (k?.startsWith('sk_live_') ? 'live' : k?.startsWith('sk_test_') ? 'test' : 'UNKNOWN')

const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const scanned = []

/** Organisation rows that reference a Stripe account, keyed by account id. */
async function orgReferences(env, label) {
  if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return null
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  // .select() only: no write verb is reachable from this client in this file.
  const { data, error } = await sb
    .from('organisations')
    .select('id, name, slug, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, created_at')
  if (error) { console.log(`  [${label}] organisations read failed: ${error.message}`); return null }
  scanned.push(`${label} Supabase organisations table (${data.length} rows) for stripe_account_id references`)
  const byAcct = new Map()
  for (const o of data) if (o.stripe_account_id) {
    if (!byAcct.has(o.stripe_account_id)) byAcct.set(o.stripe_account_id, [])
    byAcct.get(o.stripe_account_id).push(o)
  }
  return { rows: data, byAcct }
}

async function auditMode(envFile, expectMode) {
  const env = readEnv(envFile)
  if (!env) return null
  const key = env.STRIPE_SECRET_KEY
  if (!key) { console.log(`[audit] no STRIPE_SECRET_KEY in ${envFile}`); return null }
  const mode = keyMode(key)
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })

  hr(`STRIPE MODE: ${mode.toUpperCase()}   (key from ${envFile}${mode !== expectMode ? `  -- EXPECTED ${expectMode}` : ''})`)

  // 1. The platform account itself. GET /v1/account returns the account the key
  // belongs to, which is the PLATFORM, never a connected account.
  let platform = null
  try {
    platform = await stripe.accounts.retrieve()
    scanned.push(`${mode}: GET /v1/account (the platform account)`)
    console.log(`\nPLATFORM ACCOUNT (the account this key belongs to)`)
    console.log(`  id             ${platform.id}`)
    console.log(`  business name  ${platform.business_profile?.name ?? platform.settings?.dashboard?.display_name ?? '-'}`)
    console.log(`  country        ${platform.country}   default currency ${String(platform.default_currency ?? '-').toUpperCase()}`)
    console.log(`  type           ${platform.type ?? '-'}   charges_enabled=${platform.charges_enabled} payouts_enabled=${platform.payouts_enabled}`)
    console.log(`  created        ${platform.created ? new Date(platform.created * 1000).toISOString().slice(0, 10) : '-'}`)
  } catch (err) {
    console.log(`  platform account retrieve failed: ${err.message}`)
  }

  // 2. Platform balance. This is where a funds-holding refund is paid FROM.
  try {
    const bal = await stripe.balance.retrieve()
    scanned.push(`${mode}: GET /v1/balance (platform available + pending)`)
    const fmt = (arr) => arr.map(b => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ') || 'none'
    console.log(`  balance        available: ${fmt(bal.available)}   pending: ${fmt(bal.pending)}`)
  } catch (err) {
    console.log(`  balance retrieve failed: ${err.message}`)
  }

  // 3. Every connected account. GET /v1/accounts lists accounts CONNECTED to the
  // platform; the platform's own account is not among them.
  const connected = []
  try {
    for await (const acct of stripe.accounts.list({ limit: 100 })) connected.push(acct)
    scanned.push(`${mode}: GET /v1/accounts (all connected accounts, paginated)`)
  } catch (err) {
    console.log(`  accounts.list failed: ${err.message}`)
  }

  console.log(`\nCONNECTED ACCOUNTS: ${connected.length}`)
  for (const a of connected) {
    const name = a.business_profile?.name || a.settings?.dashboard?.display_name || a.email || '(unnamed)'
    console.log(`  ${a.id}`)
    console.log(`      name     ${name}`)
    console.log(`      type     ${a.type ?? '-'}   country ${a.country ?? '-'}   currency ${String(a.default_currency ?? '-').toUpperCase()}`)
    console.log(`      charges_enabled=${a.charges_enabled}  payouts_enabled=${a.payouts_enabled}  details_submitted=${a.details_submitted}`)
    console.log(`      created  ${a.created ? new Date(a.created * 1000).toISOString().slice(0, 10) : '-'}`)
    const due = a.requirements?.currently_due ?? []
    if (due.length) console.log(`      currently_due  ${due.join(', ')}`)
  }

  return { mode, envFile, platform, connected }
}

// ---------------------------------------------------------------------------
const liveEnv = arg('--live')
const testEnv = arg('--test')

const live = liveEnv ? await auditMode(liveEnv, 'live') : null
const test = testEnv ? await auditMode(testEnv, 'test') : null

// Organisation cross-reference. Production organisations are matched against the
// LIVE connected accounts, TEST organisations against the TEST ones. Crossing
// those two is precisely how a payment silently fails, so they are never mixed.
hr('CROSS-REFERENCE: connected accounts versus organisations rows')

for (const [side, envFile, audit] of [['PRODUCTION', liveEnv, live], ['TEST', testEnv, test]]) {
  if (!audit) continue
  const refs = await orgReferences(readEnv(envFile), side)
  if (!refs) continue
  const stripeIds = new Set(audit.connected.map(a => a.id))
  const referenced = new Set(refs.byAcct.keys())

  console.log(`\n${side}  (Stripe mode ${audit.mode}, ${refs.rows.length} organisations, ${audit.connected.length} connected accounts)`)

  console.log(`\n  MATCHED (account exists in Stripe AND an organisation references it):`)
  let matched = 0
  for (const id of stripeIds) if (referenced.has(id)) {
    matched++
    for (const o of refs.byAcct.get(id)) console.log(`    ${id}  <-  ${o.name} [${o.status}]`)
  }
  if (matched === 0) console.log('    none')

  console.log(`\n  ORPHAN A: connected account in Stripe that NO organisation references:`)
  let oa = 0
  for (const a of audit.connected) if (!referenced.has(a.id)) {
    oa++
    const name = a.business_profile?.name || a.settings?.dashboard?.display_name || a.email || '(unnamed)'
    console.log(`    ${a.id}  "${name}"  type=${a.type} charges=${a.charges_enabled} payouts=${a.payouts_enabled}`)
  }
  if (oa === 0) console.log('    none')

  console.log(`\n  ORPHAN B: organisation pointing at an account this key CANNOT see:`)
  let ob = 0
  for (const [id, orgs] of refs.byAcct) if (!stripeIds.has(id)) {
    ob++
    for (const o of orgs) console.log(`    ${id}  <-  ${o.name} [${o.status}]  NOT in the ${audit.mode}-mode account list`)
  }
  if (ob === 0) console.log('    none')

  const noAcct = refs.rows.filter(o => !o.stripe_account_id)
  console.log(`\n  organisations with NO stripe_account_id: ${noAcct.length}`)
}

hr('WHAT THIS AUDIT SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  Stripe API version pinned: ${STRIPE_API_VERSION} (same as src/lib/payments/refund.ts)`)
console.log('  writes attempted: 0 (retrieve/list/select only; no create, update or delete verb in this file)')
