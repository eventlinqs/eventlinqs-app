/**
 * THE ORPHAN REFUND DRILL: a refund created in the STRIPE DASHBOARD instead of in
 * the app. Does the seat come back?
 *
 * WHY THIS DRILL EXISTS. The in-app refund path is proven end to end by
 * refund-dashboard-e2e.mjs: create_refund_request writes a `refunds` row, and the
 * charge.refunded webhook matches that row by stripe_refund_id and runs
 * reconcile_refund, which returns inventory. Every assertion passes.
 *
 * A refund created directly at Stripe has NO refunds row. reconcile_refund
 * returns 'no_refund_row', so handleChargeRefunded falls through to
 * orphanOrderLevelVoid, a second and much older code path. That path voids the
 * tickets and promotes the waitlist, and the question this drill answers is
 * whether it also returns the seats to sale.
 *
 * It matters more than "we told everyone not to do that". The founder was in the
 * Stripe dashboard auditing accounts on the day this was written, refunding from
 * there is one click, and Stripe offers no way to disable it. A safety net that
 * silently keeps the seats sold is worse than no safety net, because the waitlist
 * promotion it DOES perform invites people into a tier the counter still calls
 * full.
 *
 * THE DRILL IS THE REPRODUCTION, not a simulation: a real card-4242 purchase, then
 * a real stripe.refunds.create issued OUTSIDE the application with no in-app
 * refund row, then the numbers read back.
 *
 * TEST ONLY, guarded. The Stripe write is a test-mode refund of a test-mode
 * charge; it moves no real money. This is the one script here that writes to
 * Stripe, and it does so deliberately because the whole point is to create the
 * orphan condition that cannot be faked.
 *
 * USAGE:
 *   REFUND_PROOF_PASSWORD='...' node --env-file=.env.test \
 *     scripts/verify/refund-orphan-inventory-drill.mjs [baseUrl]
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { buildFixture, clearEmptyFixtures, drivePurchase } from './lib/refund-proof-fixture.mjs'

assertNotProduction({ envFile: '.env.test' })

const STRIPE_API_VERSION = '2026-03-25.dahlia'
const BASE = (process.argv[2] ?? 'https://eventlinqs-staging.vercel.app').replace(/\/+$/, '')
const PASSWORD = process.env.REFUND_PROOF_PASSWORD
if (!PASSWORD) { console.error('REFUND_PROOF_PASSWORD is required'); process.exit(2) }

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const SK = process.env.STRIPE_SECRET_KEY
if (!SB || !SVC || !SK) { console.error('missing Supabase or Stripe env'); process.exit(2) }
if (!SK.startsWith('sk_test_')) { console.error('REFUSING: this drill writes to Stripe and requires a TEST-mode key'); process.exit(2) }

const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })
const stripe = new Stripe(SK, { apiVersion: STRIPE_API_VERSION })

const STAMP = Date.now().toString(36)
const OUT = 'docs/verification/refund-dashboard-2026-08-18'
fs.mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log('[orphan-drill]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []
const scanned = []
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (got ${JSON.stringify(detail)})` : ''}`); fails.push(msg) }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/orphan-${name}.png` }).catch(() => {})
async function until(fn, pred, budgetMs, everyMs = 3000) {
  const t0 = Date.now()
  let v = await fn()
  while (!pred(v) && Date.now() - t0 < budgetMs) { await sleep(everyMs); v = await fn() }
  return { value: v, ok: pred(v), seconds: Math.round((Date.now() - t0) / 1000) }
}
const tierRow = async id => (await db.from('ticket_tiers').select('sold_count, total_capacity').eq('id', id).single()).data
const orderRow = async id => (await db.from('orders').select('status').eq('id', id).single()).data
const ticketRows = async id => (await db.from('tickets').select('ticket_code, status').eq('order_id', id).order('ticket_code')).data ?? []

const results = { base: BASE, startedAt: new Date().toISOString() }
await clearEmptyFixtures(db, log)
const fx = await buildFixture(db, {
  stamp: STAMP,
  ownerEmail: `refund-proof-owner-${STAMP}@eventlinqs.test`,
  password: PASSWORD,
  log,
})
scanned.push('an isolated TEST fixture: organisation, published paid event, GA tier')

const soldBefore = (await tierRow(fx.tier.id)).sold_count
console.log(`\n[BASELINE] tier sold_count = ${soldBefore}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
let orderId = null

try {
  console.log('\n[BUY] one ticket, real card-4242 purchase')
  orderId = await drivePurchase(page, {
    base: BASE, slug: fx.event.slug, qty: 1,
    buyerEmail: `delivered+orphan-drill-${STAMP}@resend.dev`,
    shot,
  })
  if (!orderId) throw new Error('no order id after purchase')
  scanned.push('a real card-4242 purchase through the real checkout')
  const conf = await until(() => orderRow(orderId), o => o?.status === 'confirmed', 180000)
  assert(conf.ok, `webhook confirmed the order (${conf.seconds}s)`, conf.value?.status)

  const soldAfterBuy = (await tierRow(fx.tier.id)).sold_count
  assert(soldAfterBuy === soldBefore + 1, `sold_count rose to ${soldAfterBuy} on purchase`, soldAfterBuy)

  // ---- Create the ORPHAN refund, outside the application entirely ----------
  console.log('\n[ORPHAN REFUND] stripe.refunds.create with NO in-app refunds row')
  const { data: payment } = await db.from('payments')
    .select('gateway_payment_id').eq('order_id', orderId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  log(`refunding intent ${payment.gateway_payment_id} directly at Stripe`)

  // Deliberately NO metadata.refund_id and no refunds row: this is exactly what a
  // dashboard refund looks like to the webhook.
  const orphan = await stripe.refunds.create({ payment_intent: payment.gateway_payment_id })
  scanned.push('a real Stripe refund created OUTSIDE the app (the dashboard-refund shape)')
  log(`stripe refund ${orphan.id} status=${orphan.status}`)

  const inApp = await db.from('refunds').select('id').eq('order_id', orderId)
  assert((inApp.data ?? []).length === 0, 'no in-app refunds row exists for this refund (the orphan condition)', inApp.data?.length)

  // The webhook must at least void the tickets. Wait on that, then read inventory.
  const voided = await until(() => ticketRows(orderId),
    ts => ts.length > 0 && ts.every(t => t.status === 'void' || t.status === 'refunded'), 180000)
  assert(voided.ok, `webhook voided the tickets (${voided.seconds}s)`, voided.value.map(t => t.status))

  // Give the handler room to finish any inventory work before judging it.
  await sleep(8000)
  const afterOrphan = await tierRow(fx.tier.id)
  const ordAfter = await orderRow(orderId)

  console.log(`\n  tickets     ${voided.value.map(t => `${t.ticket_code}=${t.status}`).join('  ')}`)
  console.log(`  order       ${ordAfter?.status}`)
  console.log(`  sold_count  before=${soldBefore}  after purchase=${soldAfterBuy}  after orphan refund=${afterOrphan.sold_count}`)

  results.orphan = { soldBefore, soldAfterBuy, soldAfterRefund: afterOrphan.sold_count, tickets: voided.value, orderStatus: ordAfter?.status, stripeRefundId: orphan.id }

  // THE ASSERTION THIS DRILL EXISTS FOR.
  assert(afterOrphan.sold_count === soldBefore,
    `INVENTORY RESTORED after a Stripe-side refund: sold_count back to ${soldBefore}`,
    afterOrphan.sold_count)

  if (afterOrphan.sold_count !== soldBefore) {
    console.log(`\n  >>> LEAK CONFIRMED. The buyer was refunded and the ticket no longer admits,`)
    console.log(`  >>> but the tier still counts ${afterOrphan.sold_count} of ${afterOrphan.total_capacity} sold.`)
    console.log(`  >>> ${afterOrphan.sold_count - soldBefore} seat(s) are gone from sale with nothing reporting it.`)
  }
} catch (err) {
  results.error = String(err?.stack ?? err)
  console.error('\nDRILL FAILED TO RUN:', err)
  await shot(page, '99-error')
  fails.push(`drill threw: ${err?.message ?? err}`)
} finally {
  results.finishedAt = new Date().toISOString()
  results.orderId = orderId
  results.fails = fails
  results.fixture = { slug: fx.event.slug, eventId: fx.event.id, tierId: fx.tier.id }
  fs.writeFileSync(`${OUT}/refund-orphan-drill.json`, JSON.stringify(results, null, 2))
  await browser.close()
}

console.log('\n' + '='.repeat(74))
console.log('WHAT THIS DRILL SCANNED')
console.log('='.repeat(74))
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  fixture   ${fx.event.slug}`)
console.log(`  order     ${orderId}`)
console.log(`  ${fails.length === 0 ? 'ALL ASSERTIONS PASSED: a Stripe-side refund returns the seat.' : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
