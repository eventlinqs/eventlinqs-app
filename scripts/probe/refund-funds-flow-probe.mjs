/**
 * READ-ONLY: where does the money for a refund actually come FROM?
 *
 * WHY THIS IS NOT ANSWERABLE FROM THE CODE. src/lib/payments/refund.ts calls
 * stripe.refunds.create with a payment_intent and deliberately passes NEITHER
 * `reverse_transfer` NOR `refund_application_fee`. Its comment says that is
 * correct because the buyer charge is a PLATFORM charge with no `transfer_data`
 * under the funds-holding model, and those two parameters are only valid on a
 * destination charge. That reasoning is right if and only if the charge really has
 * no transfer_data. Whether it does is a fact about the live Stripe object, not
 * about the source file, so this reads the object.
 *
 * WHAT IT PRINTS, and what each field settles:
 *   charge.transfer_data          null  => a platform charge; funds landed in the
 *                                         PLATFORM balance, so the refund debits
 *                                         the platform, which is what the
 *                                         funds-holding model requires.
 *                                 set   => a destination charge; the refund would
 *                                         need reverse_transfer and the code does
 *                                         not pass it. That would be a real defect.
 *   charge.on_behalf_of           null  => settlement is the platform's.
 *   charge.application_fee_amount null  => no Connect application fee was taken on
 *                                         the charge, consistent with separate
 *                                         charges and transfers.
 *   refund.balance_transaction    the ledger entry the refund actually hit, whose
 *                                 `source`/reporting category names which balance
 *                                 moved. This is the direct evidence.
 *   transfers for the event       whether the organiser's share had already been
 *                                 paid out at refund time, which decides whether a
 *                                 clawback (reverseOrganiserTransferForRefund) was
 *                                 required at all.
 *
 * Read-only: retrieve/list only, no create/update/delete verb in this file.
 * Prints no key material; mode is derived from the key prefix alone.
 *
 * USAGE: node --env-file=.env.test scripts/probe/refund-funds-flow-probe.mjs <orderId>
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const orderId = process.argv[2]
if (!orderId) { console.error('usage: <orderId>'); process.exit(2) }

const key = process.env.STRIPE_SECRET_KEY
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key || !SB || !SVC) { console.error('missing STRIPE_SECRET_KEY / Supabase env'); process.exit(2) }
const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'UNKNOWN'

const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
const db = createClient(SB, SVC, { auth: { persistSession: false } })
const scanned = []
const hr = t => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)

hr(`REFUND FUNDS FLOW  |  order ${orderId}  |  Stripe mode ${mode}`)

const { data: order } = await db.from('orders')
  .select('id, order_number, status, total_cents, currency, organisation_id, event_id, platform_fee_cents, processing_fee_cents')
  .eq('id', orderId).single()
if (!order) { console.error('order not found'); process.exit(2) }
scanned.push('orders row for the proof order')

const { data: payment } = await db.from('payments')
  .select('gateway, gateway_payment_id, status, amount_cents')
  .eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle()
scanned.push('payments row (gateway_payment_id is where the intent id lives, not orders)')

const { data: org } = await db.from('organisations')
  .select('name, stripe_account_id, stripe_account_country').eq('id', order.organisation_id).single()

console.log(`  order        ${order.order_number}  ${order.status}  ${order.total_cents}c ${order.currency}`)
console.log(`  fees         platform ${order.platform_fee_cents}c   processing ${order.processing_fee_cents}c`)
console.log(`  organiser    ${org?.name}  connected account ${org?.stripe_account_id}`)
console.log(`  intent       ${payment?.gateway_payment_id}`)

// ---- The charge -----------------------------------------------------------
const intent = await stripe.paymentIntents.retrieve(payment.gateway_payment_id, { expand: ['latest_charge'] })
scanned.push('GET /v1/payment_intents/:id?expand[]=latest_charge')
const charge = intent.latest_charge

hr('THE BUYER CHARGE: platform charge, or destination charge?')
console.log(`  charge id                 ${charge.id}`)
console.log(`  amount                    ${charge.amount}c ${charge.currency.toUpperCase()}   captured=${charge.captured}`)
console.log(`  transfer_data             ${charge.transfer_data ? JSON.stringify(charge.transfer_data) : 'null'}`)
console.log(`  on_behalf_of              ${charge.on_behalf_of ?? 'null'}`)
console.log(`  application_fee_amount    ${charge.application_fee_amount ?? 'null'}`)
console.log(`  destination (legacy)      ${charge.destination ?? 'null'}`)
console.log(`  amount_refunded           ${charge.amount_refunded}c   refunded=${charge.refunded}`)

const isPlatformCharge = !charge.transfer_data && !charge.on_behalf_of && !charge.application_fee_amount
console.log(`\n  VERDICT: ${isPlatformCharge
  ? 'PLATFORM CHARGE. Funds settled in the platform balance, so a refund debits the'
    + '\n           PLATFORM, never the organiser\'s connected account. Passing neither'
    + '\n           reverse_transfer nor refund_application_fee is therefore correct.'
  : 'DESTINATION CHARGE. refund.ts passes no reverse_transfer, so the organiser'
    + '\n           share would NOT be clawed back. This is a defect.'}`)

// ---- The refunds ----------------------------------------------------------
hr('THE REFUNDS AND THE BALANCE THEY HIT')
const refunds = []
for await (const r of stripe.refunds.list({ charge: charge.id, limit: 100 })) refunds.push(r)
scanned.push('GET /v1/refunds?charge=:id (paginated)')

for (const r of refunds) {
  console.log(`\n  ${r.id}   ${r.amount}c ${r.currency.toUpperCase()}   status=${r.status}   reason=${r.reason ?? '-'}`)
  console.log(`      metadata.order_id       ${r.metadata?.order_id ?? '-'}`)
  console.log(`      metadata.initiated_by   ${r.metadata?.initiated_by ?? '-'}`)
  console.log(`      metadata.refund_id      ${r.metadata?.refund_id ?? '-'}  (the in-app refunds row, the race-proof link)`)
  if (r.balance_transaction) {
    const btId = typeof r.balance_transaction === 'string' ? r.balance_transaction : r.balance_transaction.id
    const bt = await stripe.balanceTransactions.retrieve(btId)
    scanned.push('GET /v1/balance_transactions/:id for each refund')
    console.log(`      balance_transaction     ${bt.id}`)
    console.log(`        type                  ${bt.type}`)
    console.log(`        reporting_category    ${bt.reporting_category}`)
    console.log(`        amount                ${bt.amount}c (negative = money left this balance)`)
    console.log(`        fee                   ${bt.fee}c    net ${bt.net}c`)
    console.log(`        => this entry is on the PLATFORM balance, which is the balance this`)
    console.log(`           key authenticates as. A connected-account entry would require`)
    console.log(`           a Stripe-Account header to read at all.`)
  } else {
    console.log('      balance_transaction     (not yet available)')
  }
}

// ---- Was the organiser already paid? -------------------------------------
hr('HAD THE ORGANISER ALREADY BEEN PAID? (decides whether a clawback was needed)')
const transfers = []
for await (const t of stripe.transfers.list({ destination: org.stripe_account_id, limit: 100 })) {
  if (t.metadata?.event_id === order.event_id || t.metadata?.order_id === orderId) transfers.push(t)
}
scanned.push('GET /v1/transfers?destination=:acct filtered to this event/order by metadata')
if (transfers.length === 0) {
  console.log('  no transfer to the organiser references this event or order.')
  console.log('  => PRE-DISBURSEMENT refund: the platform still held the funds, so there was')
  console.log('     nothing to claw back and reconcile_refund only reduced the held liability.')
  console.log('     This is the common case and the one the funds-holding model is built for.')
} else {
  for (const t of transfers) {
    console.log(`  ${t.id}  ${t.amount}c  reversed=${t.reversed}  amount_reversed=${t.amount_reversed}c`)
  }
  console.log('  => POST-DISBURSEMENT: the reversal path (reverseOrganiserTransferForRefund) applies.')
}

// ---- The in-app ledger ---------------------------------------------------
hr('THE IN-APP LEDGER FOR THIS ORDER (organiser_balance_ledger)')
/**
 * THE ROW THAT IS EASY TO MISS, and missing it makes a balanced ledger look
 * broken. Most entries are reference_type='order' with reference_id = the order
 * id, but `reserve_hold` is written as reference_type='hold' with reference_id =
 * the payout_holds id, and carries the order id in METADATA instead. Filtering on
 * reference_id alone therefore drops the sale-side reserve debit and the order
 * appears to net to +reserve rather than to zero. Both shapes are collected here.
 */
const { data: byRef } = await db.from('organiser_balance_ledger')
  .select('delta_cents, currency, reason, reference_type, reference_id, metadata, created_at')
  .eq('reference_id', orderId)
const { data: byMeta } = await db.from('organiser_balance_ledger')
  .select('delta_cents, currency, reason, reference_type, reference_id, metadata, created_at')
  .eq('reference_type', 'hold')
  .contains('metadata', { order_id: orderId })
const ledger = [...(byRef ?? []), ...(byMeta ?? [])]
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
scanned.push('organiser_balance_ledger rows for this order, BOTH shapes (reference_id=order and reference_type=hold with metadata.order_id)')
let sum = 0
for (const l of ledger) {
  sum += Number(l.delta_cents)
  console.log(`  ${String(l.delta_cents).padStart(8)}c  ${l.reason.padEnd(22)} ref_type=${l.reference_type}`)
}
console.log(`  ${'-'.repeat(30)}`)
console.log(`  ${String(sum).padStart(8)}c  NET for this order`)
console.log(`\n  A fully refunded order must net to 0: the refund reverses the sale exactly.`)
console.log(`  VERDICT: ${sum === 0 ? 'NETS TO ZERO. The ledger inverse is exact.' : `NET IS ${sum}c, NOT ZERO. Investigate.`}`)

hr('WHAT THIS PROBE SCANNED')
;[...new Set(scanned)].forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log('\n  writes attempted: 0 (retrieve/list/select only)')
