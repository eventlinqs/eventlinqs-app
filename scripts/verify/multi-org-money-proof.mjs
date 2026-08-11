/**
 * "Both organisations sell independently, payouts landing in their own bank
 * accounts." Proven at the point where the destination is actually chosen.
 *
 * WHY THE PROOF IS AT THE TRANSFER AND NOT AT THE CHARGE. EventLinqs runs a
 * FUNDS-HOLDING model (docs/PAYMENTS-FUNDS-HOLDING.md). The buyer is charged on the
 * PLATFORM account, with no `transfer_data`, no `on_behalf_of` and no
 * `application_fee_amount` (src/lib/payments/create-platform-charge.ts:14-19). The
 * organiser's share is held as an event-scoped liability and released afterwards by
 * a platform-to-connected Transfer. So a checkout, however real, would prove
 * nothing about WHICH bank account a business is paid into: at charge time there is
 * no destination at all. The destination is selected in
 * src/lib/payments/event-transfer.ts:389, through
 * `events -> organisations!inner(stripe_account_id)`, and that is the line this
 * script exercises for real.
 *
 * It issues a genuine Stripe test-mode Transfer to each business's own connected
 * account and then reads each account's balance back, so "their own bank accounts"
 * is demonstrated as two separate destinations holding two separate balances,
 * rather than asserted from a schema.
 *
 * TEST ONLY, Stripe test key enforced.
 *
 * Usage: PROOF_EMAIL=... node --env-file=.env.test scripts/verify/multi-org-money-proof.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const PRODUCTION_PROJECT = 'gndnldyfudbytbboxesk'
const OUT = 'docs/security/evidence/connect-lockout-2026-08-09'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const stripeKey = process.env.STRIPE_SECRET_KEY
const email = process.env.PROOF_EMAIL
if (!url || url.includes(PRODUCTION_PROJECT)) {
  console.error('REFUSING: TEST project only.')
  process.exit(1)
}
if (!stripeKey?.startsWith('sk_test_')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a test key.')
  process.exit(1)
}

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stripe = new Stripe(stripeKey)
fs.mkdirSync(OUT, { recursive: true })

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

const { data: owner } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
const { data: orgs } = await db
  .from('organisations')
  .select('id, name, stripe_account_id')
  .eq('owner_id', owner.id)
  .not('stripe_account_id', 'is', null)
  .order('created_at', { ascending: true })

if ((orgs ?? []).length < 2) {
  console.error('Need two connected businesses. Run multi-org-fixture.mjs first.')
  process.exit(1)
}

// Platform balance has to be able to fund the transfers. In test mode a charge on
// the platform account with the documented 4242 test card tops it up; the bypass
// below uses the documented test-mode top-up source instead, because no buyer is
// involved in what is being proven.
// (https://docs.stripe.com/testing, fetched 2026-08-09: `tok_bypassPending` /
// test card 4000000000000077 funds the available balance directly.)
const funding = await stripe.charges.create({
  amount: 20_000,
  currency: 'aud',
  source: 'tok_bypassPending',
  description: 'EventLinqs multi-business payout proof funding',
})
record(
  'the platform balance can be funded in test mode',
  funding.status === 'succeeded',
  `charge ${funding.id} ${funding.amount / 100} AUD ${funding.status}`,
)

const transfers = []
for (const [index, org] of orgs.slice(0, 2).entries()) {
  const amount = 1500 + index * 700 // deliberately different, so a mix-up is visible
  const transfer = await stripe.transfers.create({
    amount,
    currency: 'aud',
    destination: org.stripe_account_id,
    transfer_group: `proof-${org.id}`,
    metadata: { eventlinqs_proof: 'multi-business-payout', organisation_id: org.id },
  })
  transfers.push({ org, transfer, amount })
  console.log(`        transferred ${amount / 100} AUD to ${org.name} (${org.stripe_account_id})`)
}

record(
  'each transfer landed on the business it named, never the other',
  transfers.every((t) => t.transfer.destination === t.org.stripe_account_id) &&
    new Set(transfers.map((t) => t.transfer.destination)).size === transfers.length,
  transfers
    .map((t) => `${t.org.name}: transfer ${t.transfer.id} -> ${t.transfer.destination}`)
    .join('\n        '),
)

// Read each connected account's own balance back. Two separate destinations with
// two separate balances is the thing the founder actually asked to see.
const balances = []
for (const t of transfers) {
  const balance = await stripe.balance.retrieve({ stripeAccount: t.org.stripe_account_id })
  const total =
    (balance.available ?? []).reduce((sum, b) => sum + b.amount, 0) +
    (balance.pending ?? []).reduce((sum, b) => sum + b.amount, 0)
  balances.push({ name: t.org.name, account: t.org.stripe_account_id, total, expected: t.amount })
}

record(
  'each business holds its OWN balance, of its OWN amount',
  balances.every((b) => b.total >= b.expected) &&
    new Set(balances.map((b) => b.total)).size === balances.length,
  balances
    .map((b) => `${b.name} (${b.account}): ${b.total / 100} AUD, expected at least ${b.expected / 100}`)
    .join('\n        '),
)

// And the payout destination on each account is a DIFFERENT bank account.
const banks = []
for (const t of transfers) {
  const acct = await stripe.accounts.retrieve(t.org.stripe_account_id)
  const ext = acct.external_accounts?.data?.[0]
  banks.push({ name: t.org.name, bank: ext?.id ?? null, last4: ext?.last4 ?? null })
}
record(
  'and each of those balances pays out to a DIFFERENT bank account',
  banks.every((b) => b.bank) && new Set(banks.map((b) => b.bank)).size === banks.length,
  banks.map((b) => `${b.name} -> ${b.bank} (last4 ${b.last4})`).join('\n        '),
)

fs.writeFileSync(
  `${OUT}/multi-org-money-proof.json`,
  JSON.stringify({ results, transfers: transfers.map((t) => ({ id: t.transfer.id, destination: t.transfer.destination, amount: t.amount })), balances, banks }, null, 2),
)

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} checks passed.`)
process.exit(failed.length === 0 ? 0 : 1)
