/**
 * LIVE-MODE Stripe key verification, for the go-live cutover.
 *
 * Production currently runs `sk_test_` / `pk_test_` while holding a LIVE
 * webhook signing secret. That combination looks configured and takes card
 * details, but every charge is a test charge: no money ever moves. This script
 * is the proof step to run once the live keys are set.
 *
 * It performs a READ-ONLY live-mode API call. It never creates a charge, a
 * customer, a product or any other object, so running it costs nothing and
 * changes nothing.
 *
 * What it asserts:
 *   1. the secret key is a LIVE key (sk_live_ / rk_live_);
 *   2. a live-mode API read actually succeeds (the key is valid and active);
 *   3. charges are enabled on the live account, so it can take real money;
 *   4. the publishable key is LIVE and belongs to the SAME account as the
 *      secret key. A mismatched pair is the silent killer: Stripe.js cannot
 *      resolve a clientSecret minted by another account, so the payment
 *      element renders NOTHING with no error anywhere. That exact mismatch was
 *      found on the Preview scope on 2026-07-25.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... \
 *     node scripts/verify/stripe-live-key-check.mjs
 *
 * Or, after the keys are set on Vercel Production:
 *   vercel env pull .env.prod.check --environment=production
 *   node scripts/verify/stripe-live-key-check.mjs --env .env.prod.check
 */
import Stripe from 'stripe'
import fs from 'node:fs'

const argEnv = process.argv.indexOf('--env')
const envFile = argEnv > -1 ? process.argv[argEnv + 1] : null

const env = { ...process.env }
if (envFile && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
  }
}

const sk = (env.STRIPE_SECRET_KEY ?? '').trim()
const pk = (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim()

const checks = []
const record = (name, pass, detail) => {
  checks.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

if (!sk) {
  console.error('STRIPE_SECRET_KEY is not set.')
  process.exit(1)
}

record('secret key is LIVE mode', /^(sk|rk)_live_/.test(sk), `prefix ${sk.slice(0, 8)}`)

/** Both key types embed the account id after the `_51` version marker. */
const embed = (k) => k.replace(/^(pk|sk|rk)_(test|live)_51/, '').slice(0, 14)

let account = null
try {
  const stripe = new Stripe(sk, { apiVersion: '2026-03-25.dahlia' })
  // Read-only. Retrieving the account is the cheapest call that proves the key
  // is valid, active, and operating in live mode.
  account = await stripe.accounts.retrieve()
  // Name the mode explicitly. Run with a test key this call still succeeds, and
  // a label reading "live-mode API read succeeds" would be a false green.
  const mode = /^(sk|rk)_live_/.test(sk) ? 'LIVE' : 'TEST'
  record(`API read succeeds (mode: ${mode})`, true, `account ${account.id}`)
  record(`charges enabled on the ${mode} account`, account.charges_enabled === true, `charges_enabled=${account.charges_enabled}`)
  record(`payouts enabled on the ${mode} account`, account.payouts_enabled === true, `payouts_enabled=${account.payouts_enabled}`)
  record('account country', Boolean(account.country), `country=${account.country}, default_currency=${account.default_currency}`)
} catch (err) {
  record('live-mode API read succeeds', false, String(err?.message ?? err).slice(0, 200))
}

if (pk) {
  record('publishable key is LIVE mode', /^pk_live_/.test(pk), `prefix ${pk.slice(0, 8)}`)
  record(
    'publishable and secret keys are the SAME account',
    embed(pk) === embed(sk),
    `pk embeds ${embed(pk)}, sk embeds ${embed(sk)}`,
  )
} else {
  record('publishable key present', false, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set')
}

const failed = checks.filter((c) => !c.pass)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length) {
  console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
}
process.exitCode = failed.length ? 2 : 0
