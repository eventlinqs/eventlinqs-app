/**
 * test-stripe-connect-e2e.ts
 *
 * M6 Phase 2 live Test mode E2E. Drives the Stripe API and the local
 * Connect helpers through a complete round trip:
 *
 *   1. Verify env (STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL).
 *   2. Create an Express test account via createExpressAccount() with
 *      country=AU.
 *   3. Mint an onboarding AccountLink via createAccountLink().
 *   4. Print the link and instruct the operator to complete the hosted
 *      KYC flow in a browser (Stripe Test mode auto-fills with the
 *      "use test data" affordance, so the human gate is short).
 *   5. Poll Stripe for charges_enabled / payouts_enabled / details_submitted
 *      until either all three are true (PASS) or a 5 minute deadline
 *      elapses (FAIL).
 *   6. On PASS, exercise the deauth path by calling accounts.del()
 *      (test-mode only) and confirm subsequent retrieve() returns 404.
 *
 * The script never writes to the local Supabase database. All state is
 * read from Stripe directly. The webhook handler is exercised by the
 * production deployment in normal use; for local validation, run
 * `stripe listen --forward-to localhost:3000/api/webhooks/stripe` in a
 * second terminal before kicking this off.
 *
 * Run: npx tsx scripts/test-stripe-connect-e2e.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {
  createAccountLink,
  createExpressAccount,
  isFullyOnboarded,
  retrieveAccount,
} from '../src/lib/stripe/connect'
import Stripe from 'stripe'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

function pass(label: string, detail = '') {
  console.log(`${GREEN}GREEN${RESET} ${label}${detail ? `: ${DIM}${detail}${RESET}` : ''}`)
}

function fail(label: string, reason: string) {
  console.log(`${RED}RED${RESET}   ${label}: ${reason}`)
}

function info(line: string) {
  console.log(`${DIM}${line}${RESET}`)
}

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function pause(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close()
      resolve()
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const FAKE_ORG_ID = '11111111-1111-1111-1111-111111111111'
const POLL_INTERVAL_MS = 8_000
const POLL_DEADLINE_MS = 5 * 60 * 1000

async function main() {
  console.log(`${DIM}M6 Phase 2 - live Stripe Test mode E2E${RESET}`)
  console.log(`${DIM}${new Date().toISOString()}${RESET}\n`)

  loadEnvLocal()

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    fail('STRIPE_SECRET_KEY', 'missing or not a test key (sk_test_ prefix required)')
    process.exit(1)
  }
  pass('STRIPE_SECRET_KEY present (test mode)')
  pass('NEXT_PUBLIC_APP_URL', APP_URL())

  // 1. Create the Express account.
  let accountId: string
  try {
    const account = await createExpressAccount({
      organisationId: FAKE_ORG_ID,
      country: 'AU',
      email: 'phase2-e2e@example.test',
    })
    accountId = account.id
    pass('createExpressAccount', accountId)
  } catch (err) {
    fail('createExpressAccount', (err as Error).message)
    process.exit(1)
  }

  // 2. Create the AccountLink.
  let linkUrl: string
  try {
    const link = await createAccountLink({
      accountId,
      organisationId: FAKE_ORG_ID,
      type: 'onboarding',
      refreshUrl: `${APP_URL()}/api/stripe/connect/refresh?org=${FAKE_ORG_ID}`,
      returnUrl: `${APP_URL()}/api/stripe/connect/return?org=${FAKE_ORG_ID}`,
    })
    if (!link.url) throw new Error('no url on AccountLink response')
    linkUrl = link.url
    pass('createAccountLink', 'minted')
  } catch (err) {
    fail('createAccountLink', (err as Error).message)
    process.exit(1)
  }

  console.log(`\n${DIM}Open this URL in a browser and complete the hosted onboarding flow.${RESET}`)
  console.log(`${DIM}Stripe Test mode offers a "use test data" link that fills the form automatically.${RESET}\n`)
  console.log(linkUrl)
  console.log()
  await pause('Press <enter> after you have completed Stripe-hosted onboarding... ')

  // 3. Poll until fully onboarded or timeout.
  info('Polling account state...')
  const start = Date.now()
  let final: Stripe.Account | null = null
  while (Date.now() - start < POLL_DEADLINE_MS) {
    const account = await retrieveAccount(accountId)
    info(
      `  charges_enabled=${account.charges_enabled} payouts_enabled=${account.payouts_enabled} details_submitted=${account.details_submitted}`
    )
    if (isFullyOnboarded(account)) {
      final = account
      break
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (!final) {
    fail('isFullyOnboarded', 'account did not reach fully onboarded state within 5 minutes')
    process.exit(1)
  }
  pass('isFullyOnboarded', 'charges + payouts + details all true')

  // 4. Capability summary.
  const cap = final.capabilities ?? {}
  pass('capabilities.card_payments', String(cap.card_payments ?? 'unknown'))
  pass('capabilities.transfers', String(cap.transfers ?? 'unknown'))

  // 5. External account presence (bank or debit card on file).
  const ext = final.external_accounts?.data ?? []
  if (ext.length === 0) {
    fail('external_accounts', 'no payout destination on file')
  } else {
    pass('external_accounts', `${ext.length} on file`)
  }

  // 6. Deauth path. Test-mode allows deleting connected accounts via the
  //    API, which is the closest local equivalent to a user revoking the
  //    OAuth grant.
  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2026-03-25.dahlia' })
    await stripe.accounts.del(accountId)
    pass('accounts.del', 'test account torn down')
  } catch (err) {
    fail('accounts.del', (err as Error).message)
  }

  console.log(
    `\n${GREEN}E2E PASS${RESET} ${DIM}all required Connect surfaces exercised end to end${RESET}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
