/**
 * Sanctioned webhook rotation (docs/payments/WEBHOOK-CANON.md).
 *
 * Creates a fresh ACCOUNT endpoint and a fresh CONNECTED-ACCOUNT endpoint at
 * the given URL, capturing each signing secret from the CREATE response - the
 * only moment Stripe ever reveals it - then disables the previous enabled
 * endpoints at that host so exactly one signer per delivery channel remains.
 *
 * Two endpoints, not one: `account.updated`, `payout.*` and `charge.dispute.*`
 * are only delivered to an endpoint created with `connect: true`, while
 * `payment_intent.*`, `charge.*`, `checkout.session.*` and `transfer.created`
 * go to the account endpoint. They carry DIFFERENT signing secrets, which is
 * what STRIPE_WEBHOOK_SECRETS exists to hold.
 *
 * Usage:
 *   node scripts/verify/rotate-webhook-endpoints.mjs <url> <out-file>
 *
 * The secrets are written to <out-file> as STRIPE_WEBHOOK_SECRETS=a,b and never
 * printed. SAFETY: refuses to run against a live key.
 */
import Stripe from 'stripe'
import crypto from 'node:crypto'
import fs from 'node:fs'

const [, , url, outFile] = process.argv
if (!url || !outFile) {
  console.error('usage: node scripts/verify/rotate-webhook-endpoints.mjs <url> <out-file>')
  process.exit(1)
}

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}

const key = env.STRIPE_SECRET_KEY
if (!key || key.startsWith('sk_live_') || key.startsWith('rk_live_')) {
  console.error('REFUSING TO RUN: TEST-mode key required.')
  process.exit(1)
}
const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
const fp = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 10)

// The 18 events the route actually handles. payment_intent.succeeded is handled
// by an `if` OUTSIDE the switch in route.ts, so a case-only grep misses it - and
// it is the event that confirms the order and issues the tickets.
const ACCOUNT_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.requires_action',
  'payment_intent.canceled',
  'charge.succeeded',
  'charge.updated',
  'charge.refunded',
  'checkout.session.completed',
  'checkout.session.expired',
  'transfer.created',
]
const CONNECT_EVENTS = [
  'account.updated',
  'account.application.deauthorized',
  'payout.created',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
  'charge.dispute.created',
  'charge.dispute.closed',
]

const host = new URL(url).host
const before = await stripe.webhookEndpoints.list({ limit: 100 })
const staleAtHost = before.data.filter(
  (e) => e.status === 'enabled' && new URL(e.url).host === host,
)

console.log(`target url : ${url}`)
console.log(`existing enabled endpoints at ${host}: ${staleAtHost.length}`)
for (const e of staleAtHost) console.log(`  - ${e.id} (connect=${e.connect === true})`)

const account = await stripe.webhookEndpoints.create({
  url,
  enabled_events: ACCOUNT_EVENTS,
  description: 'EventLinqs account events (rotated 2026-07-25)',
})
const connect = await stripe.webhookEndpoints.create({
  url,
  connect: true,
  enabled_events: CONNECT_EVENTS,
  description: 'EventLinqs connected-account events (rotated 2026-07-25)',
})

console.log(`\ncreated account endpoint : ${account.id}  secret fp ${fp(account.secret)}  events ${account.enabled_events.length}`)
// `application` non-null is what actually marks a connected-account endpoint;
// Stripe does not echo the `connect: true` create parameter back as a boolean.
console.log(`created connect endpoint : ${connect.id}  secret fp ${fp(connect.secret)}  events ${connect.enabled_events.length}  application=${connect.application ?? 'NULL (NOT a connect endpoint)'}`)

for (const e of staleAtHost) {
  await stripe.webhookEndpoints.update(e.id, { disabled: true })
  console.log(`disabled stale endpoint  : ${e.id}`)
}

// No trailing newline: this file is piped straight into the Vercel env API and
// a stray \n becomes part of the secret.
fs.writeFileSync(outFile, `${account.secret},${connect.secret}`, 'utf8')
fs.writeFileSync(`${outFile}.account`, account.secret, 'utf8')
fs.writeFileSync(`${outFile}.connect`, connect.secret, 'utf8')
console.log(`\nsecrets written to ${outFile} (and .account / .connect), never printed`)
