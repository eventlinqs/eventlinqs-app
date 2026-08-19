/**
 * READ-ONLY: which Stripe events does each webhook endpoint actually subscribe to?
 *
 * WHY THIS IS ITS OWN CHECK. The refund reconcile (void tickets, return
 * inventory, reverse the ledger) runs ONLY from the `charge.refunded` handler.
 * If an endpoint does not subscribe to that event, every refund still succeeds at
 * Stripe and the buyer still gets their money, but the platform never hears about
 * it: the ticket stays valid, the seat stays sold, and the ledger stays wrong.
 * That is the exact silent-inventory-leak shape, and it is invisible from the
 * application code, which looks correct because it IS correct. The subscription
 * list is the missing half.
 *
 * Read-only: endpoints.list only. Prints no key material; mode is derived from
 * the key prefix alone.
 *
 * USAGE: node scripts/probe/webhook-subscription-check.mjs --env .env.test
 */
import { readFileSync, existsSync } from 'node:fs'
import Stripe from 'stripe'

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ENV_FILE = arg('--env', '.env.test')
if (!existsSync(ENV_FILE)) { console.error(`env file not found: ${ENV_FILE}`); process.exit(2) }

const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}
const key = env.STRIPE_SECRET_KEY
if (!key) { console.error(`[check] no STRIPE_SECRET_KEY in ${ENV_FILE}`); process.exit(2) }
const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'UNKNOWN'
const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })

// The events the refund path depends on, and what breaks without each.
const REQUIRED = {
  'charge.refunded': 'reconcile_refund: voids tickets, returns inventory, reverses the ledger',
  'payment_intent.succeeded': 'order confirmation and ticket issue',
  // Added 2026-08-19 (founder ruling). Stripe's own words: "In the rare instance
  // that a refund fails, we notify you using the refund.failed event"
  // (https://docs.stripe.com/refunds, fetched 19 August 2026). Without it a refund
  // that bounces off a closed card leaves the money back on the PLATFORM balance,
  // the buyer with nothing, and no surface anywhere saying so.
  'refund.failed': 'marks the refund failed and ALERTS: the buyer is owed money',
  // A CANCELLED refund arrives as a status change rather than as refund.failed, and
  // Stripe records that "cancellations are a type of refund failure".
  'refund.updated': 'catches a refund cancelled after creation (status canceled)',
}

console.log(`STRIPE MODE: ${mode}\n`)
const endpoints = []
for await (const e of stripe.webhookEndpoints.list({ limit: 100 })) endpoints.push(e)

console.log(`WEBHOOK ENDPOINTS: ${endpoints.length}\n`)
let anyMissing = false
for (const e of endpoints) {
  const all = e.enabled_events.includes('*')
  console.log(`  ${e.id}  [${e.status}]`)
  console.log(`      url         ${e.url}`)
  console.log(`      api_version ${e.api_version ?? '(account default)'}`)
  console.log(`      application ${e.application ?? '(none - platform endpoint)'}`)
  console.log(`      events      ${all ? '* (all events)' : `${e.enabled_events.length} subscribed`}`)
  // A CONNECT endpoint (non-null `application`) carries the connected-ACCOUNT
  // event stream (account.updated and friends). It is not supposed to carry
  // charge.refunded, so counting it as missing one produces a false finding on a
  // correctly configured platform. Only PLATFORM endpoints are judged here.
  const isConnect = Boolean(e.application)
  for (const [evt, why] of Object.entries(REQUIRED)) {
    const has = all || e.enabled_events.includes(evt)
    if (!has && e.status === 'enabled' && !isConnect) anyMissing = true
    const verdict = has ? 'YES' : isConnect ? 'n/a' : 'NO '
    console.log(`        ${verdict}  ${evt}   -- ${why}`)
  }
  if (isConnect) console.log('        (Connect endpoint: carries account.* events by design, not charge.*)')
  console.log('')
}

console.log('WHAT THIS CHECKED')
console.log(`  1. ${mode}: GET /v1/webhook_endpoints (all endpoints, paginated)`)
console.log(`  2. each endpoint's enabled_events for: ${Object.keys(REQUIRED).join(', ')}`)
console.log(`  3. endpoint status, url, api_version and Connect application ownership`)
console.log(`\n  verdict: ${anyMissing ? 'AT LEAST ONE ENABLED ENDPOINT IS MISSING A REQUIRED EVENT' : 'every enabled endpoint carries the required events'}`)
