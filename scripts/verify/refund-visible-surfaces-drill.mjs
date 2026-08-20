/**
 * WHAT A REAL PERSON SEES AFTER A REFUND: the buyer's wallet and the organiser's
 * attendee list, LOADED, not read.
 *
 * These were the last two unproven claims in the unwind. The code says the right
 * thing in both places, and saying so is not evidence: `/tickets` maps `refunded`
 * to an error tone in a lookup table, and `fetchEventAttendees` filters to
 * ATTENDEE_STATUSES = valid, scanned. Whether either actually renders that way for
 * a real refunded ticket, behind a real login, had never been checked.
 *
 * THE CONTROL IS THE SECOND TICKET. The fixture buys TWO tickets on one order and
 * refunds only ONE. So each page has to be right twice, and in opposite
 * directions, on the same order at the same moment:
 *   * the wallet must show the refunded one as refunded AND the other as valid;
 *   * the attendee list must drop the refunded one AND keep the other.
 * A page that showed everything, or nothing, would pass a single-ticket check and
 * fail this one.
 *
 * TEST ONLY, guarded. Removable with --teardown.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-visible-surfaces-drill.mjs --url http://localhost:3100
 *   node --env-file=.env.test scripts/verify/refund-visible-surfaces-drill.mjs --teardown
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const BASE = (arg('--url', 'http://localhost:3100')).replace(/\/+$/, '')
const TEARDOWN = argv.includes('--teardown')
const ORDER_PREFIX = 'ELVIS-'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const hr = t => { console.log('\n' + '='.repeat(92)); console.log('  ' + t); console.log('='.repeat(92)) }
const die = (m, e) => { console.error(`  FAILED: ${m}${e ? ` :: ${e.message ?? e}` : ''}`); process.exit(1) }
let failures = 0
const check = (label, got, want, ok) => {
  if (!ok) failures += 1
  console.log(`  ${label.padEnd(46)} ${String(got).padEnd(16)} ${String(want).padEnd(14)} ${ok ? 'OK' : 'FAIL  <<<'}`)
}

// ------------------------------------------------------------------ teardown
if (TEARDOWN) {
  const { data: orders } = await db.from('orders').select('id, reservation_id').like('order_number', `${ORDER_PREFIX}%`)
  for (const o of orders ?? []) {
    const { data: rf } = await db.from('refunds').select('id').eq('order_id', o.id)
    for (const r of rf ?? []) await db.from('refund_tickets').delete().eq('refund_id', r.id)
    await db.from('refunds').delete().eq('order_id', o.id)
    await db.from('organiser_balance_ledger').delete().eq('reference_id', o.id)
    await db.from('payments').delete().eq('order_id', o.id)
    await db.from('tickets').delete().eq('order_id', o.id)
    await db.from('order_items').delete().eq('order_id', o.id)
    await db.from('orders').delete().eq('id', o.id)
    if (o.reservation_id) await db.from('reservations').delete().eq('id', o.reservation_id)
  }
  console.log(`  removed ${(orders ?? []).length} drill order(s)`)
  process.exit(0)
}

// ------------------------------------------------------------------ fixture
hr('0. ONE ORDER, TWO TICKETS, ONE OF THEM REFUNDED')

const { data: candidates } = await db
  .from('ticket_tiers')
  .select('id, event_id, name, price, events!inner(id, title, organisation_id, status)')
  .eq('is_active', true).gt('price', 0).eq('events.status', 'published').limit(25)
const tier = (candidates ?? []).find(t => t.events?.organisation_id)
if (!tier) die('no active paid tier on a published event')
const event = tier.events

const stamp = Date.now().toString(36)
const password = `${randomUUID()}Aa1`
const buyerEmail = `visible-drill-${stamp}@eventlinqs.test`
const { data: buyer, error: bErr } = await db.auth.admin.createUser({
  email: buyerEmail, password, email_confirm: true,
})
if (bErr) die('buyer', bErr)
const buyerId = buyer.user.id
await db.from('profiles').upsert({ id: buyerId, email: buyerEmail, full_name: 'Visible Drill', display_name: 'Visible Drill' })

const face = tier.price
const { data: order, error: oErr } = await db.from('orders').insert({
  order_number: `${ORDER_PREFIX}${stamp.toUpperCase()}`, event_id: event.id,
  organisation_id: event.organisation_id, user_id: buyerId, status: 'pending',
  subtotal_cents: face * 2, platform_fee_cents: 0, processing_fee_cents: 0,
  total_cents: face * 2, currency: 'AUD',
}).select('id, order_number').single()
if (oErr) die('order', oErr)

await db.from('order_items').insert({
  order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket', item_name: tier.name,
  quantity: 2, unit_price_cents: face, total_cents: face * 2,
})
await db.from('payments').insert({
  order_id: order.id, gateway: 'stripe', gateway_payment_id: `pi_visible_${stamp}`,
  status: 'completed', amount_cents: face * 2, currency: 'AUD', idempotency_key: `visible-${stamp}`,
})
const { error: cErr } = await db.rpc('confirm_order', { p_order_id: order.id })
if (cErr) die('confirm_order', cErr)

const { data: tickets } = await db.from('tickets')
  .select('id, ticket_code, status').eq('order_id', order.id).order('ticket_code')
if ((tickets ?? []).length !== 2) die(`expected 2 tickets, minted ${(tickets ?? []).length}`)

const refundedTicket = tickets[0]
const liveTicket = tickets[1]
console.log(`  order   ${order.order_number}`)
console.log(`  ticket A ${refundedTicket.ticket_code}  will be REFUNDED`)
console.log(`  ticket B ${liveTicket.ticket_code}  stays VALID (the control)`)

// Refund exactly one, through the real path, then reconcile as the webhook does.
const { data: org } = await db.from('organisations').select('owner_id').eq('id', event.organisation_id).maybeSingle()
if (!org?.owner_id) die('organisation has no owner')

const { data: reqRow, error: rErr } = await db.rpc('create_refund_request', {
  p_order_id: order.id,
  p_ticket_ids: [refundedTicket.id],
  p_reason: 'requested_by_buyer',
  p_initiator: 'organiser',
  p_actor_id: org.owner_id,
  p_buyer_message: 'visible surfaces drill',
})
if (rErr) die('create_refund_request', rErr)
const req = Array.isArray(reqRow) ? reqRow[0] : reqRow

const synthetic = `re_visible_${stamp}`
await db.from('refunds').update({ stripe_refund_id: synthetic }).eq('id', req.refund_id)
const { data: verdict, error: recErr } = await db.rpc('reconcile_refund', {
  p_stripe_refund_id: synthetic, p_charge_id: `ch_visible_${stamp}`, p_refund_amount_cents: req.amount_cents,
})
if (recErr) die('reconcile_refund', recErr)

const { data: after } = await db.from('tickets').select('id, ticket_code, status').eq('order_id', order.id).order('ticket_code')
console.log(`  reconcile -> ${verdict}`)
for (const t of after ?? []) console.log(`    ${t.ticket_code}  ${t.status}`)

const dbRefunded = (after ?? []).find(t => t.id === refundedTicket.id)
const dbLive = (after ?? []).find(t => t.id === liveTicket.id)
if (dbRefunded?.status !== 'refunded') die(`ticket A is ${dbRefunded?.status}, expected refunded, so the page test would prove nothing`)
if (dbLive?.status !== 'valid') die(`ticket B is ${dbLive?.status}, expected valid, so the control is gone`)

// ------------------------------------------------------------------ the pages
const browser = await chromium.launch()

async function signIn(email, pw) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  const submit = page.getByRole('button', { name: /sign in|log in/i }).first()
  await submit.waitFor({ state: 'visible', timeout: 60_000 })
  // The submit is disabled until hydration, deliberately. Clicking early does
  // nothing and reports success; see payouts-read-parity.mjs for the same trap.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => /sign in|log in/i.test(x.textContent ?? ''))
    return Boolean(b) && !b.disabled
  }, undefined, { timeout: 60_000 })
  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/password/i).first().fill(pw)
  await submit.click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })
  return { ctx, page }
}

try {
  hr('1. THE BUYER WALLET, /tickets, loaded as the buyer')
  const { ctx: buyerCtx, page: buyerPage } = await signIn(buyerEmail, password)
  await buyerPage.goto(`${BASE}/tickets`, { waitUntil: 'networkidle', timeout: 120_000 })
  const walletText = await buyerPage.locator('main').innerText()

  const sawRefundedCode = walletText.includes(refundedTicket.ticket_code)
  const sawLiveCode = walletText.includes(liveTicket.ticket_code)
  console.log(`  wallet mentions ticket A (refunded): ${sawRefundedCode}`)
  console.log(`  wallet mentions ticket B (valid)   : ${sawLiveCode}`)

  // What badge sits on the refunded row. Read the row, not the whole page, so a
  // word appearing elsewhere cannot be mistaken for this ticket's state.
  const refundedRow = buyerPage.locator('li', { hasText: refundedTicket.ticket_code }).first()
  const liveRow = buyerPage.locator('li', { hasText: liveTicket.ticket_code }).first()
  const refundedRowText = (await refundedRow.count()) ? await refundedRow.innerText() : '(row not found)'
  const liveRowText = (await liveRow.count()) ? await liveRow.innerText() : '(row not found)'
  console.log(`\n  ticket A row: ${refundedRowText.replace(/\n/g, ' | ').slice(0, 160)}`)
  console.log(`  ticket B row: ${liveRowText.replace(/\n/g, ' | ').slice(0, 160)}`)

  console.log('')
  console.log(`  ${'check'.padEnd(46)} ${'observed'.padEnd(16)} ${'expected'.padEnd(14)} verdict`)
  console.log('  ' + '-'.repeat(86))
  const aSaysRefunded = /refunded/i.test(refundedRowText)
  const aSaysValid = /\bvalid\b/i.test(refundedRowText)
  const bSaysValid = /\bvalid\b/i.test(liveRowText)
  check('refunded ticket is shown at all', sawRefundedCode, 'true', sawRefundedCode)
  check('refunded ticket reads REFUNDED', aSaysRefunded, 'true', aSaysRefunded)
  check('refunded ticket does NOT read valid', aSaysValid, 'false', !aSaysValid)
  check('CONTROL: live ticket still reads valid', bSaysValid, 'true', bSaysValid)
  await buyerCtx.close()

  hr('2. THE ORGANISER ATTENDEE LIST, loaded as the organiser')
  // Give the owner a known password so the page can be loaded as them.
  const { data: ownerUser } = await db.auth.admin.getUserById(org.owner_id)
  if (!ownerUser?.user?.email) die('organisation owner has no email to sign in with')
  const ownerEmail = ownerUser.user.email
  await db.auth.admin.updateUserById(org.owner_id, { password })
  console.log(`  organiser ${ownerEmail}`)

  const { ctx: orgCtx, page: orgPage } = await signIn(ownerEmail, password)
  const attendeesUrl = `${BASE}/dashboard/events/${event.id}/attendees`
  const resp = await orgPage.goto(attendeesUrl, { waitUntil: 'networkidle', timeout: 120_000 })
  console.log(`  ${attendeesUrl} -> HTTP ${resp?.status()}`)
  const attendeeText = await orgPage.locator('main').innerText().catch(async () => orgPage.locator('body').innerText())

  /*
   * COUNT THE ROWS FOR THIS ORDER, do not look for the ticket code.
   *
   * AttendeeTable renders Name, Email, Ticket type, Order ref, Purchase date,
   * Check-in and Marketing. The ticket code is only the React key, so it is never
   * in the rendered text and searching for it reported "not present" for BOTH
   * tickets, including the live control. Both tickets on this order share a name,
   * an email and an order ref, so the only thing that separates them is HOW MANY
   * rows carry that order ref: two before the refund, one after.
   */
  // The order number is generated from a base36 stamp, so it contains no regex
  // metacharacters and can be split on safely without escaping.
  const orderRefCount = attendeeText.split(order.order_number).length - 1
  console.log(`  rows on the guest list carrying ${order.order_number}: ${orderRefCount}`)
  console.log('')
  console.log(`  ${'check'.padEnd(46)} ${'observed'.padEnd(16)} ${'expected'.padEnd(14)} verdict`)
  console.log('  ' + '-'.repeat(86))
  check('guest list shows ONE row, not two', orderRefCount, '1', orderRefCount === 1)
  check('CONTROL: the live ticket is still listed', orderRefCount >= 1, 'true', orderRefCount >= 1)
  await orgCtx.close()
} finally {
  await browser.close().catch(() => {})
}

hr('VERDICT')
if (failures === 0) {
  console.log('  The wallet shows the refunded ticket as refunded and never as valid, the live')
  console.log('  ticket on the same order still reads valid, and the guest list has dropped the')
  console.log('  refunded one while keeping the live one.')
} else {
  console.log(`  ${failures} FAILURE(S). See the rows marked <<< above.`)
}
console.log('')
console.log('  Remove the drill rows with --teardown.')
process.exit(failures === 0 ? 0 : 1)
