/**
 * PAY-01 verification: Stripe test-mode round-trip.
 *
 * Creates an AU Express connected account with the platform payout schedule
 * (interval daily, delay_days = payout_schedule_days), retrieves it, asserts
 * the schedule stuck, then DELETES the throwaway test account. Test mode only -
 * refuses to run on a live key. Proves Stripe accepts and persists the exact
 * params src/lib/stripe/connect.ts now sends.
 */
import Stripe from 'stripe'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  if (!(k in process.env)) process.env[k] = v
}

const key = process.env.STRIPE_SECRET_KEY
if (!key || !key.startsWith('sk_test_')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a test key (sk_test_...). Aborting.')
  process.exit(1)
}

const DELAY_DAYS = 3 // pricing_rules payout_schedule_days (AU launch default)
const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })

let acctId
try {
  const acct = await stripe.accounts.create({
    type: 'express',
    country: 'AU',
    email: 'pay01-verify@example.test',
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: 'daily', delay_days: DELAY_DAYS } } },
    metadata: { organisation_id: 'pay01-verify', eventlinqs_phase: 'pay01_verify' },
  })
  acctId = acct.id
  console.log('CREATED account:', acctId)

  const got = await stripe.accounts.retrieve(acctId)
  const sched = got.settings?.payouts?.schedule
  console.log('RETRIEVED schedule:', JSON.stringify(sched))

  const ok = sched?.interval === 'daily' && sched?.delay_days === DELAY_DAYS
  console.log(ok ? `PASS: interval=daily delay_days=${DELAY_DAYS}` : `FAIL: got ${JSON.stringify(sched)}`)
  process.exitCode = ok ? 0 : 1
} catch (err) {
  console.error('ERROR during round-trip:', err?.message ?? err)
  process.exitCode = 1
} finally {
  if (acctId) {
    try {
      const del = await stripe.accounts.del(acctId)
      console.log('CLEANUP deleted account:', acctId, 'deleted=', del.deleted)
    } catch (e) {
      console.error('CLEANUP FAILED for', acctId, '-', e?.message ?? e)
    }
  }
}
