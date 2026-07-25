/**
 * Stripe webhook endpoint inventory + secret-drift detector.
 *
 * The recurring incident this exists to catch (three times now: 2026-07-12,
 * 2026-07-19, 2026-07-25) is SECRET DRIFT - the signing secret Stripe uses for
 * an endpoint stops matching the secret the deployment verifies with. Payments
 * still succeed, deliveries silently 400, and paid orders sit `pending` with no
 * error on any surface. See docs/payments/WEBHOOK-CANON.md.
 *
 * This prints, for every endpoint on the account, its URL, status, whether it
 * listens to connected-account events, and a FINGERPRINT of its signing secret,
 * then compares those fingerprints against the secrets configured locally. It
 * never prints a secret.
 *
 * Usage:
 *   node scripts/verify/stripe-webhook-endpoints.mjs [--env .env.test]
 *
 * SAFETY: refuses to run against a live key. Read-only - it creates, modifies
 * and deletes nothing.
 */
import Stripe from 'stripe'
import crypto from 'node:crypto'
import fs from 'node:fs'

const argEnv = process.argv.indexOf('--env')
const envFile = argEnv > -1 ? process.argv[argEnv + 1] : '.env.test'

function loadEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '').trim()
  }
  return out
}

const env = { ...loadEnvFile(envFile), ...process.env }

const key = env.STRIPE_SECRET_KEY
if (!key) {
  console.error(`No STRIPE_SECRET_KEY found (looked in ${envFile} and process env).`)
  process.exit(1)
}
if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) {
  console.error('REFUSING TO RUN: this is a LIVE Stripe key. This harness is TEST-mode only.')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
const fp = (v) => (v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 10) : '(not revealed)')

/** Every secret this deployment would accept, mirroring resolveWebhookSecrets(). */
function configuredSecrets() {
  const many = (env.STRIPE_WEBHOOK_SECRETS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const one = (env.STRIPE_WEBHOOK_SECRET ?? '').trim()
  if (one) many.push(one)
  return [...new Set(many)]
}

const configured = configuredSecrets()
const configuredFps = new Set(configured.map(fp))

const acct = await stripe.accounts.retrieve()
console.log(`Stripe account : ${acct.id}  (TEST mode)`)
console.log(`Env file       : ${envFile}`)
console.log(`Configured secrets: ${configured.length} -> ${[...configuredFps].join(', ') || '(none)'}\n`)

const eps = await stripe.webhookEndpoints.list({ limit: 100 })
const enabled = eps.data.filter((e) => e.status === 'enabled')

for (const e of eps.data) {
  const secretFp = fp(e.secret)
  const known = e.secret ? configuredFps.has(secretFp) : null
  console.log(`${e.id}  [${e.status}]`)
  console.log(`  url          : ${e.url}`)
  // A connected-account endpoint carries a non-null `application` (the Connect
  // application). Stripe does NOT echo the `connect: true` create parameter
  // back as a boolean, so testing for one misreports every endpoint.
  console.log(`  channel      : ${e.application ? `CONNECTED-ACCOUNT (application ${e.application})` : 'account events only'}`)
  console.log(`  enabled_events: ${e.enabled_events.length}`)
  console.log(
    `  secret       : ${secretFp}${
      known === null ? '   (Stripe only reveals secrets for API-created endpoints)' : known ? '   MATCHES a configured secret' : '   *** DRIFT: no configured secret matches ***'
    }`,
  )
  console.log()
}

console.log(`enabled endpoints: ${enabled.length}`)
const drifted = enabled.filter((e) => e.secret && !configuredFps.has(fp(e.secret)))
if (drifted.length > 0) {
  console.log(`\nDRIFT DETECTED on ${drifted.length} enabled endpoint(s):`)
  for (const e of drifted) console.log(`  - ${e.id}  ${e.url}`)
  console.log('\nDeliveries from these endpoints will fail signature verification and 400.')
  console.log('Fix: add the endpoint secret to STRIPE_WEBHOOK_SECRETS (comma-separated) for the')
  console.log('affected scope, then REDEPLOY (Vercel snapshots env per deployment).')
  process.exit(2)
}
console.log('no drift: every enabled endpoint with a revealed secret is configured.')
