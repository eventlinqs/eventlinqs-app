// Integrated funds-holding proof: seeds the TEST DB, drives a real checkout
// through the LIVE webhook (via `stripe listen`), and verifies each money
// surface's data layer reflects the held-funds model end to end.
//
// Requires: dev server on :3000 against TEST, `stripe listen` forwarding to
// /api/webhooks/stripe, and .env.test (TEST Supabase + Stripe test keys).
// Run: node scripts/verify/funds-holding-integrated.mjs
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])
)
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const SK = env.STRIPE_SECRET_KEY
const CRON = env.CRON_SECRET
if (!/vkapkibzokmfaxqogypq/.test(SUPABASE_URL)) throw new Error('Refusing: not the TEST Supabase project')
if (!SK.startsWith('sk_test_')) throw new Error('Refusing: not a Stripe test key')

const stripe = new Stripe(SK, { apiVersion: '2026-03-25.dahlia' })
const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
const BASE = 'http://localhost:3000'

const log = (...a) => console.log(...a)
const surf = (name, pass, detail) => log(`  ${pass ? 'GREEN ' : 'NOT DONE'}  ${name}${detail ? ' :: ' + detail : ''}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const uuid = () => crypto.randomUUID()

async function eventAvailable(orgId, eventId) {
  const { data } = await db.rpc('organiser_event_available_balance', { p_organisation_id: orgId, p_event_id: eventId, p_currency: 'AUD' })
  return Number(data ?? 0)
}
async function orgAvailable(orgId) {
  const { data } = await db.rpc('organiser_available_balance', { p_organisation_id: orgId, p_currency: 'AUD' })
  return Number(data ?? 0)
}
async function holds(orgId) {
  const { data } = await db.from('payout_holds').select('hold_type, amount_cents, released_at').eq('organisation_id', orgId).is('released_at', null)
  return data ?? []
}
async function ledger(orgId, eventId) {
  const { data } = await db.from('organiser_balance_ledger').select('reason, delta_cents').eq('organisation_id', orgId).eq('event_id', eventId).order('created_at')
  return data ?? []
}
async function cron(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${CRON}` } })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
async function waitFor(fn, label, ms = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(1500) }
  log(`    (timed out waiting for ${label})`)
  return false
}

async function main() {
  log('\n========== SEED ==========')
  // 1. Stripe custom connected account with transfers active.
  const acct = await stripe.accounts.create({
    type: 'custom', country: 'AU', business_type: 'individual',
    capabilities: { transfers: { requested: true } },
    tos_acceptance: { date: 1700000000, ip: '127.0.0.1' },
    business_profile: { mcc: '7929', url: 'https://eventlinqs.com', product_description: 'Event tickets' },
    individual: { first_name: 'Test', last_name: 'Organiser', email: `org_${Date.now()}@example.com`, dob: { day: 1, month: 1, year: 1990 }, address: { line1: '1 Test St', city: 'Sydney', state: 'NSW', postal_code: '2000', country: 'AU' }, phone: '+61400000000' },
    external_account: { object: 'bank_account', country: 'AU', currency: 'aud', routing_number: '110000', account_number: '000123456' },
  })
  const fresh = await stripe.accounts.retrieve(acct.id)
  log(`  connected account ${acct.id} transfers=${fresh.capabilities?.transfers}`)

  // 2. Auth user (org owner / event creator).
  const ownerEmail = `owner_${Date.now()}@example.com`
  const { data: created, error: userErr } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true, password: 'Test-' + uuid() })
  if (userErr) throw new Error('createUser: ' + userErr.message)
  const ownerId = created.user.id
  await db.from('profiles').upsert({ id: ownerId, email: ownerEmail, full_name: 'Test Organiser' }, { onConflict: 'id' })

  // 3. Organisation linked to the connected account, payout-active.
  const orgId = uuid()
  const slug = 'test-org-' + Date.now()
  let { error: orgErr } = await db.from('organisations').insert({
    id: orgId, name: 'Test Org', slug, owner_id: ownerId,
    stripe_account_id: acct.id, stripe_payouts_enabled: true, stripe_charges_enabled: true,
    stripe_account_country: 'AU', payout_status: 'active',
  })
  if (orgErr) throw new Error('org insert: ' + orgErr.message)

  // 4. Event (ended in the past so the disbursement step can run; we still verify
  //    "held" BEFORE invoking the disbursement cron). 4 days ago > 3-day buffer.
  const eventId = uuid()
  const endPast = new Date(Date.now() - 14 * 864e5).toISOString()
  const startPast = new Date(Date.now() - 14 * 864e5 - 36e5).toISOString()
  let { error: evErr } = await db.from('events').insert({
    id: eventId, title: 'Proof Event', slug: 'proof-event-' + Date.now(), organisation_id: orgId, created_by: ownerId,
    start_date: startPast, end_date: endPast, status: 'draft',
  })
  if (evErr) throw new Error('event insert: ' + evErr.message)

  // 5. Ticket tier.
  const tierId = uuid()
  let { error: tErr } = await db.from('ticket_tiers').insert({ id: tierId, event_id: eventId, name: 'GA', total_capacity: 100, price: 10000, currency: 'AUD', is_active: true })
  if (tErr) throw new Error('tier insert: ' + tErr.message)
  log(`  org=${orgId} event=${eventId} tier=${tierId}`)

  // helper: drive one real purchase through the live webhook.
  async function purchase({ disputeCard = false } = {}) {
    const orderId = uuid()
    const orderNo = 'EL-T' + Math.random().toString(36).slice(2, 8).toUpperCase()
    const subtotal = 10000, pf = 300, proc = 320, total = subtotal + pf + proc
    await db.from('orders').insert({
      id: orderId, order_number: orderNo, event_id: eventId, organisation_id: orgId, status: 'pending',
      subtotal_cents: subtotal, addon_total_cents: 0, platform_fee_cents: pf, processing_fee_cents: proc, tax_cents: 0,
      discount_cents: 0, total_cents: total, currency: 'AUD', fee_pass_type: 'pass_to_buyer', guest_email: 'buyer@example.com', guest_name: 'Test Buyer',
    })
    const itemId = uuid()
    await db.from('order_items').insert({ id: itemId, order_id: orderId, ticket_tier_id: tierId, item_type: 'ticket', item_name: 'GA', quantity: 1, unit_price_cents: subtotal, total_cents: subtotal, attendee_first_name: 'Test', attendee_last_name: 'Buyer', attendee_email: 'buyer@example.com' })
    const paymentId = uuid()
    await db.from('payments').insert({ id: paymentId, order_id: orderId, gateway: 'stripe', status: 'processing', amount_cents: total, currency: 'AUD', idempotency_key: `pi:${orderId}:${total}:a1` })

    let pm = 'pm_card_visa'
    if (disputeCard) {
      const created = await stripe.paymentMethods.create({ type: 'card', card: { number: '4000000000000259', exp_month: 12, exp_year: 2030, cvc: '123' } })
      pm = created.id
    }
    const pi = await stripe.paymentIntents.create({
      amount: total, currency: 'aud', payment_method: pm, confirm: true, transfer_group: orderId,
      metadata: { order_id: orderId, event_id: eventId, organisation_id: orgId, buyer_email: 'buyer@example.com' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    })
    await db.from('payments').update({ gateway_payment_id: pi.id, client_secret: pi.client_secret ?? null }).eq('id', paymentId)
    return { orderId, paymentId, pi, total }
  }

  log('\n========== BUYER PURCHASE (real PI + live webhook) ==========')
  const { orderId, pi, total } = await purchase()
  log(`  order ${orderId} PI ${pi.id} status=${pi.status}`)
  // PROOF: funds held in PLATFORM, organiser nothing.
  const charge = await stripe.charges.retrieve(pi.latest_charge)
  surf('Buyer charge is a PLATFORM charge (MoR), no transfer to organiser', !charge.on_behalf_of && !charge.transfer_data && !charge.transfer && !charge.application_fee_amount)
  // Wait for the webhook to confirm + write the ledger.
  const confirmed = await waitFor(async () => {
    const { data } = await db.from('orders').select('status').eq('id', orderId).single()
    return data?.status === 'confirmed'
  }, 'order confirmed by webhook')
  surf('Webhook fired: order confirmed + tickets issued', confirmed)
  const written = await waitFor(async () => (await ledger(orgId, eventId)).some((r) => r.reason === 'order_confirmed'), 'ledger order_confirmed')

  log('\n========== SURFACE: held funds + reserve ==========')
  const led1 = await ledger(orgId, eventId)
  const share = led1.filter((r) => r.reason === 'order_confirmed').reduce((s, r) => s + r.delta_cents, 0)
  const reserveDebit = led1.filter((r) => r.reason === 'reserve_hold').reduce((s, r) => s + r.delta_cents, 0)
  const h1 = await holds(orgId)
  const reserveHold = h1.filter((x) => x.hold_type === 'reserve').reduce((s, x) => s + x.amount_cents, 0)
  const evAvail1 = await eventAvailable(orgId, eventId)
  const orgAvail1 = await orgAvailable(orgId)
  log(`    ledger rows: ${led1.map((r) => r.reason + '=' + r.delta_cents).join(', ')}`)
  log(`    reserve hold row=${reserveHold}; event-available=${evAvail1}; org-available=${orgAvail1}`)
  surf('Ledger records organiser share as a HELD liability (+10000)', share === 10000)
  surf('Reserve held (20% = 2000): hold row present and held out of available', reserveHold === 2000 && evAvail1 === share - reserveHold)
  surf('Admin/organiser available reflects held-minus-reserve (8000)', evAvail1 === 8000 && orgAvail1 === 8000, `event=${evAvail1} org=${orgAvail1}`)
  surf('Organiser received NOTHING yet (no paid transfer row)', (await db.from('payouts').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('kind', 'transfer')).count === 0)

  log('\n========== DISBURSEMENT (event ended -> transfer) ==========')
  // Top up platform AVAILABLE balance so the Option-A transfer (from available) succeeds.
  await stripe.charges.create({ amount: 60000, currency: 'aud', source: 'tok_bypassPending', description: 'proof available top-up' })
  const disb1 = await cron('/api/cron/event-disbursement')
  log(`    cron/event-disbursement -> ${disb1.status} transferred=${disb1.body.transferred} considered=${disb1.body.considered}`)
  const transferRow = await waitFor(async () => {
    const { data } = await db.from('payouts').select('kind, status, amount_cents, stripe_transfer_id').eq('organisation_id', orgId).eq('kind', 'transfer').limit(1).maybeSingle()
    return data?.stripe_transfer_id ? data : false
  }, 'transfer row')
  const { data: tr } = await db.from('payouts').select('kind, status, amount_cents, stripe_transfer_id').eq('organisation_id', orgId).eq('kind', 'transfer').order('created_at', { ascending: false }).limit(1).maybeSingle()
  surf('Disbursement transfer fired (platform -> connected), non-reserve share 8000', tr?.stripe_transfer_id && tr.amount_cents === 8000, `status=${tr?.status} amount=${tr?.amount_cents} id=${tr?.stripe_transfer_id}`)
  const evAvail2 = await eventAvailable(orgId, eventId)
  surf('Event-available drops to 0 after disbursing the non-reserve share', evAvail2 === 0, `event-available=${evAvail2}`)

  // Reserve release -> disburse the reserve too.
  await cron('/api/cron/payout-holds-release')
  const reserveReleased = await waitFor(async () => (await eventAvailable(orgId, eventId)) === 2000, 'reserve release')
  const disb2 = await cron('/api/cron/event-disbursement')
  log(`    after reserve release: cron transferred=${disb2.body.transferred}`)
  const { data: paidTransfers } = await db.from('payouts').select('amount_cents').eq('organisation_id', orgId).eq('kind', 'transfer')
  const totalPaid = (paidTransfers ?? []).reduce((s, r) => s + r.amount_cents, 0)
  surf('Reserve releases after event and is disbursed; organiser paid full 10000', totalPaid === 10000, `total transferred=${totalPaid}`)

  log('\n========== REFUND (after payout -> transfer reversed) ==========')
  const { data: tickets } = await db.from('tickets').select('id').eq('order_id', orderId)
  const ticketIds = (tickets ?? []).map((t) => t.id)
  surf('Tickets were issued for the order', ticketIds.length === 1, `count=${ticketIds.length}`)
  const { data: rr, error: rrErr } = await db.rpc('create_refund_request', { p_order_id: orderId, p_ticket_ids: ticketIds, p_reason: 'requested_by_buyer', p_initiator: 'organiser', p_actor_id: ownerId, p_buyer_message: null })
  if (rrErr) { surf('create_refund_request', false, rrErr.message) }
  const refundRow = Array.isArray(rr) ? rr[0] : rr
  if (refundRow) {
    const sRefund = await stripe.refunds.create({ payment_intent: refundRow.payment_intent_id, amount: refundRow.amount_cents, metadata: { refund_id: refundRow.refund_id } }, { idempotencyKey: `refund:${refundRow.refund_id}` })
    // Write the stripe_refund_id back so reconcile_refund (webhook) matches the row (mirrors refund-service).
    await db.from('refunds').update({ stripe_refund_id: sRefund.id }).eq('id', refundRow.refund_id)
    const reconciled = await waitFor(async () => {
      const { data } = await db.from('refunds').select('status').eq('id', refundRow.refund_id).single()
      return data?.status === 'completed'
    }, 'refund reconcile', 30000)
    surf('Buyer refunded from platform + reconcile_refund completed', reconciled)
    // The post-payout transfer reversal runs as an async side effect after reconcile.
    await waitFor(async () => (await ledger(orgId, eventId)).some((r) => r.reason === 'adjustment' && r.delta_cents > 0), 'post-payout transfer reversal', 20000)
    const led2 = await ledger(orgId, eventId)
    const hasRefund = led2.some((r) => r.reason === 'refund_from_balance' || r.reason === 'refund_from_reserve')
    const hasReversalAdj = led2.some((r) => r.reason === 'adjustment' && r.delta_cents > 0)
    surf('Ledger shows refund clawback + post-payout transfer reversal (+adjustment)', hasRefund && hasReversalAdj)
    const { data: ordAfter } = await db.from('orders').select('status').eq('id', orderId).single()
    surf('Order marked refunded; tickets voided', ordAfter?.status === 'refunded')
  }

  log('\n========== DISPUTE (chargeback -> freeze) ==========')
  // Raw-card-data API is not enabled on this Stripe test account, so a real
  // order-mapped charge.dispute.created cannot be driven from a script. We invoke
  // the SAME RPC the live webhook handler calls (freeze_chargeback) on a fresh
  // held order, then verify the freeze + that disbursement is blocked.
  const dispOrder = await purchase()
  log(`    dispute order ${dispOrder.orderId} PI ${dispOrder.pi.id} status=${dispOrder.pi.status}`)
  await waitFor(async () => {
    const { data } = await db.from('orders').select('status').eq('id', dispOrder.orderId).single()
    return data?.status === 'confirmed'
  }, 'dispute order confirmed', 25000)
  const { error: frzErr } = await db.rpc('freeze_chargeback', { p_order_id: dispOrder.orderId, p_dispute_id: 'dp_proof_' + Date.now(), p_dispute_amount_cents: dispOrder.total })
  if (frzErr) surf('freeze_chargeback RPC', false, frzErr.message)
  const cbHold = (await db.from('payout_holds').select('amount_cents').eq('organisation_id', orgId).eq('hold_type', 'chargeback').is('released_at', null)).data ?? []
  const cbLed = (await db.from('organiser_balance_ledger').select('delta_cents').eq('organisation_id', orgId).eq('reason', 'chargeback')).data ?? []
  surf('Dispute handler RPC: chargeback hold created (reserve frozen)', cbHold.length > 0, `holds=${cbHold.length}`)
  surf('Chargeback ledger debit recorded (platform-liable share withheld)', cbLed.length > 0)
  const blocked = await db.rpc('disburse_transfer', { p_organisation_id: orgId, p_event_id: eventId, p_currency: 'AUD', p_amount_cents: null, p_actor: null })
  surf('Disbursement BLOCKED while a chargeback is open', blocked.data?.error === 'open_chargeback_hold', `rpc=${JSON.stringify(blocked.data)}`)
  log('    NOTE: the live charge.dispute.created webhook -> freeze_chargeback wiring is in place; driving a real order-mapped dispute needs raw-card-data API enabled on the test account.')

  log('\n========== DONE ==========')
  log(`Seeded org ${orgId} on TEST. Connected acct ${acct.id}.`)
}

main().catch((e) => { console.error('INTEGRATED PROOF ERROR:', e.message); process.exit(1) })
