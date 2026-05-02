/**
 * verify-stripe-connect-ready.ts
 *
 * Programmatic gate for M6 Phase 2. Reads STRIPE_SECRET_KEY from env, hits
 * the Stripe API in test mode, and verifies that platform configuration,
 * statement descriptors, webhook registration, and required event
 * subscriptions are all in place. Logs one line per check, exits 0 on
 * full green, 1 on any red.
 *
 * Run: npx tsx scripts/verify-stripe-connect-ready.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const results: { ok: boolean; line: string }[] = []

function pass(label: string, detail = '') {
  const line = `${GREEN}GREEN${RESET} ${label}${detail ? `: ${DIM}${detail}${RESET}` : ''}`
  results.push({ ok: true, line })
  console.log(line)
}

function fail(label: string, reason: string) {
  const line = `${RED}RED${RESET}   ${label}: ${reason}`
  results.push({ ok: false, line })
  console.log(line)
}

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  const raw = fs.readFileSync(file, 'utf8')
  for (const rawLine of raw.split(/\r?\n/)) {
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

const REQUIRED_PAYMENT_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.requires_action',
  'payment_intent.canceled',
  'charge.refunded',
] as const

const REQUIRED_CONNECT_EVENTS = [
  'account.updated',
  'account.application.deauthorized',
  'payout.created',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
  'transfer.created',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const

const REQUIRED_EVENTS: readonly string[] = [
  ...REQUIRED_PAYMENT_EVENTS,
  ...REQUIRED_CONNECT_EVENTS,
]

const WEBHOOK_PATH_SUFFIX = '/api/webhooks/stripe'
const EXPECTED_DESCRIPTOR = 'EVENTLINQS'
const EXPECTED_DESCRIPTOR_PREFIX = 'ELINQS'

async function main() {
  console.log(`${DIM}Stripe Connect Test mode readiness check${RESET}`)
  console.log(`${DIM}M6 Phase 2 gate. ${new Date().toISOString()}${RESET}\n`)

  loadEnvLocal()

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (secretKey && secretKey.startsWith('sk_test_')) {
    pass('STRIPE_SECRET_KEY present, sk_test_ prefix')
  } else if (secretKey) {
    fail('STRIPE_SECRET_KEY prefix', 'present but does not start with sk_test_')
  } else {
    fail('STRIPE_SECRET_KEY', 'missing from environment')
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (publishableKey && publishableKey.startsWith('pk_test_')) {
    pass('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY present, pk_test_ prefix')
  } else if (publishableKey) {
    fail(
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY prefix',
      'present but does not start with pk_test_'
    )
  } else {
    fail('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'missing from environment')
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (webhookSecret && webhookSecret.startsWith('whsec_')) {
    pass('STRIPE_WEBHOOK_SECRET present, whsec_ prefix')
  } else if (webhookSecret) {
    fail(
      'STRIPE_WEBHOOK_SECRET prefix',
      'present but does not start with whsec_'
    )
  } else {
    fail('STRIPE_WEBHOOK_SECRET', 'missing from environment')
  }

  if (!secretKey) {
    summarise()
    return
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2026-03-25.dahlia' })

  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve()
    pass('API connectivity', `accounts.retrieve() returned id ${account.id}`)
  } catch (err) {
    fail('API connectivity', errMsg(err))
    summarise()
    return
  }

  if (account.id && !account.id.startsWith('acct_')) {
    fail('Platform account id shape', `unexpected id ${account.id}`)
  } else {
    pass('Platform account id shape', account.id)
  }

  if (account.type) {
    pass('Platform account type', account.type)
  } else {
    pass('Platform account type', 'standard (no explicit type)')
  }

  const livemode = (account as unknown as { livemode?: boolean }).livemode
  if (livemode === false) {
    pass('Test mode confirmed', 'livemode=false')
  } else if (livemode === undefined) {
    if (secretKey.startsWith('sk_test_')) {
      pass(
        'Test mode confirmed',
        'livemode flag absent on account; sk_test_ prefix is authoritative'
      )
    } else {
      fail('Test mode confirmed', 'cannot infer test mode from key or account')
    }
  } else {
    fail('Test mode confirmed', `livemode=${String(livemode)} (expected false)`)
  }

  const capabilities = account.capabilities ?? {}
  console.log(
    `${DIM}  account.capabilities: ${JSON.stringify(capabilities, null, 2)}${RESET}`
  )

  try {
    const list = await stripe.accounts.list({ limit: 1 })
    pass(
      'Connect platform capability',
      `accounts.list() succeeded; ${list.data.length} connected account(s) visible`
    )
  } catch (err) {
    fail('Connect platform capability', errMsg(err))
  }

  const settings = account.settings
  if (settings) {
    const stmt = settings.payments?.statement_descriptor
    if (stmt === EXPECTED_DESCRIPTOR) {
      pass(
        'settings.payments.statement_descriptor',
        `"${stmt}" === "${EXPECTED_DESCRIPTOR}"`
      )
    } else {
      fail(
        'settings.payments.statement_descriptor',
        `expected "${EXPECTED_DESCRIPTOR}" got ${stmt ? `"${stmt}"` : 'undefined'}`
      )
    }
    const prefix = settings.card_payments?.statement_descriptor_prefix
    if (prefix === EXPECTED_DESCRIPTOR_PREFIX) {
      pass(
        'settings.card_payments.statement_descriptor_prefix',
        `"${prefix}" === "${EXPECTED_DESCRIPTOR_PREFIX}"`
      )
    } else {
      fail(
        'settings.card_payments.statement_descriptor_prefix',
        `expected "${EXPECTED_DESCRIPTOR_PREFIX}" got ${prefix ? `"${prefix}"` : 'undefined'}`
      )
    }
  } else {
    fail('account.settings', 'absent on platform account response')
  }

  let endpoints: Stripe.WebhookEndpoint[] = []
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 })
    endpoints = list.data
    pass('Webhook endpoint inventory fetch', `${endpoints.length} endpoint(s)`)
  } catch (err) {
    fail('Webhook endpoint inventory fetch', errMsg(err))
    summarise()
    return
  }

  const matching = endpoints.filter((e) => (e.url ?? '').endsWith(WEBHOOK_PATH_SUFFIX))
  if (matching.length === 0) {
    fail(
      'Webhook endpoint registered',
      `no endpoint url ends with "${WEBHOOK_PATH_SUFFIX}"`
    )
    console.log(
      `${DIM}  registered urls: ${endpoints.map((e) => e.url).join(', ') || '(none)'}${RESET}`
    )
  } else {
    pass(
      'Webhook endpoint registered',
      `${matching.length} match(es) for "${WEBHOOK_PATH_SUFFIX}"`
    )
  }

  const enabledMatching = matching.filter((e) => e.status === 'enabled')
  if (matching.length > 0) {
    if (enabledMatching.length > 0) {
      pass(
        'Webhook endpoint status',
        enabledMatching.map((e) => `${e.id} status=enabled`).join(', ')
      )
    } else {
      fail(
        'Webhook endpoint status',
        `match(es) found but none status=enabled: ${matching.map((e) => `${e.id} status=${e.status}`).join(', ')}`
      )
    }
  }

  const subscribedEvents = new Set<string>()
  let wildcardSubscribed = false
  for (const ep of enabledMatching) {
    const evts = ep.enabled_events ?? []
    for (const evt of evts) {
      if (evt === '*') wildcardSubscribed = true
      subscribedEvents.add(evt)
    }
  }

  for (const evt of REQUIRED_EVENTS) {
    if (wildcardSubscribed || subscribedEvents.has(evt)) {
      pass(`event ${evt}`, 'subscribed')
    } else {
      fail(`event ${evt}`, 'not in any matching enabled webhook')
    }
  }

  summarise()
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function summarise() {
  const reds = results.filter((r) => !r.ok).length
  const greens = results.filter((r) => r.ok).length
  console.log('')
  if (reds === 0) {
    console.log(
      `${GREEN}SUMMARY${RESET} ${greens} green, 0 red. Stripe Connect Test mode is ready for M6 Phase 2.`
    )
    process.exit(0)
  } else {
    console.log(
      `${RED}SUMMARY${RESET} ${greens} green, ${reds} red. Stripe Connect Test mode is NOT ready. Resolve red items before Phase 2.`
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`${RED}FATAL${RESET} unhandled error in verification script:`, err)
  process.exit(1)
})
