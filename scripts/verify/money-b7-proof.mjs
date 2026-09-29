/**
 * MONEY FIX, DRIVEN: THE MESSAGES A SALE AND A REFUND SEND, AND THE ORGANISER'S
 * MONEY ON THEIR HOME SCREEN. One width per run; the driver runs all three.
 *
 * Acceptance 6: "The same driven purchase produces the organiser message and the
 * buyer message, both captured in the test sink with rendered recipients
 * asserted, and the owner is not sole recipient of either. A driven refund
 * produces the organiser refund message."
 *
 * Acceptance 10: "A driven proof of the organiser dashboard showing sales,
 * refunds and next payout date at 390, 768 and 1440."
 *
 * WHAT IS REAL. A real card payment through the real checkout on a server
 * running this tree, Stripe's real webhook through `stripe listen`, a refund
 * CLICKED in the organiser dashboard (the in-app path, which reconciles the same
 * way whichever Stripe event arrives first), and the console mail transport
 * whose output IS the test sink: the server's own stdout.
 *
 * THE DASHBOARD IS JUDGED AGAINST THE LEDGER, NOT AGAINST ITSELF. The expected
 * figures are summed here from organiser_balance_ledger with this script's own
 * arithmetic, and the expected payout date is the event's end plus the payout
 * window read from the pricing rule, so a panel that computed the wrong thing
 * cannot agree with a proof that shares its code.
 *
 * WHAT ACCEPTANCE 5 NEEDS, RECORDED RATHER THAN FAKED. The PaymentIntent and
 * its balance transaction are retrieved from Stripe BY ID and written verbatim
 * to the evidence directory. Under the funds-holding model neither carries a
 * destination or an application fee, by design, so acceptance 5 cannot be met
 * until the founder rules on A2 (BUILD-LOG A1.9). The objects are kept so the
 * ruling can be made on what Stripe actually holds.
 *
 * Every row this creates carries `lane-a-money` in its slug, name or email.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { buildFixture, drivePurchase } from './lib/refund-proof-fixture.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'
import { waitForConfirmedOrder } from './lib/test-card.mjs'
import { alertDestination } from '@/lib/env/destinations'
import { getPayoutScheduleDays } from '@/lib/payments/pricing-rules'

const TAG = '[money-proof]'
const BASE = process.env.BASE ?? 'http://localhost:3311'
const SERVER_LOG = process.env.SERVER_LOG ?? ''
const VIEWPORT = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const SIZES = {
  'mobile-390': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  'tablet-768': { viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  'desktop-1440': { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
}
const SIZE = SIZES[VIEWPORT]
if (!SIZE) {
  console.error(`${TAG} unknown JOURNEY_VIEWPORT ${VIEWPORT}`)
  process.exit(2)
}
const WIDTH = SIZE.viewport.width
const PASSWORD = 'LaneAMoney!2026Proof'
const STAMP = `lane-a-money-${Date.now().toString(36)}`

const args = process.argv.slice(2)
let out = `C:/dev/EVIDENCE/MONEY-B7/${VIEWPORT}`
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const report = []
const checks = []
const say = (line) => {
  report.push(line)
  console.log(line)
}
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail })
  say(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: false }).catch(() => {})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

assertNotProduction({ envFile: '.env.local' })
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const SK = (process.env.STRIPE_SECRET_KEY ?? '').trim()
if (!SB || !SVC) {
  console.error(`${TAG} missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`)
  process.exit(2)
}
if (!SK.startsWith('sk_test_') && !SK.startsWith('rk_test_')) {
  console.error(`${TAG} REFUSING: this proof pays and refunds at Stripe and requires a TEST-mode key`)
  process.exit(2)
}
const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })
const stripe = new Stripe(SK, { apiVersion: '2026-02-25.clover' })

const logMark = () => {
  try {
    return statSync(SERVER_LOG).size
  } catch {
    return 0
  }
}
const logSince = (mark) => {
  if (!existsSync(SERVER_LOG)) return ''
  const all = readFileSync(SERVER_LOG)
  return all.subarray(Math.min(mark, all.length)).toString('utf8')
}
/** Every message the console transport printed since `mark`, as { to, subject }. */
const inboxSince = (mark) =>
  [...logSince(mark).matchAll(/\[email:console\]\s+to\s+(.+)\r?\n\[email:console\]\s+subject\s+(.+)/g)].map((m) => ({
    to: m[1].trim(),
    subject: m[2].trim(),
  }))
async function until(read, ok, budgetMs, everyMs = 2000) {
  const t0 = Date.now()
  let value = await read()
  while (!ok(value) && Date.now() - t0 < budgetMs) {
    await sleep(everyMs)
    value = await read()
  }
  return { ok: ok(value), value, seconds: Math.round((Date.now() - t0) / 1000) }
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await answerTheCookieBanner(page, { answer: 'decline' })
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60_000 }).catch(() => {})
  return new URL(page.url()).pathname
}

const money = (cents) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)

say(`${TAG} ${VIEWPORT} (${WIDTH}px) against ${BASE}; the sink is ${SERVER_LOG}`)
const OWNER = alertDestination()
const browser = await chromium.launch()
try {
  const fixture = await buildFixture(db, {
    stamp: STAMP,
    ownerEmail: `${STAMP}-owner@example.com`,
    password: PASSWORD,
    capacity: 10,
    priceCents: 2500,
    log: (m) => say(`${TAG}   ${m}`),
    brand: {
      org: 'Lane A Money Presents',
      orgSlug: 'lane-a-money-presents',
      event: 'Lane A Money Night',
      eventSlug: 'lane-a-money-night',
      owner: 'Lane A Money Owner',
    },
  })
  const { data: orgRow } = await db.from('organisations').select('email').eq('id', fixture.org.id).single()
  const organiserEmail = orgRow?.email ?? fixture.ownerEmail
  check('a-paid-event-exists', Boolean(fixture.event?.slug), `${fixture.event.slug} at ${fixture.tier.price}c`)

  /* ---- 1. THE PURCHASE, AND THE TWO MESSAGES IT SENDS ---- */
  const buyerEmail = `delivered+${STAMP}-buyer@resend.dev`
  const beforeSale = logMark()
  const buyer = await browser.newContext({ ...SIZE, locale: 'en-AU' })
  const page = await buyer.newPage()
  const orderId = await drivePurchase(page, {
    base: BASE,
    slug: fixture.event.slug,
    qty: 2,
    buyerEmail,
    shot: (_p, n) => shot(page, `01-${n}`),
  })
  await buyer.close()
  check('a-real-card-buys-two-tickets', Boolean(orderId), orderId ?? 'no order id on the confirmation URL')
  const confirmed = await waitForConfirmedOrder(db, orderId, 120_000).catch((e) => ({ error: String(e) }))
  const { data: order } = await db.from('orders').select('order_number, status, total_cents').eq('id', orderId).single()
  check('the-order-is-confirmed', order?.status === 'confirmed', `${order?.order_number} ${order?.status} ${order?.total_cents}c${confirmed?.error ? ` (${confirmed.error})` : ''}`)

  const saleMail = await until(
    async () => inboxSince(beforeSale),
    (mails) => mails.some((m) => /your tickets/i.test(m.subject)) && mails.some((m) => /first sale/i.test(m.subject)),
    90_000,
  )
  const buyerMsg = saleMail.value.filter((m) => /your tickets/i.test(m.subject))
  const organiserMsg = saleMail.value.filter((m) => /first sale/i.test(m.subject))
  writeFileSync(join(out, 'sink-after-sale.json'), JSON.stringify(saleMail.value, null, 2), 'utf8')
  check(
    'the-buyer-is-sent-their-tickets',
    buyerMsg.length === 1 && buyerMsg[0].to === buyerEmail,
    buyerMsg.map((m) => `${m.to} :: ${m.subject}`).join(' | ') || 'no ticket email in the sink',
  )
  check(
    'the-organiser-is-sent-their-first-sale',
    organiserMsg.length === 1 && organiserMsg[0].to === organiserEmail,
    organiserMsg.map((m) => `${m.to} :: ${m.subject}`).join(' | ') || 'no first-sale email in the sink',
  )
  check(
    'the-owner-is-not-the-sole-recipient-of-either',
    [...buyerMsg, ...organiserMsg].every((m) => m.to.toLowerCase() !== OWNER.toLowerCase()),
    `owner ${OWNER}; recipients ${[...buyerMsg, ...organiserMsg].map((m) => m.to).join(', ') || 'none'}`,
  )

  /* ---- 2. THE STRIPE OBJECTS, BY ID, VERBATIM (acceptance 5's evidence) ---- */
  const { data: pay } = await db.from('payments').select('gateway_payment_id').eq('order_id', orderId).not('gateway_payment_id', 'is', null).maybeSingle()
  if (pay?.gateway_payment_id) {
    const intent = await stripe.paymentIntents.retrieve(pay.gateway_payment_id, { expand: ['latest_charge.balance_transaction'] })
    writeFileSync(join(out, 'stripe-payment-intent.json'), JSON.stringify(intent, null, 2), 'utf8')
    say(
      `${TAG} retrieved ${intent.id}: transfer_data ${JSON.stringify(intent.transfer_data)}, application_fee_amount `
        + `${intent.application_fee_amount}, on_behalf_of ${intent.on_behalf_of}, transfer_group ${intent.transfer_group}`,
    )
  }

  /* ---- 3. A REFUND CLICKED IN THE ORGANISER DASHBOARD, AND ITS MESSAGE ---- */
  const beforeRefund = logMark()
  const org = await browser.newContext({ ...SIZE, locale: 'en-AU' })
  const op = await org.newPage()
  const landed = await signIn(op, fixture.ownerEmail, PASSWORD)
  check('the-organiser-signs-in', !landed.startsWith('/login'), `${fixture.ownerEmail} -> ${landed}`)
  await op.goto(`${BASE}/dashboard/events/${fixture.event.id}/orders/${orderId}`, { waitUntil: 'load', timeout: 90_000 })
  await op.getByRole('heading', { name: /refund tickets/i }).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  await op.locator('input[type="checkbox"]').nth(1).check()
  await sleep(400)
  await op.getByRole('button', { name: /review refund/i }).click()
  await sleep(400)
  await op.getByRole('button', { name: /confirm refund/i }).click()
  await op.getByRole('heading', { name: /refund started/i }).waitFor({ timeout: 90_000 }).catch(() => {})
  await shot(op, '02-refund-started')
  const settled = await until(
    async () => (await db.from('refunds').select('status, amount_cents').eq('order_id', orderId)).data ?? [],
    (rows) => rows.some((r) => r.status === 'completed'),
    180_000,
  )
  check('the-refund-settles', settled.ok, JSON.stringify(settled.value))
  const refundMail = await until(
    async () => inboxSince(beforeRefund),
    (mails) => mails.some((m) => /refund settled/i.test(m.subject)),
    90_000,
  )
  writeFileSync(join(out, 'sink-after-refund.json'), JSON.stringify(refundMail.value, null, 2), 'utf8')
  const organiserRefund = refundMail.value.filter((m) => /refund settled/i.test(m.subject))
  check(
    'the-organiser-is-sent-the-refund',
    organiserRefund.length === 1 && organiserRefund[0].to === organiserEmail,
    organiserRefund.map((m) => `${m.to} :: ${m.subject}`).join(' | ') || 'no refund email to the organiser in the sink',
  )

  /* ---- 4. THE HOME SCREEN, JUDGED AGAINST THE LEDGER ---- */
  const { data: ledger } = await db
    .from('organiser_balance_ledger')
    .select('delta_cents, reason, event_id, reference_id, metadata')
    .eq('organisation_id', fixture.org.id)
  const sum = (reasons) => (ledger ?? []).filter((r) => reasons.includes(r.reason)).reduce((s, r) => s + Number(r.delta_cents), 0)
  const expectSales = sum(['order_confirmed'])
  // Written as 0 - x so an empty sum is 0 and never -0, which Intl prints as -$0.00.
  const expectRefunds = 0 - sum(['refund_from_balance', 'refund_from_reserve', 'refund_from_gateway', 'refund_platform_float']) || 0
  const expectPaid = 0 - sum(['payout']) || 0
  const REFUND_REASONS = ['refund_from_balance', 'refund_from_reserve', 'refund_from_gateway', 'refund_platform_float']
  const orderCount = new Set((ledger ?? []).filter((r) => r.reason === 'order_confirmed').map((r) => r.reference_id)).size
  const refundIds = new Set((ledger ?? []).filter((r) => REFUND_REASONS.includes(r.reason)).map((r) => r.metadata?.refund_id))
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const heldForEvent = (ledger ?? []).filter((r) => r.event_id === fixture.event.id).reduce((s, r) => s + Number(r.delta_cents), 0)
  const { data: ev } = await db.from('events').select('end_date, timezone').eq('id', fixture.event.id).single()
  const days = await getPayoutScheduleDays('AU', 'AUD')
  const due = new Date(Date.parse(ev.end_date) + days * 86_400_000)
  const expectDay = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: ev.timezone ?? 'Australia/Sydney',
  }).format(due)
  say(`${TAG} ledger: sales ${expectSales}c, refunds ${expectRefunds}c, paid out ${expectPaid}c, held for the event ${heldForEvent}c; due ${due.toISOString()} (${days} day(s) after the end)`)

  await op.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await op.locator('[data-money-panel]').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  await op.locator('[data-money-panel]').scrollIntoViewIfNeeded().catch(() => {})
  await sleep(600)
  await shot(op, `03-dashboard-money-${WIDTH}`)
  const read = async (id) => ({
    value: await op.locator(`[data-kpi="${id}"]`).getAttribute('data-kpi-value').catch(() => null),
    detail: ((await op.locator(`[data-kpi="${id}"] [data-kpi-detail]`).textContent().catch(() => null)) ?? '').trim(),
  })
  const sales = await read('money-sales')
  const refunds = await read('money-refunds')
  const paid = await read('money-paid-out')
  const next = await read('money-next-payout')
  check(
    `the-dashboard-shows-sales-from-the-ledger@${WIDTH}`,
    sales.value === money(expectSales) && sales.detail === `${plural(orderCount, 'order')}, your share`,
    `shown ${sales.value} (${sales.detail}), ledger ${money(expectSales)} over ${plural(orderCount, 'order')}`,
  )
  check(
    `the-dashboard-shows-refunds-from-the-ledger@${WIDTH}`,
    refunds.value === money(expectRefunds) && expectRefunds > 0 && refunds.detail === plural(refundIds.size, 'refund'),
    `shown ${refunds.value} (${refunds.detail}), ledger ${money(expectRefunds)} over ${plural(refundIds.size, 'refund')}`,
  )
  check(`the-dashboard-shows-paid-out-from-the-ledger@${WIDTH}`, paid.value === money(expectPaid), `shown ${paid.value}, ledger ${money(expectPaid)}`)
  check(
    `the-dashboard-shows-the-next-payout-date@${WIDTH}`,
    next.value === expectDay && next.detail.includes(money(heldForEvent)),
    `shown "${next.value}" (${next.detail}), expected "${expectDay}" for ${money(heldForEvent)}`,
  )
  const fit = await op.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
  const faults = judgeSurface({ label: `dashboard@${WIDTH}`, width: WIDTH, fit, totals: [], totalRequired: false })
  check(`fit-dashboard@${WIDTH}`, faults.length === 0, faults.length === 0 ? `doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, 0 clipped` : faults.join(' // '))
  await org.close()
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? `${cause.message}\n${cause.stack}` : String(cause)}`)
  checks.push({ id: 'the-proof-ran-to-the-end', pass: false, detail: String(cause) })
} finally {
  await browser.close().catch(() => {})
}

const failed = checks.filter((c) => !c.pass)
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed at ${VIEWPORT}`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
writeFileSync(join(out, 'report.txt'), `${report.join('\n')}\n`, 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify({ viewport: VIEWPORT, width: WIDTH, stamp: STAMP, checks }, null, 2), 'utf8')
process.exit(failed.length > 0 ? 1 : 0)
