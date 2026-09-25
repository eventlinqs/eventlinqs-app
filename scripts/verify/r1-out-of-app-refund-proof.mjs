/**
 * DRIVEN PROOF: A REFUND MADE OUTSIDE THE APPLICATION IS HEARD, AND HEARD ONCE.
 * Close-out R1.
 *
 * THE DEFECT, reproduced rather than described. Until 14 September 2026 the
 * webhook route reached its successful-refund handler from exactly ONE event,
 * `charge.refunded`. A refund issued from the Stripe Dashboard, which is how a
 * founder or a support person does it at 11pm and which also supports BULK
 * refunds across pages of payments, arrived as `refund.created` and fell into the
 * default branch: the ticket kept admitting at the door, the place stayed
 * unsellable, the waiting list was never offered it, and nothing reported a
 * fault.
 *
 * WHY IT COULD NOT BE SEEN. The in-app refund action calls Stripe and then
 * reconciles SYNCHRONOUSLY, so every test of our own refund button passes
 * whatever the webhook does or does not do. D2's entire waitlist leg passed on
 * that path. So this proof never touches the refund button. It creates the refund
 * the way the Dashboard does - `stripe.refunds.create({ payment_intent })`,
 * outside the application, with no in-app refunds row and no metadata - and then
 * asks the database and the server's own log what happened.
 *
 * WHAT IT ASSERTS, and the acceptance line each one answers:
 *
 *   the ticket stops admitting                 "voids the ticket"
 *   the place returns to inventory             "returns the place to inventory"
 *   the queue is offered it                    "offers it to the waiting list"
 *   the event is in the SERVER's own log       "the event observed arriving at
 *                                               the route in the server's own log"
 *   the outcome is read from the database      "the outcome read back out of the
 *                                               database"
 *   a second delivery changes nothing          "both events delivered for the
 *                                               same refund reconcile it ONCE,
 *                                               proven by replay"
 *
 * THE SERVER'S LOG, NOT THE CLI'S. The Stripe CLI buffers its stdout into a pipe,
 * so its log can hold only a startup banner while events are arriving perfectly
 * well; a check that reads it cannot tell "no event arrived" from "not flushed",
 * and one did exactly that on 14 September. The route prints every event it
 * handles and every one it does not, to the server's own stdout, which is the
 * artefact this proof reads. The listen log is recorded beside it as a second
 * view, never as the verdict.
 *
 * THE REPLAY IS SIGNED THE WAY STRIPE SIGNS ONE. The second delivery is posted to
 * the same route with a real `stripe-signature` header computed from the signing
 * secret `stripe listen` minted, because a delivery the route rejects at the
 * signature proves nothing about idempotency. The refund.created replay carries
 * STRIPE'S OWN event bytes, read back off the account with `stripe.events.list`. The
 * charge.refunded delivery carries STRIPE'S OWN charge bytes in an envelope this
 * proof composes, because Stripe did not send that event for this refund and the
 * whole point is what happens if it ever does; that one composition is stated in
 * the report rather than passed off as a Stripe delivery.
 *
 * SCOPE, stated so nothing here is mistaken for more than it is. The waiting-list
 * JOIN is driven through the interface with the shared
 * lib/waitlist-join.mjs, which is D2's proven dance; R1 is about the refund door,
 * not the join button, and the join is here only to give the freed place somebody
 * to be offered to.
 *
 * TEST ONLY. assertNotProduction runs first, the Stripe key must be a TEST key,
 * and every row it creates carries `lane-a` or the fixture's own
 * `refund-proof-presents-` slug so no other lane's rows are touched.
 *
 * Usage (the drive supplies all of these):
 *   BASE=... SERVER_LOG=... LISTEN_LOG=... STRIPE_WEBHOOK_SECRET=... \
 *   JOURNEY_VIEWPORT=mobile-390 node scripts/verify/r1-out-of-app-refund-proof.mjs \
 *     --out C:/dev/EVIDENCE/R1/<stamp>/mobile-390
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { chromium, BASE, makeJourney, note, attach, signIn } from '../journeys/harness.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { buildFixture, clearEmptyFixtures, drivePurchase } from './lib/refund-proof-fixture.mjs'
import { joinWaitlistThroughTheUi } from './lib/waitlist-join.mjs'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'
import { waitForConfirmedOrder } from './lib/test-card.mjs'
import { REFUND_SUCCESS_EVENTS } from '@/lib/payments/refund-events'

const TAG = '[r1-proof]'
const VIEWPORT = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const WIDTH = { 'mobile-390': 390, 'tablet-768': 768, 'desktop-1440': 1440 }[VIEWPORT] ?? 1440
const SERVER_LOG = process.env.SERVER_LOG ?? '.tmp-serve.log'
const LISTEN_LOG = process.env.LISTEN_LOG ?? null
const WHSEC = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim()
const PASSWORD = 'R1Refund!2026Proof'
const STAMP = `lane-a-r1-${Date.now().toString(36)}`

const args = process.argv.slice(2)
let out = `C:/dev/EVIDENCE/R1/${VIEWPORT}`
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const report = []
const checks = []
const say = (line) => {
  report.push(line)
  console.log(line)
}
function check(id, pass, detail) {
  checks.push({ id, pass, detail })
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
  console.error(`${TAG} REFUSING: this proof writes a refund at Stripe and requires a TEST-mode key`)
  process.exit(2)
}
if (!WHSEC.startsWith('whsec_')) {
  console.error(`${TAG} REFUSING: no STRIPE_WEBHOOK_SECRET, so the replay could not be signed and would prove nothing`)
  process.exit(2)
}

const db = createClient(SB, SVC, { auth: { persistSession: false, autoRefreshToken: false } })
const stripe = new Stripe(SK, { apiVersion: '2026-02-25.clover' })

/** Byte offset of the server log now, so a later read sees only what follows. */
function logMark() {
  try {
    return statSync(SERVER_LOG).size
  } catch {
    return 0
  }
}
/**
 * The server's own stdout since `mark`, SLICED AS BYTES.
 *
 * It reads the file as a Buffer and slices that, because `mark` comes from
 * statSync().size, which is a BYTE count, and the log is full of multi-byte
 * characters (the box drawing `next start` prints, and every non-ASCII byte in
 * an email subject). Slicing a utf8 STRING by a byte offset lands as many
 * characters early as there are multi-byte characters before it, and the first
 * run of this proof did exactly that: the slice began six characters into
 * `[webhook] refund.created: ...`, so the line read `ok] refund.created: ...`,
 * the regex missed it, and the check reported that the event had never been
 * handled when the log in front of it said it had. Another reader that was only
 * as good as its arithmetic.
 */
function logSince(mark) {
  if (!existsSync(SERVER_LOG)) return ''
  const all = readFileSync(SERVER_LOG)
  return all.subarray(Math.min(mark, all.length)).toString('utf8')
}

/** The charge a refund names, however Stripe expressed it. */
const chargeOf = (r) => (typeof r.charge === 'string' ? r.charge : (r.charge?.id ?? null))

/** Post an event to the route with a signature Stripe would accept. */
async function deliver(eventObject) {
  const payload = JSON.stringify(eventObject)
  const t = Math.floor(Date.now() / 1000)
  /*
   * THE WHOLE SECRET IS THE KEY, `whsec_` prefix included. Stripe's own
   * libraries pass the value it gives you, unmodified, and the first run of this
   * proof stripped the prefix and got HTTP 400 "Invalid signature" on both
   * replays: a rejected delivery proves nothing about idempotency, so the check
   * was measuring its own arithmetic again.
   */
  const signature = createHmac('sha256', WHSEC).update(`${t}.${payload}`).digest('hex')
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${signature}` },
    body: payload,
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, body: text.slice(0, 200) }
}

const j = makeJourney('r1-out-of-app-refund', 'R1: a refund made outside the application')
say(`${TAG} ${VIEWPORT} (${WIDTH}px) against ${BASE}`)
say(`${TAG} the server's own log, which is the artefact the event assertions read, is ${SERVER_LOG}`)

const browser = await chromium.launch()
let state = {}
try {
  /* ---- 1. A PAID EVENT WITH ONE PLACE, AND A REAL PURCHASE ---- */
  await clearEmptyFixtures(db, (m) => say(`${TAG}   ${m}`))
  const fixture = await buildFixture(db, {
    stamp: STAMP,
    ownerEmail: `${STAMP}-owner@example.com`,
    password: PASSWORD,
    capacity: 1,
    priceCents: 2500,
    log: (m) => say(`${TAG}   ${m}`),
  })
  state = fixture
  check(
    'a-paid-event-with-one-place-exists',
    Boolean(fixture.event?.slug) && fixture.tier?.total_capacity === 1,
    `${fixture.event?.slug} tier ${fixture.tier?.id} at ${fixture.tier?.price}c, capacity ${fixture.tier?.total_capacity}`,
  )

  const buyerEmail = `delivered+${STAMP}-buyer@resend.dev`
  const buyerCtx = await browser.newContext({ locale: 'en-AU' })
  const buyerPage = await buyerCtx.newPage()
  await attach(j, buyerPage)
  const orderId = await drivePurchase(buyerPage, {
    base: BASE,
    slug: fixture.event.slug,
    qty: 1,
    buyerEmail,
    shot: (page, name) => shot(page, `01-${name}`),
  })
  check('a-real-card-takes-the-only-place', Boolean(orderId), orderId ?? 'no order id on the confirmation URL')
  if (!orderId) throw new Error('no order')
  const confirmed = await waitForConfirmedOrder(db, orderId)
  check(
    'the-order-is-confirmed-and-the-ticket-issued',
    confirmed?.status === 'confirmed',
    `order ${confirmed?.order_number ?? orderId} is ${confirmed?.status ?? 'missing'}`,
  )
  await buyerCtx.close()

  const tierNow = async () => {
    const { data } = await db
      .from('ticket_tiers')
      .select('total_capacity, sold_count, reserved_count')
      .eq('id', fixture.tier.id)
      .maybeSingle()
    return data
  }
  const sold = await tierNow()
  check(
    'the-place-is-sold-and-the-tier-is-out',
    (sold?.sold_count ?? 0) === 1,
    `capacity ${sold?.total_capacity}, sold ${sold?.sold_count}, reserved ${sold?.reserved_count}`,
  )

  /* ---- 2. TWO PEOPLE JOIN THE REAL WAITING LIST, IN ORDER ---- */
  const queueLength = async () => {
    const { count } = await db
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', fixture.event.id)
    return count ?? 0
  }
  const queue = []
  for (const who of ['first', 'second']) {
    const email = `${STAMP}-${who}@example.com`
    const created = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (created.error) {
      check(`the-${who}-person-exists`, false, created.error.message)
      continue
    }
    await db.from('profiles').upsert({
      id: created.data.user.id,
      email,
      full_name: `Kit ${who}`,
      display_name: `Kit ${who}`,
      is_verified: true,
    })
    const ctx = await browser.newContext({ locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    const landed = await signIn(j, page, email, PASSWORD)
    check(`the-${who}-person-signs-in`, !String(landed).startsWith('/login'), `${email} -> ${landed}`)
    const wanted = (await queueLength()) + 1
    const attempt = await joinWaitlistThroughTheUi(page, {
      base: BASE,
      slug: fixture.event.slug,
      queueLength,
      wanted,
      log: (m) => say(`${TAG}   ${m}`),
    })
    await shot(page, `02-joined-${who}`)
    check(
      `the-${who}-person-joins-the-waiting-list`,
      attempt.ok,
      `"${attempt.joined ?? 'nothing to click'}"${attempt.confirmed ? ` then "${attempt.confirmed}"` : ''}; `
        + `${attempt.queued} row(s) on the list, wanted ${wanted}`,
    )
    if (attempt.ok) queue.push(email)
    await ctx.close()

    /*
     * THE LEDGER ROW LANDS AFTER THE RESPONSE, by D1's reversal condition, and it
     * is the row the recovery engine reads to decide who is next. Waiting for it
     * before the next person joins is what makes "in join order" a check rather
     * than a coin toss - and without it the offer has nobody to go to, because
     * the engine reads the ledger and not the waitlist table.
     */
    const { data: slotSoFar } = await db
      .from('ledger_slots')
      .select('id')
      .eq('source_ref', fixture.event.id)
      .maybeSingle()
    if (slotSoFar?.id) {
      for (let i = 0; i < 20; i += 1) {
        const { count } = await db
          .from('ledger_entries')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', slotSoFar.id)
          .eq('demand_action', 'waitlist_join')
        if ((count ?? 0) >= queue.length) break
        await sleep(1000)
      }
    }
  }
  check('the-queue-has-two-people-in-join-order', queue.length === 2, queue.join(' then ') || 'empty')

  /* ---- 3. THE REFUND, MADE OUTSIDE THE APPLICATION ---- */
  const { data: payment } = await db
    .from('payments')
    .select('gateway_payment_id')
    .eq('order_id', orderId)
    .maybeSingle()
  const intentId = payment?.gateway_payment_id ?? null
  check('the-order-has-a-stripe-payment-intent', Boolean(intentId), intentId ?? 'no gateway_payment_id')
  if (!intentId) throw new Error('no payment intent')

  const before = {
    tier: await tierNow(),
    refunds: (await db.from('refunds').select('id').eq('order_id', orderId)).data?.length ?? 0,
    inboxAt: logMark(),
  }

  const mark = logMark()
  const refund = await stripe.refunds.create({ payment_intent: intentId })
  check(
    'a-refund-is-created-outside-the-application',
    refund.status === 'succeeded' || refund.status === 'pending',
    `${refund.id} ${refund.status}, ${refund.amount}c, no metadata.refund_id (${JSON.stringify(refund.metadata ?? {})})`,
  )

  /*
   * WAIT FOR THE ROW, NOT FOR A CLOCK. The reconcile happens inside a webhook
   * delivery this process does not control, so the question is whether the
   * database ever says `completed`, not whether it says so in five seconds.
   */
  let refundRow = null
  for (let i = 0; i < 40; i += 1) {
    const { data } = await db
      .from('refunds')
      .select('id, status, stripe_refund_id, amount_cents, processed_at')
      .eq('stripe_refund_id', refund.id)
      .maybeSingle()
    refundRow = data ?? null
    if (refundRow?.status === 'completed') break
    await sleep(1500)
  }

  /* ---- 4. WHAT STRIPE SENT, ASKED OF STRIPE; AND WHAT THE ROUTE DID WITH IT,
   *         READ OUT OF THE SERVER'S OWN LOG.
   *
   * THIS ORDER IS THE POINT, and it is the check the item's own premise needed.
   * R1 was raised because a log was read for `charge.refunded`, no line was
   * found, and absence of a line was taken for absence of an event - for the one
   * event whose handler printed nothing naming itself. So the question "what did
   * Stripe send" is now put to STRIPE, whose event record cannot be silent, and
   * the log is used only for the separate question of what the route then did.
   * ---------------------------------------------------------------------- */
  const slice = logSince(mark)
  writeFileSync(join(out, 'server-log-slice.txt'), slice, 'utf8')

  let emitted = []
  try {
    const page = await stripe.events.list({ limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 1800 } })
    emitted = page.data
      .filter((e) => {
        const o = e.data?.object ?? {}
        return o.id === refund.id || o.charge === chargeOf(refund) || o.id === chargeOf(refund) || o.payment_intent === intentId
      })
      .map((e) => ({ type: e.type, id: e.id }))
  } catch (err) {
    check('stripes-own-event-record-could-be-read', false, err instanceof Error ? err.message : String(err))
  }
  const emittedTypes = [...new Set(emitted.map((e) => e.type))]
  writeFileSync(join(out, 'stripe-events-emitted.json'), JSON.stringify(emitted, null, 2), 'utf8')
  say(`${TAG} Stripe's own record for this refund: ${emittedTypes.join(', ') || 'NOTHING, which cannot be right'}`)
  check(
    'stripe-announces-the-refund-with-at-least-one-event-this-route-handles',
    emittedTypes.some((t) => REFUND_SUCCESS_EVENTS.includes(t)),
    emitted.map((e) => `${e.type} ${e.id}`).join(' | ') || 'no events name this refund, charge or intent',
  )

  /*
   * EVERY SUCCESS EVENT STRIPE SENT WAS HANDLED. This is the invariant that
   * survives the corrected premise: the outcome must not depend on which of them
   * arrives, so each one Stripe actually emitted must appear in the log as
   * handled rather than as unhandled.
   */
  const handled = {
    'refund.created': /\[webhook\] refund\.created: reconciling through the charge it belongs to/.test(slice),
    'charge.refunded': /\[webhook\] charge\.refunded: reconciling the refunds on this charge/.test(slice),
  }
  const unhandled = [...slice.matchAll(/\[stripe-webhook\] unhandled event type: ([a-z_.]+)/g)].map((m) => m[1])
  say(
    `${TAG} the route's own log: handled ${Object.entries(handled).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}; `
      + `unhandled [${[...new Set(unhandled)].join(', ') || 'none'}]`,
  )
  for (const type of REFUND_SUCCESS_EVENTS) {
    if (!emittedTypes.includes(type)) {
      say(`${TAG} ${type} was not emitted for this refund, so there is nothing to have handled`)
      continue
    }
    check(
      `${type}-was-emitted-by-stripe-and-handled-by-the-route`,
      handled[type] === true,
      handled[type]
        ? "the route's own line names the event it acted on"
        : `Stripe sent ${type} and the route printed no line for it; unhandled were [${[...new Set(unhandled)].join(', ')}]`,
    )
  }
  check(
    'no-success-event-fell-into-the-unhandled-branch',
    !unhandled.some((t) => REFUND_SUCCESS_EVENTS.includes(t)),
    unhandled.filter((t) => REFUND_SUCCESS_EVENTS.includes(t)).join(', ') || 'none did',
  )
  check(
    'the-deprecated-event-is-received-and-deliberately-not-acted-on',
    !emittedTypes.includes('charge.refund.updated') || unhandled.includes('charge.refund.updated'),
    emittedTypes.includes('charge.refund.updated')
      ? `charge.refund.updated arrived and went to the unhandled branch: ${unhandled.includes('charge.refund.updated')}`
      : 'Stripe did not send it for this refund',
  )

  /*
   * THE IDEMPOTENCY IS OBSERVED IN THE WILD, BEFORE ANY REPLAY THIS PROOF
   * COMPOSES. Both doors are open and Stripe sends both events within a second
   * of each other, so one refund is reconciled TWICE in the ordinary course of
   * business. The database latch is what makes that safe, and here it is:
   * exactly one `reconciled` and at least one `already_done` for this refund id.
   */
  const outcomes = [...slice.matchAll(/outcome: '([a-z_]+)'/g)].map((m) => m[1])
  check(
    'two-real-deliveries-reconcile-the-refund-exactly-once',
    outcomes.filter((o) => o === 'reconciled').length === 1 && outcomes.includes('already_done'),
    `reconcile outcomes in order: ${outcomes.join(' then ') || 'none logged'}`,
  )

  /* ---- 5. THE OUTCOME, READ OUT OF THE DATABASE ---- */
  check(
    'the-refund-row-exists-and-reconcile-completed-it',
    refundRow?.status === 'completed' && Boolean(refundRow?.stripe_refund_id),
    `refund ${refundRow?.id ?? 'NONE'}: status ${refundRow?.status ?? 'none'}, `
      + `${refundRow?.amount_cents ?? '?'}c, processed_at ${refundRow?.processed_at ?? 'null'}`,
  )
  const { data: tickets } = await db
    .from('tickets')
    .select('ticket_code, status')
    .eq('order_id', orderId)
  check(
    'the-ticket-stops-admitting',
    (tickets ?? []).length > 0 && (tickets ?? []).every((t) => t.status === 'refunded'),
    (tickets ?? []).map((t) => `${t.ticket_code} ${t.status}`).join(', ') || 'no ticket rows',
  )
  check(
    'and-it-is-refunded-rather-than-merely-void',
    (tickets ?? []).every((t) => t.status !== 'void'),
    'void is the door-safety fallback, which returns no inventory: '
      + `${(tickets ?? []).filter((t) => t.status === 'void').length} void ticket(s)`,
  )
  const after = await tierNow()
  check(
    'the-place-returns-to-inventory',
    (after?.sold_count ?? -1) === 0,
    `capacity ${after?.total_capacity}, sold ${before.tier?.sold_count} -> ${after?.sold_count}, reserved ${after?.reserved_count}`,
  )
  const { data: order } = await db
    .from('orders')
    .select('order_number, status')
    .eq('id', orderId)
    .maybeSingle()
  check(
    'the-order-moves-off-confirmed',
    order?.status === 'refunded',
    `order ${order?.order_number}: ${order?.status}`,
  )
  const { data: claims } = await db
    .from('refund_tickets')
    .select('ticket_id, is_active')
    .eq('refund_id', refundRow?.id ?? '00000000-0000-0000-0000-000000000000')
  check(
    'the-refund-claims-exactly-the-ticket-it-paid-back',
    (claims ?? []).filter((c) => c.is_active).length === 1,
    `${(claims ?? []).filter((c) => c.is_active).length} active claim(s)`,
  )

  /* ---- 6. THE QUEUE IS OFFERED THE FREED PLACE ----
   *
   * WAIT FOR THE MESSAGE, NOT FOR THE RECONCILE. The offer is sent by
   * postReconcileSideEffects AFTER the refunds row is written, so reading the
   * inbox the moment that row says `completed` reads it too early. The first run
   * of this proof did exactly that and reported "no offer email in the server
   * inbox" while the email landed seconds later, inside the replay window, where
   * a second check then counted it as somebody being written to twice. One
   * timing mistake, two false verdicts, in opposite directions.
   */
  const offersInInbox = () =>
    [...logSince(before.inboxAt).matchAll(/\[email:console\]\s+to\s+(.+)\r?\n[\s\S]*?\[email:console\]\s+subject\s+(.+)/g)]
      .map((m) => ({ to: m[1].trim(), subject: m[2].trim() }))
      .filter((m) => /just opened up|place just opened/i.test(m.subject))
  let offers = offersInInbox()
  for (let i = 0; i < 30 && offers.length === 0; i += 1) {
    await sleep(1000)
    offers = offersInInbox()
  }
  check(
    'the-freed-place-is-offered-to-the-person-who-joined-first',
    offers.length === 1 && offers[0].to.includes(queue[0] ?? 'nobody'),
    offers.map((o) => `${o.to} :: ${o.subject}`).join(' | ') || 'no offer email in the server inbox',
  )
  const { data: holds } = await db
    .from('waitlist')
    .select('id, status')
    .eq('event_id', fixture.event.id)
  check(
    'exactly-one-of-the-two-is-holding-the-place',
    (holds ?? []).filter((h) => h.status === 'notified').length === 1,
    (holds ?? []).map((h) => h.status).join(', ') || 'no waitlist rows',
  )

  /* ---- 7. THE REPLAY: BOTH EVENTS, ONE RECONCILE ---- */
  const frozen = {
    sold: after?.sold_count ?? null,
    refunds: (await db.from('refunds').select('id').eq('order_id', orderId)).data?.length ?? 0,
    claims: (claims ?? []).filter((c) => c.is_active).length,
    offers: offers.length,
  }
  const replayMark = logMark()

  // (a) STRIPE'S OWN refund.created event, delivered a second time.
  const events = await stripe.events.list({ type: 'refund.created', limit: 20 })
  const original = events.data.find((e) => (e.data.object)?.id === refund.id) ?? null
  if (original) {
    const res = await deliver(original)
    check(
      'stripes-own-refund.created-event-redelivered-is-accepted',
      res.status === 200,
      `HTTP ${res.status} ${res.body}`,
    )
  } else {
    check('stripes-own-refund.created-event-redelivered-is-accepted', false, 'the event could not be read back from Stripe')
  }

  // (b) charge.refunded for the same refund. Stripe did not send one here, and
  //     the envelope is composed by this proof around Stripe's OWN charge bytes,
  //     because the question is what happens if it ever does arrive.
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id ?? null
  if (chargeId) {
    const charge = await stripe.charges.retrieve(chargeId)
    const res = await deliver({
      id: `evt_r1_replay_${Date.now().toString(36)}`,
      object: 'event',
      api_version: '2026-02-25.clover',
      created: Math.floor(Date.now() / 1000),
      type: 'charge.refunded',
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: { object: charge },
    })
    check(
      'a-charge.refunded-delivery-for-the-same-refund-is-accepted',
      res.status === 200,
      `HTTP ${res.status} ${res.body} (Stripe's own charge object, envelope composed by this proof)`,
    )
  } else {
    check('a-charge.refunded-delivery-for-the-same-refund-is-accepted', false, 'the refund names no charge')
  }

  await sleep(4000)
  const replayed = {
    sold: (await tierNow())?.sold_count ?? null,
    refunds: (await db.from('refunds').select('id').eq('order_id', orderId)).data?.length ?? 0,
    claims:
      (
        await db
          .from('refund_tickets')
          .select('ticket_id, is_active')
          .eq('refund_id', refundRow?.id ?? '00000000-0000-0000-0000-000000000000')
      ).data?.filter((c) => c.is_active).length ?? 0,
  }
  const replaySlice = logSince(replayMark)
  writeFileSync(join(out, 'replay-log-slice.txt'), replaySlice, 'utf8')
  const replayOffers = [...replaySlice.matchAll(/\[email:console\]\s+subject\s+(.+)/g)]
    .map((m) => m[1].trim())
    .filter((s) => /just opened up|place just opened|refund/i.test(s))

  check(
    'the-seat-is-not-returned-twice',
    replayed.sold === frozen.sold,
    `sold_count ${frozen.sold} -> ${replayed.sold} across two more deliveries`,
  )
  check(
    'no-second-refund-row-is-written',
    replayed.refunds === frozen.refunds,
    `${frozen.refunds} -> ${replayed.refunds} refunds row(s) on the order`,
  )
  check(
    'no-second-ticket-claim-is-written',
    replayed.claims === frozen.claims,
    `${frozen.claims} -> ${replayed.claims} active claim(s)`,
  )
  check(
    'nobody-is-written-to-a-second-time',
    replayOffers.length === 0,
    replayOffers.join(' | ') || 'no refund or offer email on either replay',
  )
  const alreadyDone = /already_done|already been reconciled/.test(replaySlice)
  say(
    `${TAG} the replay is answered by the database's own latch `
      + `(reconcile_refund returns already_done when the row is already completed): `
      + `${alreadyDone ? 'observed in the log' : 'not printed by the route, proven by the counts above'}`,
  )

  /* ---- 8. WHAT THE TWO PEOPLE WHO CARE ACTUALLY SEE, AT THIS WIDTH ---- */
  {
    const ctx = await browser.newContext({ locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    // The public event page: the place is back on sale.
    await page.goto(`${BASE}/events/${fixture.event.slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2500)
    const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
    const faults = judgeSurface({ label: `event-page@${WIDTH}`, width: WIDTH, fit, totals: [], totalRequired: false })
    await shot(page, `03-event-page-${WIDTH}`)
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(
      `the-place-is-on-sale-again@${WIDTH}`,
      !/sold out/i.test(bodyText),
      /sold out/i.test(bodyText) ? 'the page still says sold out' : 'no sold-out state on the page',
    )
    check(
      `fit-event-page@${WIDTH}`,
      faults.length === 0,
      faults.length === 0 ? `doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, 0 clipped` : faults.join(' // '),
    )

    // The organiser's own order page: the refund is on the record.
    const owner = await browser.newContext({ locale: 'en-AU' })
    const ownerPage = await owner.newPage()
    await attach(j, ownerPage)
    const landed = await signIn(j, ownerPage, fixture.ownerEmail, PASSWORD)
    if (!String(landed).startsWith('/login')) {
      await ownerPage.goto(`${BASE}/dashboard/events/${fixture.event.id}/orders`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      await ownerPage.waitForTimeout(3000)
      const ownerFit = await ownerPage.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
      const ownerFaults = judgeSurface({
        label: `orders@${WIDTH}`,
        width: WIDTH,
        fit: ownerFit,
        totals: [],
        totalRequired: false,
      })
      await shot(ownerPage, `04-orders-${WIDTH}`)
      const ordersText = (await ownerPage.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
      check(
        `the-organiser-sees-the-refund-on-the-order@${WIDTH}`,
        /refunded/i.test(ordersText),
        /refunded/i.test(ordersText) ? 'the orders surface says refunded' : 'no refunded state on the orders surface',
      )
      check(
        `fit-orders@${WIDTH}`,
        ownerFaults.length === 0,
        ownerFaults.length === 0
          ? `doc.scrollWidth ${ownerFit.docScrollWidth}/${ownerFit.innerWidth}, 0 clipped`
          : ownerFaults.join(' // '),
      )
    } else {
      check(`the-organiser-sees-the-refund-on-the-order@${WIDTH}`, false, `owner sign-in refused: ${landed}`)
    }
    await owner.close()
    await ctx.close()
  }
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? `${cause.message}\n${cause.stack}` : String(cause)}`)
  checks.push({ id: 'the-proof-ran-to-the-end', pass: false, detail: String(cause) })
} finally {
  await browser.close().catch(() => {})
}

if (LISTEN_LOG && existsSync(LISTEN_LOG)) {
  writeFileSync(join(out, 'stripe-listen.log'), readFileSync(LISTEN_LOG, 'utf8'), 'utf8')
}
const failed = checks.filter((c) => !c.pass)
say('')
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed at ${VIEWPORT}`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
note(j, 'R1 proof finished', `${checks.length - failed.length}/${checks.length} at ${VIEWPORT}`)
writeFileSync(join(out, 'report.txt'), `${report.join('\n')}\n`, 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify({ viewport: VIEWPORT, width: WIDTH, fixture: state?.event?.slug ?? null, checks }, null, 2), 'utf8')
process.exit(failed.length > 0 ? 1 : 0)
