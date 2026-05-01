#!/usr/bin/env node
/**
 * m6-phase2-e2e-orchestrator.mts
 *
 * Two-phase orchestrator for the Phase 2 live Stripe Connect E2E. The
 * pause for hosted KYC happens between phases so each phase can run
 * non-interactively and produce parseable stdout.
 *
 *   Phase setup:   reset state, test gate (e), create Stripe account,
 *                  stamp stripe_account_id on org row, mint AccountLink,
 *                  print URL with banner, write state to disk, exit 0.
 *   Phase verify:  read state, poll Supabase for webhook-driven update,
 *                  assert (a) (b) (c) (d) (f), cleanup, write results.
 *
 * Run:
 *   npx tsx scripts/m6-phase2-e2e-orchestrator.mts setup
 *   # human completes KYC in browser
 *   npx tsx scripts/m6-phase2-e2e-orchestrator.mts verify
 *
 * Prereq: stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
 *         must be running and its webhook signing secret must match
 *         STRIPE_WEBHOOK_SECRET in .env.local.
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readFileSync as readFile,
} from 'node:fs'
import { resolve } from 'node:path'
import Stripe from 'stripe'

// Load .env.local before the rest of the module reads process.env. The
// auth fixture also loads it lazily, but we touch process.env directly
// for STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET checks above any auth
// helper call.
function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const rawLine of readFile(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
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
loadEnvLocal()
import {
  adminClient,
  ensureTestOrganiser,
  setConnectState,
} from '../tests/fixtures/auth.mts'

// Inlined from src/lib/stripe/connect.ts. Cross-resolution from .mts
// into .ts named exports breaks under Node 24 ESM strict mode, so the
// few helpers used here are reproduced verbatim. If the production
// helpers grow, mirror the change here.
const STRIPE_API_VERSION = '2026-03-25.dahlia' as const
function makeStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION })
}
async function createExpressAccount(input: {
  organisationId: string
  country: string
  email: string
}): Promise<Stripe.Account> {
  return makeStripe().accounts.create({
    type: 'express',
    country: input.country,
    email: input.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      organisation_id: input.organisationId,
      eventlinqs_phase: 'm6_phase2',
    },
  })
}
async function createAccountLink(input: {
  accountId: string
  refreshUrl: string
  returnUrl: string
}): Promise<Stripe.AccountLink> {
  return makeStripe().accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: 'account_onboarding',
    collection_options: { fields: 'currently_due' },
  })
}
async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  return makeStripe().accounts.retrieve(accountId)
}
function isFullyOnboarded(account: Stripe.Account): boolean {
  return Boolean(
    account.charges_enabled && account.payouts_enabled && account.details_submitted
  )
}

const RESULTS_PATH = resolve('docs/m6/audit/phase2/e2e-results.txt')
const STATE_PATH = resolve('.tmp/m6-e2e-state.json')
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type AssertionResult = {
  id: string
  label: string
  pass: boolean
  detail: string
}

function info(line: string) {
  console.log(line)
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

async function checkPublishGate(
  organisationId: string,
  tiersHavePaid: boolean
): Promise<{ ok: boolean; reason?: string }> {
  if (!tiersHavePaid) return { ok: true }
  const admin = adminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('stripe_charges_enabled, payout_status')
    .eq('id', organisationId)
    .maybeSingle()
  if (!org) return { ok: false, reason: 'organisation_not_found' }
  if (!org.stripe_charges_enabled) {
    return { ok: false, reason: 'paid_event_charges_disabled' }
  }
  if (org.payout_status === 'restricted') {
    return { ok: false, reason: 'organisation_payouts_restricted' }
  }
  return { ok: true }
}

async function pollForChargesEnabled(
  organisationId: string,
  deadlineMs = 5 * 60 * 1000,
  intervalMs = 5_000
): Promise<{ chargesEnabled: boolean; payoutTier: string | null }> {
  const admin = adminClient()
  const start = Date.now()
  let last: Record<string, unknown> | null = null
  while (Date.now() - start < deadlineMs) {
    const { data: org } = await admin
      .from('organisations')
      .select(
        'stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, payout_tier'
      )
      .eq('id', organisationId)
      .maybeSingle()
    last = (org as Record<string, unknown> | null) ?? null
    info(
      `  poll: charges=${org?.stripe_charges_enabled} payouts=${org?.stripe_payouts_enabled} onboarding=${org?.stripe_onboarding_complete} tier=${org?.payout_tier}`
    )
    if (org?.stripe_charges_enabled === true) {
      return {
        chargesEnabled: true,
        payoutTier: (org.payout_tier as string | null) ?? null,
      }
    }
    await sleep(intervalMs)
  }
  return {
    chargesEnabled: Boolean(last?.stripe_charges_enabled),
    payoutTier: (last?.payout_tier as string | null) ?? null,
  }
}

async function setup() {
  console.log('='.repeat(72))
  console.log('M6 Phase 2 E2E - SETUP phase')
  console.log(new Date().toISOString())
  console.log('='.repeat(72))

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret || !secret.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY missing or not sk_test_')
  }
  info('[env] sk_test_ confirmed')

  const { organisationId } = await ensureTestOrganiser()
  info(`[seed] organisationId=${organisationId}`)
  await setConnectState(organisationId, 'not_started')
  info('[seed] connect state reset to not_started')

  // Assertion (e) precondition: paid event publish must be blocked.
  info('\n[assert e] testing publish-gate before KYC...')
  const beforeGate = await checkPublishGate(organisationId, true)
  const eResult: AssertionResult = {
    id: 'e',
    label: 'paid event publish blocked before KYC',
    pass:
      beforeGate.ok === false &&
      beforeGate.reason === 'paid_event_charges_disabled',
    detail: `gate.ok=${beforeGate.ok} reason=${beforeGate.reason ?? 'n/a'}`,
  }
  console.log(
    `  [${eResult.pass ? 'PASS' : 'FAIL'}] e ${eResult.label}: ${eResult.detail}`
  )

  // Create Stripe account.
  info('\n[step] creating Stripe Express account...')
  const account = await createExpressAccount({
    organisationId,
    country: 'US',
    email: 'phase2-e2e-us@phase2.test',
  })
  info(`[step] accountId=${account.id}`)

  const admin = adminClient()
  const { error: stampErr } = await admin
    .from('organisations')
    .update({
      stripe_account_id: account.id,
      stripe_account_country: 'US',
      updated_at: new Date().toISOString(),
    })
    .eq('id', organisationId)
  if (stampErr) throw stampErr
  info('[step] stamped stripe_account_id on org row')

  const link = await createAccountLink({
    accountId: account.id,
    refreshUrl: `${APP_URL()}/api/stripe/connect/refresh?org=${organisationId}`,
    returnUrl: `${APP_URL()}/api/stripe/connect/return?org=${organisationId}`,
  })
  if (!link.url) throw new Error('AccountLink missing url')

  // Persist state for the verify phase.
  mkdirSync(resolve('.tmp'), { recursive: true })
  const state = {
    organisationId,
    accountId: account.id,
    accountLinkUrl: link.url,
    setupAt: new Date().toISOString(),
    eAssertion: eResult,
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  info(`[state] wrote ${STATE_PATH}`)

  console.log('\n')
  console.log('='.repeat(72))
  console.log('===== AWAITING HUMAN KYC =====')
  console.log('='.repeat(72))
  console.log()
  console.log('Open this URL in a browser. Stripe Test mode offers a')
  console.log('"use test data" link that auto-fills the form.')
  console.log()
  console.log(link.url)
  console.log()
  console.log('After the form is submitted, run:')
  console.log('  npx tsx scripts/m6-phase2-e2e-orchestrator.mts verify')
  console.log()
  console.log('PAUSED_AWAITING_KYC')
  console.log('='.repeat(72))
}

async function verify() {
  console.log('='.repeat(72))
  console.log('M6 Phase 2 E2E - VERIFY phase')
  console.log(new Date().toISOString())
  console.log('='.repeat(72))

  if (!existsSync(STATE_PATH)) {
    throw new Error(`state file missing: ${STATE_PATH} (run setup phase first)`)
  }
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as {
    organisationId: string
    accountId: string
    accountLinkUrl: string
    setupAt: string
    eAssertion: AssertionResult
  }
  info(`[state] org=${state.organisationId} account=${state.accountId}`)

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret || !secret.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY missing or not sk_test_')
  }

  const assertions: AssertionResult[] = [state.eAssertion]

  info('\n[poll] waiting up to 5 minutes for webhook-driven org update...')
  const polled = await pollForChargesEnabled(state.organisationId)

  const stripeAccount = await retrieveAccount(state.accountId)
  const fullyOnboarded = isFullyOnboarded(stripeAccount)
  info(
    `\n[stripe] charges_enabled=${stripeAccount.charges_enabled} payouts_enabled=${stripeAccount.payouts_enabled} details_submitted=${stripeAccount.details_submitted} fullyOnboarded=${fullyOnboarded}`
  )

  // (a) webhook delivered: indirectly proven by the row mutation.
  assertions.push({
    id: 'a',
    label: 'stripe-cli forwarded account.updated to local webhook',
    pass: polled.chargesEnabled === true,
    detail: polled.chargesEnabled
      ? 'org row stripe_charges_enabled flipped to true (proves Stripe -> stripe-cli -> /api/webhooks/stripe -> signature verify -> Supabase update)'
      : 'org row stripe_charges_enabled never flipped within 5min budget',
  })

  // (b) charges_enabled true.
  assertions.push({
    id: 'b',
    label: 'capabilities.charges_enabled true after KYC',
    pass: stripeAccount.charges_enabled === true,
    detail: `Stripe.account.charges_enabled=${stripeAccount.charges_enabled}`,
  })

  // (c) payout_tier === 'tier_1'.
  assertions.push({
    id: 'c',
    label: 'organisations.payout_tier === tier_1',
    pass: polled.payoutTier === 'tier_1',
    detail: `payout_tier=${polled.payoutTier}`,
  })

  // (d) tier_progression_log row inserted.
  const admin = adminClient()
  const { data: logRows, error: logErr } = await admin
    .from('tier_progression_log')
    .select('id, from_tier, to_tier, reason, metadata, created_at')
    .eq('organisation_id', state.organisationId)
    .order('created_at', { ascending: false })
    .limit(10)
  const autoPromotionRow = (logRows ?? []).find(
    (r) =>
      r.reason === 'auto_promotion' &&
      ((r.metadata as Record<string, unknown> | null)?.stripe_account_id ===
        state.accountId)
  )
  assertions.push({
    id: 'd',
    label: 'tier_progression_log row inserted (auto_promotion)',
    pass: Boolean(autoPromotionRow),
    detail: autoPromotionRow
      ? `id=${autoPromotionRow.id} from=${autoPromotionRow.from_tier} to=${autoPromotionRow.to_tier} reason=${autoPromotionRow.reason}`
      : `no matching row (rows=${logRows?.length ?? 0}, error=${logErr?.message ?? 'none'})`,
  })

  // (f) paid event publish allowed.
  info('\n[assert f] testing publish-gate after KYC...')
  const afterGate = await checkPublishGate(state.organisationId, true)
  assertions.push({
    id: 'f',
    label: 'paid event publish allowed after KYC',
    pass: afterGate.ok === true,
    detail: `gate.ok=${afterGate.ok} reason=${afterGate.reason ?? 'n/a'}`,
  })

  // Cleanup.
  info('\n[cleanup] tearing down test Stripe account...')
  const stripe = new Stripe(secret, { apiVersion: '2026-03-25.dahlia' })
  let cleanupDetail = ''
  try {
    const del = await stripe.accounts.del(state.accountId)
    cleanupDetail = `accounts.del deleted=${del.deleted}`
    info(`[cleanup] ${cleanupDetail}`)
  } catch (err) {
    cleanupDetail = `accounts.del FAILED: ${(err as Error).message}`
    info(`[cleanup] ${cleanupDetail}`)
  }

  await setConnectState(state.organisationId, 'not_started')
  info('[cleanup] org connect state reset to not_started')

  // Build results file.
  const allPass = assertions.every((a) => a.pass)
  const lines = [
    'M6 Phase 2 - Live Stripe Test Mode E2E (RUN COMPLETE)',
    '=====================================================',
    `Date:         ${new Date().toISOString()}`,
    'Branch:       feat/sprint1-phase1b-performance-and-visual',
    'Mode:         Stripe Test (sk_test_)',
    `Test org:     ${state.organisationId}`,
    `Test account: ${state.accountId} (deleted)`,
    `Webhook:      stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`,
    `Setup at:     ${state.setupAt}`,
    `Verify at:    ${new Date().toISOString()}`,
    `Verdict:      ${allPass ? 'PASS' : 'FAIL'}`,
    '',
    'Assertions',
    '----------',
    ...assertions.map(
      (a) => `[${a.pass ? 'PASS' : 'FAIL'}] (${a.id}) ${a.label}\n        ${a.detail}`
    ),
    '',
    'Webhook chain proof',
    '-------------------',
    'The (a) assertion is intentionally indirect: the test does not parse',
    'stripe-cli stdout for the event line. Instead it asserts that the',
    'organisation row in Supabase had stripe_charges_enabled flipped to',
    'true. That single check covers the entire chain:',
    '  Stripe -> stripe-cli forwarder -> /api/webhooks/stripe ->',
    '  signature verification with STRIPE_WEBHOOK_SECRET -> Supabase update.',
    'If any link breaks, the row stays false and the assertion fails.',
    '',
    'Cleanup',
    '-------',
    cleanupDetail,
    'org row reset to not_started so re-runs are deterministic',
  ]
  writeFileSync(RESULTS_PATH, lines.join('\n') + '\n')
  info(`\n[done] wrote ${RESULTS_PATH}`)
  console.log()
  console.log('='.repeat(72))
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`)
  console.log('='.repeat(72))
  process.exit(allPass ? 0 : 1)
}

const phase = process.argv[2]
if (phase === 'setup') {
  setup().catch((err) => {
    console.error('SETUP ERROR:', err)
    process.exit(1)
  })
} else if (phase === 'verify') {
  verify().catch((err) => {
    console.error('VERIFY ERROR:', err)
    process.exit(1)
  })
} else {
  console.error('Usage: m6-phase2-e2e-orchestrator.mts <setup|verify>')
  process.exit(2)
}
