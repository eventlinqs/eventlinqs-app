/**
 * DRIVEN PROOF: THE DAILY SETTLEMENT RECONCILIATION FINDS MONEY THE PLATFORM
 * DOES NOT SAY IT OWES, AND NAMES THE CHARGE.
 *
 * Close-out MONEY FIX, part A, A3 layer three, acceptance line 9:
 *
 *     "The daily reconciliation proven by planting a simulated platform side
 *      ticket charge in TEST data and confirming a P0 line naming it appears in
 *      REVIEW-QUEUE.md."
 *
 * ----------------------------------------------------------------------------
 * WHAT IS PLANTED, AND WHY IT IS A REAL CHARGE RATHER THAN A FIXTURE.
 *
 * A fixture fed to the rule would prove the rule and nothing else. The failure
 * this alarm exists to catch was not a logic error: it was money arriving in a
 * real Stripe balance with nothing recording it. So the plant is a REAL Stripe
 * TEST PaymentIntent, confirmed with Stripe's own test card, which settles into
 * the platform TEST balance and is then read back by the REAL lister
 * (src/lib/stripe/settled-charges.ts), judged by the REAL rule
 * (src/lib/payments/platform-settlement-reconcile.ts), against the REAL TEST
 * database. Every link in the chain is exercised.
 *
 * THREE CHARGES ARE PLANTED, NOT ONE, because an alarm that only ever fires is
 * worth as little as one that never does:
 *
 *   1. UNROUTED. transfer_group names an order id with no order_confirmed row
 *      in organiser_balance_ledger. Must be found, and the P0 must name it.
 *   2. UNATTRIBUTABLE. No transfer_group at all, which is the shape of the
 *      A$2.03 payment of 18 August 2026 sitting in the same real payout. Must
 *      be found, and the P0 must name it.
 *   3. HEALTHY. transfer_group names a real TEST order that DOES carry an
 *      order_confirmed ledger row, enumerated from the database rather than
 *      typed. Must NOT be found. This is the half that proves the alarm is not
 *      simply reporting everything.
 *
 * ----------------------------------------------------------------------------
 * IT REFUSES BEFORE IT ACTS (Law 10, rule 3).
 *
 *   - It refuses any Stripe key that is not `sk_test_`.
 *   - It refuses any Supabase URL carrying the production project ref.
 *   - It never writes to the database. The only writes it makes anywhere are
 *     the three Stripe TEST PaymentIntents it plants, which are named in its
 *     own output, and the REVIEW-QUEUE.md block, which is the deliverable.
 *
 * ----------------------------------------------------------------------------
 * Usage (the shell must not carry the production Supabase URL):
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *     scripts/verify/platform-settlement-reconcile-proof.mjs \
 *     --out C:/dev/EVIDENCE/MONEY-A3L3 --plant --append-review-queue
 *
 * Without --plant it scans and reports only. Without --append-review-queue it
 * prints the block instead of writing it.
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { readStripeTestKeys } from './lib/stripe-cli-test-keys.mjs'

import {
  scanPlatformSettlement,
  describeSettlementFindings,
} from '@/lib/payments/platform-settlement-reconcile'

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const REVIEW_QUEUE = 'C:/dev/REVIEW-QUEUE.md'
const STRIPE_API_VERSION = '2026-03-25.dahlia'

const args = process.argv.slice(2)
const outDir = valueOf('--out') ?? 'C:/dev/EVIDENCE/MONEY-A3L3'
const doPlant = args.includes('--plant')
const doAppend = args.includes('--append-review-queue')

function valueOf(flag) {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1]
}

function refuse(why) {
  console.error(`\n[settlement-proof] REFUSED BEFORE ACTING: ${why}\n`)
  process.exit(2)
}

// ── THE REFUSALS, RUN BEFORE ANYTHING ───────────────────────────────────────

/*
 * THE KEY, FROM THE ENVIRONMENT OR FROM THE STRIPE CLI, AND TEST EITHER WAY.
 *
 * `.env.local` on this machine carries an EMPTY STRIPE_SECRET_KEY, and the
 * working TEST pair lives in the Stripe CLI config. readStripeTestKeys refuses
 * anything that is not an sk_test_/pk_test_ pair, and the prefix is asserted
 * again here, because this proof CREATES charges and a live key would create
 * them with real money.
 */
let stripeKey = process.env.STRIPE_SECRET_KEY
if (!stripeKey) {
  const fromCli = readStripeTestKeys()
  if (!fromCli.ok) {
    refuse(
      `STRIPE_SECRET_KEY is not set and the Stripe CLI config did not yield a TEST pair: ${fromCli.reason}`,
    )
  }
  stripeKey = fromCli.secretKey
  console.log(`[settlement-proof] using the Stripe CLI TEST pair for ${fromCli.accountId}`)
}
if (!stripeKey.startsWith('sk_test_')) {
  refuse(
    'the Stripe key is not a TEST key. This proof creates charges and will not do that against live Stripe.',
  )
}
/*
 * The PRODUCT reads STRIPE_SECRET_KEY from the environment, as it does on
 * Vercel, so the resolved TEST key is put there rather than handed to the
 * product through a back door. This proof drives the real lister, and the real
 * lister must build its client the way it does in production or the proof is
 * about something else.
 */
process.env.STRIPE_SECRET_KEY = stripeKey

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl) refuse('no Supabase URL in the environment')
if (!serviceKey) refuse('SUPABASE_SERVICE_ROLE_KEY is not set')
if (supabaseUrl.includes(PRODUCTION_REF)) {
  refuse(`the Supabase URL names the PRODUCTION project ${PRODUCTION_REF}. This proof runs on TEST only.`)
}

mkdirSync(outDir, { recursive: true })

const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION })
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const log = []
function say(line) {
  console.log(line)
  log.push(line)
}

say(`[settlement-proof] Supabase ${supabaseUrl}`)
say(`[settlement-proof] Stripe key ${stripeKey.slice(0, 12)}... (TEST)`)
say('')

// ── THE HEALTHY ORDER, ENUMERATED FROM THE DATABASE, NEVER TYPED ────────────

async function findRecordedOrder() {
  const { data, error } = await db
    .from('organiser_balance_ledger')
    .select('reference_id, organisation_id, delta_cents, currency')
    .eq('reason', 'order_confirmed')
    .eq('reference_type', 'order')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`could not read organiser_balance_ledger: ${error.message}`)
  return data?.[0] ?? null
}

// ── THE PLANT ───────────────────────────────────────────────────────────────

async function plantCharge({ label, transferGroup, amountCents }) {
  const intent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'aud',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `EventLinqs A3 layer three proof: ${label}`,
      ...(transferGroup ? { transfer_group: transferGroup } : {}),
    },
    { idempotencyKey: `a3l3-proof-${label}-${randomUUID()}` },
  )
  const chargeId =
    typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null)
  say(`[plant] ${label}: intent ${intent.id} status ${intent.status} charge ${chargeId ?? 'none'} transfer_group ${transferGroup ?? 'none'}`)
  if (intent.status !== 'succeeded') {
    throw new Error(`the ${label} plant did not succeed (status ${intent.status}); nothing to reconcile`)
  }
  return { label, intentId: intent.id, chargeId, transferGroup, amountCents }
}

// ── THE RUN ─────────────────────────────────────────────────────────────────

async function main() {
  const recorded = await findRecordedOrder()
  if (!recorded) {
    say('[settlement-proof] NOTE: TEST carries no order_confirmed ledger row, so the healthy plant is skipped.')
  } else {
    say(`[settlement-proof] healthy control order (read from TEST): ${recorded.reference_id}`)
  }

  const planted = []
  if (doPlant) {
    const unroutedOrderId = randomUUID()
    planted.push(await plantCharge({ label: 'unrouted', transferGroup: unroutedOrderId, amountCents: 3600 }))
    planted.push(await plantCharge({ label: 'unattributable', transferGroup: null, amountCents: 203 }))
    if (recorded) {
      planted.push(
        await plantCharge({ label: 'healthy', transferGroup: recorded.reference_id, amountCents: 1800 }),
      )
    }
    say('')
  }

  /*
   * The plants are seconds old, so the default six hour grace window would
   * correctly refuse to judge them. The proof therefore judges with NO grace,
   * and says so, rather than quietly changing the rule it is proving.
   *
   * The lookback is narrowed for the same reason: the TEST account carries
   * months of charges from earlier drives whose orders no longer exist, and a
   * P0 block naming all of them would drown the three this proof is about.
   * Both values are printed, so the window judged is never a guess.
   */
  const graceFlag = valueOf('--grace-hours')
  const graceHours = graceFlag !== null ? Number(graceFlag) : doPlant ? 0 : undefined
  const lookbackHours = Number(valueOf('--lookback-hours') ?? (doPlant ? 1 : 48))
  /*
   * The window is REPORTED rather than assumed, because this proof narrows it
   * and the scheduled cron does not. A plant is seconds old, so the default six
   * hour grace would correctly refuse to judge it; saying so out loud is the
   * difference between narrowing a window and quietly changing the rule.
   */
  say(
    `[settlement-proof] judging with lookbackHours=${lookbackHours} and ` +
      `graceHours=${graceHours ?? 'default'}. The scheduled cron uses the module defaults ` +
      `(48 and 6), which is what it must do: a charge taken minutes ago is legitimately ` +
      `unrecorded until the webhook writes its ledger row.`,
  )

  const { listSettledPlatformCharges } = await import('@/lib/stripe/settled-charges')

  /*
   * A BALANCE TRANSACTION IS NOT READABLE THE INSTANT THE CHARGE SUCCEEDS, and
   * that cost this proof a run before it was written down. The first plant pass
   * confirmed three PaymentIntents, listed the balance transactions two seconds
   * later and found NONE, so both fault plants were reported as "not raised"
   * and the alarm looked broken. Reading the same window a minute afterwards
   * returned all three.
   *
   * So the proof WAITS for what it planted to become visible, with a bound, and
   * fails loudly if it never does. It does not shorten the window, skip the
   * plant or judge on what it can see: a proof that quietly measured less than
   * it planted would be the thing it exists to prevent.
   */
  if (planted.length > 0) {
    const want = new Set(planted.map((p) => p.chargeId))
    const deadline = Date.now() + 120_000
    let seen = new Set()
    for (;;) {
      const window = {
        sinceIso: new Date(Date.now() - lookbackHours * 3_600_000).toISOString(),
        untilIso: new Date().toISOString(),
        graceHours: 0,
      }
      const { charges } = await listSettledPlatformCharges(window)
      seen = new Set(charges.map((c) => c.chargeId).filter((id) => want.has(id)))
      if (seen.size === want.size) break
      if (Date.now() > deadline) {
        say(
          `[settlement-proof] FAILED: only ${seen.size} of ${want.size} planted charge(s) became visible on the balance within 120s.`,
        )
        writeFileSync(join(outDir, 'settlement-proof.txt'), log.join('\n'), 'utf8')
        process.exit(1)
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    say(`[settlement-proof] all ${want.size} planted charge(s) are visible on the platform balance`)
    say('')
  }

  const report = await scanPlatformSettlement(db, {
    listCharges: async (window) => (await listSettledPlatformCharges(window)).charges,
    lookbackHours,
    ...(graceHours === undefined ? {} : { graceHours }),
  })

  say('')
  say(`[settlement-proof] window ${report.window.sinceIso} .. ${report.window.untilIso} (grace ${report.window.graceHours}h)`)
  say(`[settlement-proof] checked ${report.checked} settled charge(s); ${report.owedOnward} recorded as owed onward; ${report.findings.length} finding(s)`)
  say('')

  const foundIds = new Set(report.findings.map((f) => f.chargeId))
  const verdicts = []

  for (const p of planted) {
    if (p.label === 'healthy') {
      const ok = !foundIds.has(p.chargeId)
      verdicts.push([ok, `HEALTHY plant ${p.chargeId} was ${ok ? 'correctly NOT raised' : 'WRONGLY raised'}`])
    } else {
      const finding = report.findings.find((f) => f.chargeId === p.chargeId)
      const ok = Boolean(finding)
      verdicts.push([
        ok,
        `${p.label.toUpperCase()} plant ${p.chargeId} was ${ok ? `raised as ${finding.kind}` : 'NOT raised, which is the alarm failing'}`,
      ])
    }
  }

  for (const [ok, line] of verdicts) say(`  ${ok ? 'PASS' : 'FAIL'}  ${line}`)

  const block = describeSettlementFindings(report, new Date().toISOString())
  say('')
  say('--- the P0 block ---')
  say(block || '(nothing to raise)')

  if (doAppend && block) {
    if (!existsSync(REVIEW_QUEUE)) refuse(`${REVIEW_QUEUE} does not exist`)
    appendFileSync(REVIEW_QUEUE, block, 'utf8')
    say(`[settlement-proof] appended the P0 block to ${REVIEW_QUEUE}`)
  }

  writeFileSync(join(outDir, 'settlement-proof.txt'), log.join('\n'), 'utf8')
  writeFileSync(
    join(outDir, 'settlement-report.json'),
    JSON.stringify({ planted, report, verdicts }, null, 2),
    'utf8',
  )
  say(`[settlement-proof] evidence written to ${outDir}`)

  const failed = verdicts.filter(([ok]) => !ok)
  if (failed.length > 0) {
    console.error(`\n[settlement-proof] FAILED: ${failed.length} plant(s) were judged wrongly.\n`)
    process.exit(1)
  }
  if (doPlant && planted.length === 0) {
    console.error('\n[settlement-proof] FAILED: nothing was planted, so nothing was proven.\n')
    process.exit(1)
  }
  console.log('\n[settlement-proof] PASS')
}

main().catch((err) => {
  console.error('[settlement-proof] threw:', err)
  process.exit(1)
})
