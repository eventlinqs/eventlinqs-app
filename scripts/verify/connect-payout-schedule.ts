/**
 * Proof: a freshly created Stripe Connect Express account carries the platform
 * payout schedule we set, rather than inheriting Stripe's account default.
 *
 * Drives the REAL code path (`createExpressAccount` from src/lib/stripe/connect)
 * so the proof covers the shipping call, not a re-implementation of it.
 *
 * Steps:
 *   1. Assert the Stripe key is TEST mode. Refuses to run against a live key.
 *   2. Create an AU Express account via createExpressAccount().
 *   3. Read the account back from Stripe and print
 *      settings.payouts.schedule (interval, delay_days).
 *   4. Compare against the requested delay and the AU minimum.
 *   5. Delete the test account so nothing is left behind.
 *
 * Run: npx tsx scripts/verify/connect-payout-schedule.ts
 * Requires STRIPE_SECRET_KEY (test mode) in the environment.
 */

import Stripe from 'stripe'
import { createExpressAccount } from '../../src/lib/stripe/connect'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/**
 * Stripe's minimum connected-account payout delay for Australia. Stripe rejects
 * anything lower, so the resolved pricing_rules value must be at or above it.
 */
const AU_MINIMUM_DELAY_DAYS = 2

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error(
      `Refusing to run: STRIPE_SECRET_KEY is not a test key (starts "${key.slice(0, 8)}"). ` +
        'This script creates and deletes accounts and must never touch live mode.'
    )
  }
  console.log(`${DIM}Stripe key mode: ${key.slice(0, 8)}...${RESET}`)

  const requestedDelayDays = Number(process.env.PROOF_DELAY_DAYS ?? 3)
  console.log(`${DIM}Requested delay_days: ${requestedDelayDays}${RESET}\n`)

  const account = await createExpressAccount({
    organisationId: '00000000-0000-0000-0000-000000000000',
    country: 'AU',
    email: `payout-schedule-proof-${Date.now()}@eventlinqs-proof.invalid`,
    payoutDelayDays: requestedDelayDays,
  })
  console.log(`created account: ${account.id}`)

  const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  try {
    const readBack = await stripe.accounts.retrieve(account.id)
    const schedule = readBack.settings?.payouts?.schedule

    console.log('\n--- READ BACK FROM STRIPE ---')
    console.log(`country          : ${readBack.country}`)
    console.log(`default_currency : ${readBack.default_currency}`)
    console.log(`schedule         : ${JSON.stringify(schedule)}`)
    console.log('-----------------------------\n')

    const interval = schedule?.interval
    const delayDays = schedule?.delay_days

    const intervalOk = interval === 'daily'
    const delayOk = delayDays === requestedDelayDays
    const minimumOk = typeof delayDays === 'number' && delayDays >= AU_MINIMUM_DELAY_DAYS

    console.log(`interval is "daily"              : ${intervalOk ? 'PASS' : `FAIL (got "${interval}")`}`)
    console.log(`delay_days equals requested (${requestedDelayDays}) : ${delayOk ? 'PASS' : `FAIL (got ${delayDays})`}`)
    console.log(`delay_days >= AU minimum (${AU_MINIMUM_DELAY_DAYS})     : ${minimumOk ? 'PASS' : `FAIL (got ${delayDays})`}`)
    console.log(
      `\nNOT manual (organisers are paid out automatically): ${
        interval !== 'manual' ? 'PASS' : 'FAIL'
      }`
    )

    if (!intervalOk || !delayOk || !minimumOk) process.exitCode = 1
  } finally {
    const deleted = await stripe.accounts.del(account.id)
    console.log(`\n${DIM}cleanup: deleted ${account.id} (deleted=${deleted.deleted})${RESET}`)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
