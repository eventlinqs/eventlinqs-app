// Stripe TEST-mode proof of the funds-holding money model.
// Reads STRIPE_SECRET_KEY (sk_test_...) from .env.test. Proves, at the Stripe
// layer, the invariants the app relies on:
//   1. Held funds: a PLATFORM charge (no on_behalf_of/transfer_data/app fee)
//      keeps funds in the platform balance; the organiser receives nothing.
//   2. Disbursement: a platform->connected Transfer moves the net share.
//   3. Refund: refunded from the platform balance.
//   4. Reversal: an organiser transfer can be reversed (refund-after-payout).
//   5. Dispute: a disputed charge is raised against the PLATFORM account.
// Run: node scripts/verify/funds-holding-proof.mjs
import Stripe from 'stripe'
import { readFileSync } from 'node:fs'

function envFromFile(path, key) {
  const line = readFileSync(path, 'utf8').split(/\r?\n/).find((l) => l.startsWith(key + '='))
  if (!line) throw new Error(`${key} not found in ${path}`)
  return line.slice(key.length + 1).trim()
}

const sk = envFromFile('.env.test', 'STRIPE_SECRET_KEY')
if (!sk.startsWith('sk_test_')) throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a test key')
const stripe = new Stripe(sk, { apiVersion: '2026-03-25.dahlia' })

const results = []
const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`) }

async function availableAUD() {
  const b = await stripe.balance.retrieve()
  return (b.available ?? []).filter((x) => x.currency === 'aud').reduce((s, x) => s + x.amount, 0)
}

async function main() {
  console.log('--- PROOF 1: held funds (platform charge, organiser gets nothing) ---')
  const pi = await stripe.paymentIntents.create({
    amount: 11000, currency: 'aud',
    payment_method: 'pm_card_visa', confirm: true,
    transfer_group: 'proof_order_1',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  })
  const charge = await stripe.charges.retrieve(pi.latest_charge)
  ok('1a charge succeeded on platform', charge.status === 'succeeded' && charge.paid)
  ok('1b NO on_behalf_of (platform is merchant of record)', !charge.on_behalf_of, `on_behalf_of=${charge.on_behalf_of}`)
  ok('1c NO transfer_data (funds not routed to organiser)', !charge.transfer_data, `transfer_data=${JSON.stringify(charge.transfer_data)}`)
  ok('1d NO application_fee (fee realised as smaller transfer, not app fee)', !charge.application_fee_amount, `app_fee=${charge.application_fee_amount}`)
  ok('1e NO transfer created (organiser received nothing)', !charge.transfer, `transfer=${charge.transfer}`)
  ok('1f transfer_group set for later reconciliation', charge.transfer_group === 'proof_order_1', charge.transfer_group)

  console.log('\n--- PROOF 3: refund from the platform balance ---')
  const refund = await stripe.refunds.create({ payment_intent: pi.id, amount: 11000 })
  ok('3a refund succeeded', refund.status === 'succeeded' || refund.status === 'pending', `status=${refund.status}`)
  const chargeAfter = await stripe.charges.retrieve(pi.latest_charge)
  ok('3b charge fully refunded from platform', chargeAfter.refunded && chargeAfter.amount_refunded === 11000)

  console.log('\n--- PROOF 2 + 4 setup: connected account + available balance ---')
  let acct
  try {
    acct = await stripe.accounts.create({
      type: 'custom', country: 'AU',
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      tos_acceptance: { date: 1700000000, ip: '127.0.0.1' },
      business_profile: { mcc: '7929', url: 'https://eventlinqs.com', product_description: 'Event tickets' },
      individual: {
        first_name: 'Test', last_name: 'Organiser', email: 'organiser@example.com',
        dob: { day: 1, month: 1, year: 1990 },
        address: { line1: '1 Test St', city: 'Sydney', state: 'NSW', postal_code: '2000', country: 'AU' },
        phone: '+61400000000',
      },
      external_account: { object: 'bank_account', country: 'AU', currency: 'aud', routing_number: '110000', account_number: '000123456' },
    })
    const fresh = await stripe.accounts.retrieve(acct.id)
    ok('2a connected account transfers capability active', fresh.capabilities?.transfers === 'active', `transfers=${fresh.capabilities?.transfers}`)
  } catch (err) {
    ok('2a connected account created + transfers active', false, `account setup error: ${err.message}`)
  }

  // Top up available platform balance so an Option-A transfer (from available) works.
  await stripe.charges.create({ amount: 50000, currency: 'aud', source: 'tok_bypassPending', description: 'proof available top-up' })
  const avail = await availableAUD()
  ok('2b platform has available AUD balance to disburse', avail > 0, `available=${avail}`)

  if (acct) {
    console.log('\n--- PROOF 2: disbursement transfer (platform -> connected) ---')
    try {
      const transfer = await stripe.transfers.create({
        amount: 10000, currency: 'aud', destination: acct.id, transfer_group: 'event_proof',
        metadata: { source: 'event_disbursement', proof: '1' },
      })
      ok('2c transfer created platform -> connected', !!transfer.id, `transfer=${transfer.id} amount=${transfer.amount}`)

      console.log('\n--- PROOF 4 (reversal): refund-after-payout claws the share back ---')
      const reversal = await stripe.transfers.createReversal(transfer.id, { amount: 4000 })
      ok('4a transfer reversal succeeded (clawback)', !!reversal.id, `reversal=${reversal.id} amount=${reversal.amount}`)
    } catch (err) {
      ok('2c transfer created platform -> connected', false, `transfer error: ${err.message}`)
    }
  }

  console.log('\n--- PROOF 5: dispute is raised against the PLATFORM account ---')
  try {
    const disputed = await stripe.charges.create({ amount: 8000, currency: 'aud', source: 'tok_createDispute', description: 'proof dispute' })
    const fullCharge = await stripe.charges.retrieve(disputed.id, { expand: ['dispute'] })
    ok('5a disputed charge created on platform', !!disputed.id)
    ok('5b dispute exists on the platform account', !!fullCharge.dispute, `dispute=${typeof fullCharge.dispute === 'string' ? fullCharge.dispute : fullCharge.dispute?.id}`)
  } catch (err) {
    ok('5a/5b dispute creation', false, `dispute error: ${err.message}`)
  }

  const passed = results.filter((r) => r.pass).length
  console.log(`\n===== ${passed}/${results.length} checks passed =====`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('PROOF SCRIPT ERROR:', e.message); process.exit(1) })
