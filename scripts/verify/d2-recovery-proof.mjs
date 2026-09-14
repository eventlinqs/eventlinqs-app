/**
 * DRIVEN PROOF: THE RECOVERY ENGINE WRITES TO A REAL PERSON, AND STOPS WHEN IT
 * IS TOLD TO. Close-out D2, the acceptance lines:
 *
 *     "Driven proof on TEST: abandon, receive message one, return, buy, confirm
 *      two and three suppressed."
 *     "Unsubscribe proven to work and to suppress."
 *     "Proof panel renders real numbers at 390, 768 and 1440, no overflow."
 *
 * ----------------------------------------------------------------------------
 * THE PAYMENT STEP NEEDS A STRIPE TEST KEY, AND WHAT HAPPENS WITH AND WITHOUT ONE.
 *
 * Until 12 September 2026 there was none on this machine (both CLI keys
 * answered `api_key_expired`, every Vercel record is `sensitive`), so the
 * abandonment was produced by a real buyer pressing Continue to payment on a
 * real paid event: `processCheckout` wrote the `checkout_started` demand row
 * carrying their address and then could not mint a payment intent, so no order
 * existed and the reservation lapsed. That is the recorded state of a buyer who
 * closed the tab at the card form, and the run said the payment step itself was
 * NOT EXERCISED. That run is unchanged when no key is present.
 *
 * WITH A KEY IN THE ENVIRONMENT (STRIPE_SECRET_KEY, which
 * scripts/verify/d2-stripe-drive.mjs supplies from the CLI's own config beside
 * the matching publishable key and a `stripe listen` forwarder), every buyer
 * reaches the PAINTED card form, and the run has a THIRD buyer who does what
 * the close-out actually asks: leaves at the card form, receives message one,
 * comes back by its link, pays with Stripe's test card, has the order confirmed
 * by the webhook, and is then REFUSED messages two and three because they
 * bought. The panel must count them as having come back.
 *
 * In both shapes the abandonment is a real one rather than a seeded row. A real
 * buyer opens a real paid event in a real browser, chooses a ticket, fills the
 * real checkout form and presses Continue to payment. Nothing is inserted by
 * this script that a person did not cause.
 *
 * TWO ACTS OF CLOCK COMPRESSION ARE TAKEN ON TEST AND ARE NAMED.
 *   - a reservation is made to have lapsed three hours ago, rather than waiting
 *     for it. A real buyer produces that by waiting; a proof cannot.
 *   - the sweep is run at hour 25 for the second message, through
 *     `d2-run-engine.mjs`, which calls the same function the cron route calls
 *     with the same adapter and the same database. The FIRST message goes
 *     through the real cron route over real HTTP with the real secret.
 * Both refuse to run against production, on the URL, before anything happens.
 *
 * Usage:
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/d2-recovery-proof.mjs --out C:/dev/EVIDENCE/D2
 *
 * JOURNEY_VIEWPORT=mobile-390|tablet-768|desktop-1440 selects the viewport and
 * namespaces the output, so three runs do not overwrite one another.
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { MEASURE_VIEWPORT_FIT, MEASURE_ORDER_TOTALS, judgeSurface } from './lib/viewport-fit.mjs'
import { stripeFrameOn, payWithTestCard, waitForConfirmedOrder, whyNoFrame } from './lib/test-card.mjs'

const TAG = '[d2-proof]'
const BASE = process.env.BASE ?? 'http://localhost:3311'
const SERVER_LOG = process.env.SERVER_LOG ?? join(process.cwd(), '.tmp', 'd2-drive-server.log')
/* The payment leg runs when a Stripe TEST key is in the environment (header). */
const STRIPE_LEG = Boolean((process.env.STRIPE_SECRET_KEY ?? '').trim())

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D2'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]

const VIEWPORTS = {
  'mobile-390': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'tablet-768': { viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  'desktop-1440': { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
}
const viewportName = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const contextOptions = VIEWPORTS[viewportName]
if (!contextOptions) {
  console.error(`${TAG} JOURNEY_VIEWPORT must be one of ${Object.keys(VIEWPORTS).join(', ')}`)
  process.exit(1)
}
const viewport = contextOptions.viewport
out = join(out, viewportName)
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} REFUSING: this is the PRODUCTION Supabase project and this drive WRITES.`)
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`)
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const checks = []
const report = []
const say = line => {
  report.push(line)
  console.log(line)
}
function check(id, pass, detail) {
  checks.push({ id, pass, detail })
  say(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const money = cents =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(cents / 100)

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const buyerAddress = who => `d2-${who}-${RUN}@example.com`

/*
 * THE TWO CONTROLS A BUYER ACTUALLY USES, driven the way the UX6 checkout proof
 * drives them. The first draft of this file guessed at the markup with a
 * `page.evaluate` that hunted for a card containing the tier name and a `+`
 * button inside it, and it found nothing: both buyers ended the run still on
 * the event page with no reservation and no demand row. Reading the buttons and
 * the labels the way a person reads them is the only version that works, and
 * there is already one in the tree that does.
 */
const clickText = async (page, rx) => {
  for (const el of await page.$$('button, a[role=button], a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

const fillByLabel = async (page, rx, value) => {
  for (const el of await page.$$('input')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const name = await el.evaluate(
      e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
    )
    if (rx.test(name)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

/* -------------------------------------------------------------------------
 * READING THE MAIL. `EMAIL_TRANSPORT=console` prints every message the server
 * sends to the server's own stdout, and the drive's server writes that to a
 * file. So the inbox is a file, and the drive reads what a person would read
 * rather than asserting that a send function was called.
 * ---------------------------------------------------------------------- */
function inbox() {
  if (!existsSync(SERVER_LOG)) return []
  const text = readFileSync(SERVER_LOG, 'utf8')
  const messages = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\[email:console\]\s+(to|subject|link)\s+(.*)$/)
    if (!m) {
      if (/\[email:console\] ---/.test(line) && current) {
        messages.push(current)
        current = null
      }
      continue
    }
    if (m[1] === 'to') current = { to: m[2].trim(), subject: '', links: [] }
    else if (m[1] === 'subject' && current) current.subject = m[2].trim()
    else if (m[1] === 'link' && current) current.links.push(m[2].trim())
  }
  if (current) messages.push(current)
  return messages
}
const messagesTo = address => inbox().filter(m => m.to.toLowerCase() === address.toLowerCase())

/* -------------------------------------------------------------------------
 * THE CRON ROUTES, CALLED THE WAY VERCEL CALLS THEM.
 * ---------------------------------------------------------------------- */
async function cron(path) {
  const secret = process.env.CRON_SECRET ?? ''
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  return { status: res.status, body, parsed }
}

/**
 * The engine, with a clock this drive chooses. See d2-run-engine.mjs.
 *
 * TWO THINGS ITS FIRST RUN GOT WRONG, both fixed here rather than worked around.
 * It inherited an environment with no `EMAIL_TRANSPORT`, so every send in the
 * subprocess tried to reach Resend with no key and came back as `failed: 5` with
 * an empty refusal map, which reads exactly like a product defect. And its
 * output went to its own stdout, so even a successful send would have been
 * invisible to an inbox that reads the SERVER's log. Its output is now appended
 * to the same file, in the same format, because it is the same transport.
 */
function engine(...engineArgs) {
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      'scripts/verify/d2-run-engine.mjs',
      ...engineArgs,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, EMAIL_TRANSPORT: 'console' },
    },
  )
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
  // The subprocess's mail lands in the same inbox the server writes to.
  appendFileSync(SERVER_LOG, `\n${text}`, 'utf8')
  const line = `${r.stdout ?? ''}`.trim().split(/\r?\n/).filter(Boolean).pop() ?? ''
  let parsed = null
  try {
    parsed = JSON.parse(line)
  } catch {
    parsed = null
  }
  return { code: r.status ?? 1, parsed, text }
}

/* -------------------------------------------------------------------------
 * ENUMERATE THE EVENT. Never typed: a real published, public, unseated, future
 * event with a PAID tier that has spare capacity, chosen from the database.
 * ---------------------------------------------------------------------- */
async function paidEventWithRoom() {
  const { data: tiers } = await db
    .from('ticket_tiers')
    .select(
      'id, event_id, name, price, total_capacity, sold_count, reserved_count, max_per_order, sale_start, sale_end',
    )
    .gt('price', 0)
    .eq('is_active', true)
    .eq('is_visible', true)
    .limit(1000)

  const now = Date.now()
  const candidates = []
  for (const tier of tiers ?? []) {
    if (!tier.name || !tier.name.trim()) continue
    if ((tier.max_per_order ?? 1) < 2) continue
    if ((tier.total_capacity ?? 0) <= 0) continue
    if ((tier.total_capacity ?? 0) - (tier.sold_count ?? 0) - (tier.reserved_count ?? 0) < 4) continue
    if (tier.sale_start && new Date(tier.sale_start).getTime() > now) continue
    if (tier.sale_end && new Date(tier.sale_end).getTime() < now) continue
    candidates.push(tier)
  }

  /*
   * THE ORGANISER HAS TO BE ABLE TO SELL, and the first run of this drive did
   * not ask. It picked a published paid event whose organiser had no connected
   * Stripe account, and the page correctly answered "Tickets not yet on sale.
   * This organiser is still finishing their payment setup", so there was no
   * quantity control to press and the run reported a missing control as though
   * the product had lost one. `src/lib/payments/sale-status.ts` is the rule and
   * these are its fields, read rather than reasoned about.
   */
  const eventIds = [...new Set(candidates.map(t => t.event_id))]
  const { data: events } = await db
    .from('events')
    .select('id, slug, title, status, visibility, seat_map_id, start_date, organisation_id')
    .in('id', eventIds)
  const byId = new Map((events ?? []).map(e => [e.id, e]))

  const orgIds = [...new Set((events ?? []).map(e => e.organisation_id).filter(Boolean))]
  const { data: orgs } = await db
    .from('organisations')
    .select('id, name, owner_id, stripe_account_id, stripe_charges_enabled')
    .in('id', orgIds)
  const orgById = new Map((orgs ?? []).map(o => [o.id, o]))

  const usable = []
  for (const tier of candidates) {
    const event = byId.get(tier.event_id)
    if (!event || event.status !== 'published' || event.visibility !== 'public' || !event.slug) continue
    if (event.seat_map_id) continue
    if (new Date(event.start_date).getTime() <= now) continue
    const org = orgById.get(event.organisation_id)
    if (!org?.stripe_account_id || org.stripe_charges_enabled !== true) continue
    usable.push({ event, tier, org })
  }
  usable.sort((a, b) => new Date(a.event.start_date) - new Date(b.event.start_date))
  return usable[0] ?? null
}

async function slotFor(eventId) {
  const { data } = await db.from('ledger_slots').select('*').eq('source_ref', eventId).maybeSingle()
  return data ?? null
}

/* -------------------------------------------------------------------------
 * MEASURING A SURFACE. Same shape as the D1 and UX6 drives, including the
 * width read back off the page: a run that reports "0 clipped at 390" while
 * the browser laid the page out at 1280 is a green run that proves the
 * opposite of what it says, and this drive's ancestors did exactly that once.
 * ---------------------------------------------------------------------- */
async function measure(page, label, { totalRequired = false } = {}) {
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  await page.waitForTimeout(400)
  const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
  if (fit.innerWidth !== viewport.width) {
    check(
      `viewport-was-actually-set@${viewport.width}`,
      false,
      `${label}: the browser reports innerWidth ${fit.innerWidth}, not ${viewport.width}.`,
    )
  }
  /*
   * THE TOTALS ARE MEASURED HERE, as boxes, the way the UX6 proof measures
   * them. The first Stripe run of this file handed the judge a selector
   * string and was told "the order total is marked but not visible", which
   * was the judge reading `.visible` off a string. The judge wants what
   * MEASURE_ORDER_TOTALS returns and nothing else.
   */
  const totals = await page.evaluate(`(${MEASURE_ORDER_TOTALS})()`).catch(() => [])
  const faults = judgeSurface({ label, width: viewport.width, fit, totals, totalRequired })
  const shot = join(out, `${label}.png`)
  await page.screenshot({ path: shot, fullPage: true })
  return {
    ok: faults.length === 0,
    detail:
      faults.length === 0
        ? `doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, 0 clipped, ${fit.exempt?.length ?? 0} exempt`
        : faults.join(' // '),
    shot,
  }
}

/* =========================================================================
 * THE RUN
 * ====================================================================== */
say(`${TAG} viewport ${viewportName} (${viewport.width}x${viewport.height}) against ${BASE}`)
say(`${TAG} database ${SUPABASE_URL.replace(/https:\/\/([a-z]+)\..*/, '$1')} (TEST; production is refused above)`)
say(`${TAG} run ${RUN}; the inbox is ${SERVER_LOG}`)
say(
  STRIPE_LEG
    ? `${TAG} a Stripe TEST key is in the environment: the payment step is live and a third buyer returns and buys`
    : `${TAG} no Stripe key in the environment: two buyers, the payment step NOT EXERCISED`,
)

/*
 * WHAT A BUYER LEAVES BEHIND AT THE CARD FORM, read from the database: an
 * order in `pending`, a payment row in `processing`, and a minted intent.
 */
async function pendingOrderFor(reservationId) {
  const { data: order } = await db
    .from('orders')
    .select('id, status, metadata')
    .eq('reservation_id', reservationId)
    .maybeSingle()
  if (!order) return null
  const paymentId = order.metadata?.payment_id ?? null
  const { data: payment } = paymentId
    ? await db.from('payments').select('status, gateway_payment_id').eq('id', paymentId).maybeSingle()
    : { data: null }
  return {
    orderId: order.id,
    status: order.status,
    paymentStatus: payment?.status ?? null,
    intent: payment?.gateway_payment_id ?? null,
  }
}

const picked = await paidEventWithRoom()
if (!picked) {
  say(
    `${TAG} FAIL: no published, public, unseated, future event on TEST with a paid tier that has room ` +
      `AND an organiser whose Stripe account can take a charge. Without one there is no checkout to abandon.`,
  )
  writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
  process.exit(1)
}
say(
  `${TAG} event enumerated from the database: "${picked.event.title}" (${picked.event.slug}), ` +
    `tier "${picked.tier.name}" at ${money(picked.tier.price)}, ` +
    `organiser "${picked.org.name}" (charges enabled)`,
)

const browser = await chromium.launch()
let failures = 0

try {
  /* ====================================================================
   * 1. A REAL BUYER ABANDONS A REAL CHECKOUT.
   * ================================================================= */
  const abandoner = buyerAddress('left')
  const stayer = buyerAddress('stayed')
  const returner = STRIPE_LEG ? buyerAddress('returned') : null
  const buyers = returner ? [abandoner, stayer, returner] : [abandoner, stayer]
  const whoIs = address => (address === abandoner ? 'A' : address === stayer ? 'B' : 'C')

  for (const address of buyers) {
    const who = whoIs(address)
    const ctx = await browser.newContext({ ...contextOptions, locale: 'en-AU' })
    const page = await ctx.newPage()
    try {
      const res = await page.goto(`${BASE}/events/${picked.event.slug}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      check(`event-page-opens[${who}]`, res?.status() === 200, `HTTP ${res?.status()}`)
      await page.waitForTimeout(2500)

      // One of the paid tier, through the real stepper.
      const plus = await clickText(page, /^\+$/)
      check(`quantity-control-exists[${who}]`, Boolean(plus), plus ? 'the stepper answered' : 'no quantity control')
      await page.waitForTimeout(1200)

      const toCheckout =
        (await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed|register)/i))
      if (toCheckout) {
        await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
        await page.waitForTimeout(3000)
      }

      const onCheckout = /\/checkout\//.test(page.url())
      check(`reached-checkout[${who}]`, onCheckout, `"${toCheckout ?? 'nothing to click'}" -> ${page.url().replace(BASE, '')}`)
      if (!onCheckout) {
        await page.screenshot({ path: join(out, `debug-not-checkout-${who}.png`), fullPage: true }).catch(() => {})
        continue
      }

      // The real checkout form, filled the way a person fills it.
      await fillByLabel(page, /full name/i, 'Casey Nguyen')
      await fillByLabel(page, /^email/i, address)
      await page.waitForTimeout(600)
      const reused = await clickText(page, /use my details for all tickets/i)
      if (!reused) {
        await fillByLabel(page, /first name/i, 'Casey')
        await fillByLabel(page, /last name/i, 'Nguyen')
        for (const e of await page.$$('input[type="email"]')) await e.fill(address).catch(() => {})
      }
      await page.waitForTimeout(1200)

      /*
       * PRESS CONTINUE TO PAYMENT AND THEN LEAVE. This is the moment
       * `processCheckout` runs and writes the `checkout_started` demand row
       * carrying the address. With a key the card form paints and the buyer
       * closes the tab on it, leaving a pending order with a minted intent;
       * without one nothing is minted and no order exists. Both are the state
       * of a buyer who looked at the card form and left, which is what the
       * engine is built for.
       */
      const submitted = await clickText(page, /^continue to payment/i)
      check(`pressed-pay[${who}]`, Boolean(submitted), submitted ?? 'no way to submit the checkout details')
      if (STRIPE_LEG) {
        const painted = await stripeFrameOn(page)
        check(
          `the-card-form-painted[${who}]`,
          painted,
          painted
            ? 'the Stripe payment frame is on the page'
            : `no Stripe frame: ${await whyNoFrame(page, process.env.SERVER_LOG ?? null)}`,
        )
        const reservationId = page.url().match(/\/checkout\/([0-9a-f-]{36})/)?.[1] ?? null
        const pending = reservationId ? await pendingOrderFor(reservationId) : null
        check(
          `the-abandoned-order-is-pending-with-an-intent[${who}]`,
          Boolean(pending?.intent) && pending?.status === 'pending',
          pending
            ? `order ${pending.orderId} ${pending.status}, payment ${pending.paymentStatus}, intent ${pending.intent ? 'minted' : 'absent'}`
            : 'no order row for this reservation',
        )
        await page.screenshot({ path: join(out, `1-payment-step-${who}.png`), fullPage: true })
      } else {
        await page.waitForTimeout(9000)
        await page.screenshot({ path: join(out, `1-checkout-${who}.png`), fullPage: true })
      }
    } finally {
      await ctx.close()
    }
  }

  // Wait for the deferred ledger writes: every demand row runs behind `after()`.
  await new Promise(r => setTimeout(r, 6000))

  const slot = await slotFor(picked.event.id)
  check('the-ledger-knows-this-slot', Boolean(slot), slot ? `slot ${slot.id}` : 'no ledger slot for this event')
  if (!slot) throw new Error('no slot')

  const { data: startedRows } = await db
    .from('ledger_entries')
    .select('id, contact_email, occurrence_key')
    .eq('slot_id', slot.id)
    .eq('demand_action', 'checkout_started')
    .in('contact_email', buyers)
  const started = startedRows ?? []
  check(
    'the-checkout-wrote-a-demand-row-carrying-the-address',
    started.length === buyers.length,
    `${started.length} checkout_started row(s) for the ${buyers.length} addresses: ${started.map(r => r.contact_email).join(', ')}`,
  )
  if (started.length === 0) throw new Error('nothing to recover: no checkout_started row was written')

  /* ====================================================================
   * 2. THE CLOCK, COMPRESSED, AND NAMED. A real buyer produces a lapsed
   *    reservation by waiting; a proof cannot wait three hours.
   * ================================================================= */
  const reservationIds = started.map(r => String(r.occurrence_key).replace('demand:checkout_started:', ''))
  const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString()
  /*
   * THE RESERVATION IS MADE TO HAVE RUN OUT, AND THE CLOCK MOVES FORWARD RATHER
   * THAN THE ROW MOVING BACK. Two earlier runs of this drive established why,
   * and it is a fact about the database rather than a preference:
   *
   *   `public.reservations` carries a `set_updated_at` trigger that writes
   *   `updated_at = now()` on EVERY update, so a back-dated `updated_at` cannot
   *   survive being written. The abandonment recorder dates its ledger row from
   *   `updated_at`, so an abandonment is always dated the moment the platform
   *   NOTICED the lapse. In production that is correct and is within a minute of
   *   the reservation running out; nothing here should be changed to suit a test.
   *
   * So this only makes `expires_at` past, which is exactly what a buyer who walks
   * away produces, and the SWEEP is then run at the hour the schedule names.
   */
  const { error: ageError } = await db
    .from('reservations')
    .update({ expires_at: threeHoursAgo })
    .in('id', reservationIds)
  check(
    'the-reservations-are-made-to-have-run-out',
    !ageError,
    ageError
      ? ageError.message
      : `${reservationIds.length} reservation(s) now expire at ${threeHoursAgo} (TEST only, named in the header)`,
  )

  /* ====================================================================
   * 3. THE REAL EXPIRY CRON RECORDS THE ABANDONMENT.
   * ================================================================= */
  const expire = await cron('/api/cron/reservation-expire')
  check('reservation-expire-cron-answers', expire.status === 200, `HTTP ${expire.status} ${expire.body.slice(0, 160)}`)
  await new Promise(r => setTimeout(r, 3000))

  const { data: abandonedRows } = await db
    .from('ledger_entries')
    .select('id, contact_email, occurred_at, inventory_class, unit_amount_cents')
    .eq('slot_id', slot.id)
    .eq('demand_action', 'checkout_abandoned')
    .in('contact_email', buyers)
  const abandoned = abandonedRows ?? []
  check(
    'the-abandonment-is-in-the-ledger',
    abandoned.length === started.length,
    `${abandoned.length} checkout_abandoned row(s); class=${abandoned[0]?.inventory_class ?? 'null'} price=${
      abandoned[0]?.unit_amount_cents ?? 'null'
    }`,
  )
  check(
    'the-abandonment-carries-what-the-message-must-name',
    abandoned.every(r => r.inventory_class && r.unit_amount_cents !== null),
    abandoned.map(r => `${r.inventory_class}@${r.unit_amount_cents}`).join(', ') || 'nothing recorded',
  )

  /* ====================================================================
   * 4. THE REAL SWEEP CRON, AT THE REAL HOUR, WRITES TO NOBODY.
   *
   *    This is a real assertion and not a warm-up: the abandonment is minutes
   *    old, the first message is due at two hours, and a sequence that wrote to
   *    somebody now would be writing to a person who has been gone for three
   *    minutes. The route answers, considers the slot, and refuses every row
   *    with the reason.
   * ================================================================= */
  const tooSoon = await cron('/api/cron/recovery-sweep')
  check('recovery-sweep-cron-answers', tooSoon.status === 200, `HTTP ${tooSoon.status}`)
  say(`${TAG} the cron route said: ${JSON.stringify(tooSoon.parsed ?? tooSoon.body.slice(0, 300))}`)
  /*
   * JUDGED ON THIS RUN'S ADDRESSES, NOT ON THE SWEEP'S TOTAL. The first
   * version asserted `sent === 0`, and on 12 September the real cron answered
   * `sent: 83`: abandonments left on TEST by earlier days' drives had come due
   * in the meantime and the sweep wrote to them, exactly as it should. That is
   * the cron doing its job on a test database nothing else sweeps, not a
   * message to somebody who left three minutes ago. So the assertion is the
   * one the sentence actually makes: no send row and no message for any of
   * the addresses that left minutes ago, and the refusal that names why.
   */
  const { data: earlySends } = await db
    .from('recovery_sends')
    .select('contact_email')
    .eq('slot_id', slot.id)
    .in('contact_email', buyers)
  const earlyInbox = buyers.reduce((n, address) => n + messagesTo(address).length, 0)
  check(
    'nothing-is-written-to-somebody-who-left-three-minutes-ago',
    (earlySends ?? []).length === 0 &&
      earlyInbox === 0 &&
      JSON.stringify(tooSoon.parsed?.refusals ?? {}).includes('no message is due yet'),
    `${(earlySends ?? []).length} send row(s) and ${earlyInbox} message(s) for this run's ${buyers.length} addresses; ` +
      `the sweep sent ${tooSoon.parsed?.sent} to older abandonments already due on TEST and refused ` +
      JSON.stringify(tooSoon.parsed?.refusals ?? {}),
  )

  /* ====================================================================
   * 5. AT HOUR THREE, MESSAGE ONE GOES.
   *
   *    Through `d2-run-engine.mjs`, which calls the same function the cron
   *    route just called, with the same adapter, the same database and the same
   *    transport, and one thing different: the clock. Waiting two hours is not
   *    a proof strategy, and the route cannot be asked to pretend.
   * ================================================================= */
  /*
   * THE RATE IS STATED FOR THE SEQUENCE, and the reason is written here rather
   * than buried in a flag. The reversal condition is a rate over what was
   * actually sent, and THIS DRIVE unsubscribes somebody on every run: after
   * eight runs it had manufactured a 15.7% unsubscribe rate against its own
   * sends, the engine correctly cut the sequence to one message, and the drive
   * read its own footprint as four product failures.
   *
   * So the sequence is exercised at a healthy rate that is named out loud (10
   * unsubscribes in 2000 sends, which is 0.5%), and the CUT is proved
   * separately, below, against the real numbers in the database. Both
   * directions, neither by accident.
   */
  const atHour3 = engine('sweep', '--hours-ahead', '3', '--sent', '2000', '--unsubscribed', '10', '--complained', '0')
  say(`${TAG} at hour 3 the engine said: ${JSON.stringify(atHour3.parsed ?? atHour3.text.slice(0, 300))}`)
  await new Promise(r => setTimeout(r, 1500))

  const firstToAbandoner = messagesTo(abandoner)
  check(
    'message-one-reached-the-person-who-left',
    firstToAbandoner.length === 1,
    firstToAbandoner.length === 1
      ? `subject "${firstToAbandoner[0].subject}"`
      : `${firstToAbandoner.length} message(s) in the inbox for ${abandoner}`,
  )
  if (firstToAbandoner.length === 1) {
    const m = firstToAbandoner[0]
    check(
      'the-message-names-the-slot',
      m.subject.includes(picked.event.title.slice(0, 20)),
      `subject "${m.subject}" against "${picked.event.title}"`,
    )
    check(
      'the-message-links-somewhere-they-can-finish',
      m.links.some(l => l.includes(`/events/${picked.event.slug}`)),
      m.links.join(' | ') || 'no links printed',
    )
    check(
      'the-message-carries-a-working-way-to-stop',
      m.links.some(l => l.includes('/unsubscribe/recovery/')),
      m.links.find(l => l.includes('/unsubscribe/recovery/')) ?? 'no stop link',
    )
  }

  if (returner) {
    const firstToReturner = messagesTo(returner)
    check(
      'message-one-reached-the-person-who-will-return',
      firstToReturner.length === 1,
      firstToReturner.length === 1
        ? `subject "${firstToReturner[0].subject}"`
        : `${firstToReturner.length} message(s) in the inbox for ${returner}`,
    )
  }

  const { data: sendRows } = await db
    .from('recovery_sends')
    .select('id, contact_email, message_number, demand_entry_id, inventory_class, unit_amount_cents')
    .eq('slot_id', slot.id)
    .in('contact_email', buyers)
  check(
    'every-send-names-the-row-that-authorised-it',
    (sendRows ?? []).length > 0 && (sendRows ?? []).every(r => Number(r.demand_entry_id) > 0),
    (sendRows ?? []).map(r => `${r.contact_email}#${r.message_number}->entry ${r.demand_entry_id}`).join(', ') || 'no sends',
  )

  /* ====================================================================
   * 5. A SECOND SWEEP SENDS NOTHING. The UNIQUE and the schedule both hold.
   * ================================================================= */
  const before = messagesTo(abandoner).length
  const again = engine('sweep', '--hours-ahead', '3', '--sent', '2000', '--unsubscribed', '10', '--complained', '0')
  await new Promise(r => setTimeout(r, 1500))
  check(
    'a-repeated-sweep-writes-to-nobody-twice',
    (again.parsed?.sent ?? -1) === 0 && messagesTo(abandoner).length === before,
    `inbox ${before} -> ${messagesTo(abandoner).length}; the sweep sent ${again.parsed?.sent ?? '?'} and refused ` +
      `${JSON.stringify(again.parsed?.refusals ?? {})}`,
  )

  /* ====================================================================
   * 6. THE LINKS, OPENED IN A REAL BROWSER.
   * ================================================================= */
  const stopLink = messagesTo(abandoner)[0]?.links.find(l => l.includes('/unsubscribe/recovery/'))
  const resumeLink = messagesTo(abandoner)[0]?.links.find(l => l.includes(`/events/${picked.event.slug}`))

  if (resumeLink) {
    const ctx = await browser.newContext({ ...contextOptions, locale: 'en-AU' })
    const page = await ctx.newPage()
    const res = await page.goto(resumeLink.replace(/^https?:\/\/[^/]+/, BASE), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    check('the-resume-link-opens', res?.status() === 200, `HTTP ${res?.status()} at ${resumeLink}`)
    const m = await measure(page, '2-resume-link')
    check(`fit-2-resume-link@${viewport.width}`, m.ok, m.detail)
    await ctx.close()
  } else {
    check('the-resume-link-opens', false, 'no resume link was printed in the message')
  }

  if (stopLink) {
    const ctx = await browser.newContext({ ...contextOptions, locale: 'en-AU' })
    const page = await ctx.newPage()
    const res = await page.goto(stopLink.replace(/^https?:\/\/[^/]+/, BASE), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    const text = await page.textContent('body').catch(() => '')
    check(
      'one-click-stops-the-reminders',
      res?.status() === 200 && /reminders have stopped/i.test(text ?? ''),
      `HTTP ${res?.status()}; page says "${(text ?? '').trim().slice(0, 60)}"`,
    )
    const m = await measure(page, '3-unsubscribe')
    check(`fit-3-unsubscribe@${viewport.width}`, m.ok, m.detail)
    await ctx.close()
  } else {
    check('one-click-stops-the-reminders', false, 'no stop link was printed in the message')
  }

  const { data: suppression } = await db
    .from('recovery_suppressions')
    .select('contact_email, reason')
    .eq('contact_email', abandoner)
    .maybeSingle()
  check(
    'the-stop-is-recorded-platform-wide',
    Boolean(suppression),
    suppression ? `${suppression.contact_email} suppressed as ${suppression.reason}` : 'no suppression row',
  )

  /* ====================================================================
   * 6c. THE PERSON WHO LEFT AT THE CARD FORM COMES BACK AND BUYS.
   *
   *     Through the link in message one, the real event page, the real
   *     checkout, the painted card form and Stripe's test card. The judge of
   *     "bought" is the database after the webhook the forwarder delivers:
   *     the order confirmed, a ticket issued, the ticket email in the inbox,
   *     and the SALE row in the ledger, which is what the engine reads to
   *     refuse the next two messages.
   * ================================================================= */
  let returnerOrder = null
  if (returner) {
    const link = messagesTo(returner)[0]?.links.find(l => l.includes(`/events/${picked.event.slug}`))
    check('the-returner-has-a-link-to-come-back-by', Boolean(link), link ?? 'no resume link in message one')
    if (link) {
      const ctx = await browser.newContext({ ...contextOptions, locale: 'en-AU' })
      const page = await ctx.newPage()
      try {
        const res = await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
        check('the-returner-lands-on-the-slot', res?.status() === 200, `HTTP ${res?.status()}`)
        await page.waitForTimeout(2500)
        const plus = await clickText(page, /^\+$/)
        await page.waitForTimeout(1200)
        const onward = plus
          ? ((await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed|register)/i)))
          : null
        await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
        await page.waitForTimeout(3000)
        check(
          'the-returner-reaches-checkout-again',
          /\/checkout\//.test(page.url()),
          `"${onward ?? 'nothing to click'}" -> ${page.url().replace(BASE, '')}`,
        )
        await fillByLabel(page, /full name/i, 'Casey Nguyen')
        await fillByLabel(page, /^email/i, returner)
        await page.waitForTimeout(600)
        const reused = await clickText(page, /use my details for all tickets/i)
        if (!reused) {
          await fillByLabel(page, /first name/i, 'Casey')
          await fillByLabel(page, /last name/i, 'Nguyen')
          for (const e of await page.$$('input[type="email"]')) await e.fill(returner).catch(() => {})
        }
        await page.waitForTimeout(1200)
        await clickText(page, /^continue to payment/i)
        const painted = await stripeFrameOn(page)
        check(
          'the-card-form-painted-for-the-returner',
          painted,
          painted
            ? 'the Stripe payment frame is on the page'
            : `no Stripe frame: ${await whyNoFrame(page, process.env.SERVER_LOG ?? null)}`,
        )
        const m = await measure(page, '5-returner-payment-step', { totalRequired: true })
        check(`fit-5-returner-payment-step@${viewport.width}`, m.ok, m.detail)
        const pressed = painted ? await payWithTestCard(page) : null
        check('the-returner-pays-with-the-test-card', Boolean(pressed), pressed ?? 'no Pay button')
        await page.waitForURL(/\/orders\/[^/]+\/confirmation/, { timeout: 120_000 }).catch(() => {})
        const orderId = page.url().match(/\/orders\/([^/?]+)/)?.[1] ?? null
        check('stripe-sends-the-returner-to-the-confirmation', Boolean(orderId), page.url().replace(BASE, ''))
        if (orderId) {
          const confirmed = await waitForConfirmedOrder(db, orderId)
          returnerOrder = { id: orderId, ...confirmed }
          check(
            'the-webhook-confirmed-the-order-and-issued-the-ticket',
            confirmed.status === 'confirmed' && confirmed.tickets > 0,
            `order ${orderId}: status ${confirmed.status}, ${confirmed.tickets} ticket(s), total ${
              confirmed.totalCents !== null ? money(confirmed.totalCents) : 'unknown'
            }, confirmed_at ${confirmed.confirmedAt ?? 'null'}`,
          )
          await page.waitForTimeout(2500)
          const c = await measure(page, '6-returner-confirmation')
          check(`fit-6-returner-confirmation@${viewport.width}`, c.ok, c.detail)

          let ticketMail = []
          for (let i = 0; i < 20 && ticketMail.length === 0; i += 1) {
            ticketMail = messagesTo(returner).filter(msg =>
              msg.links.some(l => /\/t\/|\/orders\/|\/account\/tickets/.test(l)),
            )
            if (ticketMail.length === 0) await new Promise(r => setTimeout(r, 1000))
          }
          check(
            'the-returner-receives-their-ticket-email',
            ticketMail.length >= 1,
            ticketMail[0] ? `subject "${ticketMail[0].subject}"` : 'no ticket email in the inbox',
          )

          // The sale rows land behind after(); one per order item, keyed by it.
          const { data: items } = await db.from('order_items').select('id').eq('order_id', orderId)
          const keys = (items ?? []).map(i => `sale:${i.id}`)
          let saleRows = []
          for (let i = 0; i < 20 && saleRows.length === 0 && keys.length > 0; i += 1) {
            const { data: rows } = await db
              .from('ledger_entries')
              .select('id, amount_cents')
              .eq('slot_id', slot.id)
              .eq('kind', 'sale')
              .in('occurrence_key', keys)
            saleRows = rows ?? []
            if (saleRows.length === 0) await new Promise(r => setTimeout(r, 1000))
          }
          /*
           * WHAT THE SALE ROW CARRIES IS THE FACE VALUE, not the charge. The
           * buyer paid $26.87 for a $25.00 ticket under the pass-on fee model;
           * the organiser recovers $25.00 and that is what the ledger records
           * and what the panel must show. The first run of this leg compared
           * the panel with the charged total and called the panel wrong.
           */
          returnerOrder.saleCents = saleRows.reduce((n, r) => n + Number(r.amount_cents ?? 0), 0)
          check(
            'the-sale-is-in-the-ledger',
            saleRows.length > 0,
            `${saleRows.length} sale row(s) for order ${orderId} (${keys.length} item(s)), face value ${money(
              returnerOrder.saleCents,
            )} against a charge of ${confirmed.totalCents !== null ? money(confirmed.totalCents) : 'unknown'}`,
          )
        }
      } finally {
        await ctx.close()
      }
    }
  }

  /* ====================================================================
   * 7. AT HOUR 25, MESSAGE TWO GOES TO THE PERSON WHO DID NOT UNSUBSCRIBE
   *    AND NOT TO THE PERSON WHO DID. Both halves in one run, because a
   *    sweep that sends nothing and a sweep that correctly refuses
   *    everything look identical from the outside.
   * ================================================================= */
  const abandonerBefore = messagesTo(abandoner).length
  const stayerBefore = messagesTo(stayer).length
  const returnerBefore = returner ? messagesTo(returner).length : 0
  const atHour25 = engine('sweep', '--hours-ahead', '25', '--sent', '2000', '--unsubscribed', '10', '--complained', '0')
  say(`${TAG} at hour 25 the engine said: ${JSON.stringify(atHour25.parsed ?? atHour25.text.slice(0, 300))}`)
  await new Promise(r => setTimeout(r, 1500))

  check(
    'message-two-goes-to-the-person-who-did-not-unsubscribe',
    messagesTo(stayer).length === stayerBefore + 1,
    `inbox for the stayer ${stayerBefore} -> ${messagesTo(stayer).length}`,
  )
  check(
    'message-two-does-NOT-go-to-the-person-who-unsubscribed',
    messagesTo(abandoner).length === abandonerBefore,
    `inbox for the unsubscriber ${abandonerBefore} -> ${messagesTo(abandoner).length}`,
  )
  check(
    'and-the-sweep-says-which-refusal-it-was',
    JSON.stringify(atHour25.parsed?.refusals ?? {}).includes('unsubscribed'),
    JSON.stringify(atHour25.parsed?.refusals ?? {}),
  )
  if (returner) {
    check(
      'message-two-does-NOT-go-to-the-person-who-came-back-and-bought',
      returnerOrder?.status === 'confirmed' && messagesTo(returner).length === returnerBefore,
      `inbox for the returner ${returnerBefore} -> ${messagesTo(returner).length} (order ${returnerOrder?.status ?? 'none'})`,
    )
    check(
      'and-the-refusal-is-that-they-already-bought',
      (atHour25.parsed?.refusals?.['they already bought'] ?? 0) >= 1,
      JSON.stringify(atHour25.parsed?.refusals ?? {}),
    )
  }

  /* ====================================================================
   * 7b. AND AT HOUR 73, THE LAST MESSAGE, TO THE SAME ONE PERSON.
   * ================================================================= */
  const stayerBeforeThree = messagesTo(stayer).length
  const abandonerBeforeThree = messagesTo(abandoner).length
  const returnerBeforeThree = returner ? messagesTo(returner).length : 0
  const atHour73 = engine('sweep', '--hours-ahead', '73', '--sent', '2000', '--unsubscribed', '10', '--complained', '0')
  say(`${TAG} at hour 73 the engine said: ${JSON.stringify(atHour73.parsed ?? atHour73.text.slice(0, 300))}`)
  await new Promise(r => setTimeout(r, 1500))
  check(
    'message-three-goes-to-the-person-who-did-not-unsubscribe',
    messagesTo(stayer).length === stayerBeforeThree + 1,
    `inbox for the stayer ${stayerBeforeThree} -> ${messagesTo(stayer).length}`,
  )
  check(
    'message-three-does-NOT-go-to-the-person-who-unsubscribed',
    messagesTo(abandoner).length === abandonerBeforeThree,
    `inbox for the unsubscriber ${abandonerBeforeThree} -> ${messagesTo(abandoner).length}`,
  )
  if (returner) {
    check(
      'message-three-does-NOT-go-to-the-person-who-came-back-and-bought',
      messagesTo(returner).length === returnerBeforeThree &&
        (atHour73.parsed?.refusals?.['they already bought'] ?? 0) >= 1,
      `inbox for the returner ${returnerBeforeThree} -> ${messagesTo(returner).length}; refusals ${JSON.stringify(
        atHour73.parsed?.refusals ?? {},
      )}`,
    )
  }
  const stayerMessages = messagesTo(stayer)
  check(
    'the-sequence-is-three-messages-and-stops-there',
    stayerMessages.length === 3 && new Set(stayerMessages.map(m => m.subject)).size === 3,
    `${stayerMessages.length} message(s): ${stayerMessages.map(m => m.subject).join(' / ')}`,
  )
  const atHour200 = engine('sweep', '--hours-ahead', '200', '--sent', '2000', '--unsubscribed', '10', '--complained', '0')
  await new Promise(r => setTimeout(r, 1500))
  check(
    'a-fourth-message-does-not-exist',
    messagesTo(stayer).length === 3,
    `inbox for the stayer is ${messagesTo(stayer).length} after a sweep at hour 200; ` +
      `the sweep sent ${atHour200.parsed?.sent ?? '?'}`,
  )

  /* ====================================================================
   * 7c. AND THE REVERSAL CONDITION, PROVED IN THE OTHER DIRECTION.
   *
   *     Not with invented numbers: with the ones actually in the database,
   *     which this drive itself has made bad by unsubscribing on every run.
   *     That is a real bad rate, and a sweep under it must cut the sequence to
   *     one message and say so.
   * ================================================================= */
  const underTheRealRates = engine('sweep', '--hours-ahead', '73')
  const realRates = underTheRealRates.parsed?.rates ?? { sent: 0, unsubscribed: 0, complained: 0 }
  const badEnough = realRates.sent >= 50 && realRates.unsubscribed / Math.max(1, realRates.sent) > 0.02
  say(
    `${TAG} under the real numbers (${realRates.unsubscribed} unsubscribe(s) in ${realRates.sent} send(s)): ` +
      `${underTheRealRates.parsed?.sequenceReason}`,
  )
  check(
    'a-real-bad-unsubscribe-rate-cuts-the-sequence-and-says-so',
    !badEnough ||
      (underTheRealRates.parsed?.sequenceLength === 1 &&
        String(underTheRealRates.parsed?.sequenceReason ?? '').includes('cut to a single message')),
    badEnough
      ? `sequenceLength ${underTheRealRates.parsed?.sequenceLength}: ${underTheRealRates.parsed?.sequenceReason}`
      : `the real rate is ${realRates.unsubscribed}/${realRates.sent}, which is not yet a measurable problem, ` +
        `so there is nothing to cut and the engine says: ${underTheRealRates.parsed?.sequenceReason}`,
  )

  /* ====================================================================
   * 8. THE PROOF PANEL, OPENED BY THE REAL ORGANISER.
   * ================================================================= */
  const org = picked.org
  const { data: owner } = org?.owner_id
    ? await db.from('profiles').select('id, email').eq('id', org.owner_id).maybeSingle()
    : { data: null }

  if (owner?.email) {
    const PASSWORD = 'D2Recovery!2026Proof'
    const { error: pwError } = await db.auth.admin.updateUserById(org.owner_id, { password: PASSWORD })
    check('owner-can-be-signed-in', !pwError, pwError ? pwError.message : `password set on ${owner.email} (TEST only)`)

    const ctx = await browser.newContext({ ...contextOptions, locale: 'en-AU' })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.fill('input[type="email"]', owner.email)
      await page.fill('input[type="password"]', PASSWORD)
      await page.click('button[type="submit"]')
      await page.waitForTimeout(6000)

      const res = await page.goto(`${BASE}/dashboard/events/${picked.event.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      check('the-organiser-reaches-their-event', res?.status() === 200, `HTTP ${res?.status()}`)
      await page.waitForTimeout(2500)

      const panel = await page.$('[data-recovery-proof]')
      check('the-proof-panel-is-on-the-page', Boolean(panel), panel ? 'rendered' : 'not found')

      if (panel) {
        await panel.scrollIntoViewIfNeeded().catch(() => {})
        await page.waitForTimeout(600)
        /*
         * READ THE FIGURES BY THEIR LABELS, not by searching the panel's whole
         * text for a number. The first version of this check did the latter and
         * passed while the panel showed nothing of the sort: "5" appears in a
         * date, a price and a sentence, so a substring match agrees with almost
         * any panel. Each figure is a value paragraph followed by its label.
         */
        const onScreen = await page.evaluate(() => {
          const el = document.querySelector('[data-recovery-proof]')
          if (!el) return null
          const box = el.getBoundingClientRect()
          const total = el.querySelector('[data-recovery-total]')
          const figures = {}
          for (const wrap of el.querySelectorAll('div')) {
            const ps = wrap.querySelectorAll(':scope > p')
            if (ps.length !== 2) continue
            const label = (ps[1].textContent ?? '').trim().toLowerCase()
            if (label) figures[label] = (ps[0].textContent ?? '').trim()
          }
          return {
            right: Math.round(box.right),
            left: Math.round(box.left),
            total: total?.textContent?.trim() ?? null,
            figures,
            text: [...el.querySelectorAll('p')].map(p => p.textContent?.trim() ?? '').join(' | '),
          }
        })
        check(
          `the-panel-fits-the-viewport@${viewport.width}`,
          Boolean(onScreen) && onScreen.right <= viewport.width + 1 && onScreen.left >= -1,
          `left ${onScreen?.left} right ${onScreen?.right} against ${viewport.width}`,
        )

        // What the page shows, compared against the rows it read them from.
        const dbAbandoned = await db
          .from('ledger_entries')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', slot.id)
          .eq('demand_action', 'checkout_abandoned')
          .not('contact_email', 'is', null)
        const dbSends = await db
          .from('recovery_sends')
          .select('contact_email')
          .eq('slot_id', slot.id)
        const distinctPeople = new Set((dbSends.data ?? []).map(r => r.contact_email)).size
        say(
          `${TAG} the database says ${dbAbandoned.count ?? 0} abandonment(s), ${
            (dbSends.data ?? []).length
          } send(s) to ${distinctPeople} person/people`,
        )
        const shownAbandoned = onScreen?.figures?.['left a checkout part way'] ?? null
        const shownEmailed = onScreen?.figures?.['written to'] ?? null
        check(
          'the-panel-shows-the-numbers-the-database-holds',
          shownAbandoned === String(dbAbandoned.count ?? 0) && shownEmailed === String(distinctPeople),
          `panel says abandoned=${shownAbandoned} written-to=${shownEmailed}; ` +
            `the database says ${dbAbandoned.count ?? 0} and ${distinctPeople}`,
        )

        /*
         * THE PERSON WHO CAME BACK, COUNTED. The engine's own proof function is
         * asked for this slot (the same call the page makes), and the panel's
         * "came back and bought" figure and its recovered total must agree
         * with it. A recovery is a sale on the slot whose keyed buyer hash
         * matches an address the engine wrote to, after the first message.
         */
        if (returner) {
          const engineProof = engine('proof', '--slot', slot.id).parsed
          const shownReturned = onScreen?.figures?.['came back and bought'] ?? null
          const digits = s => String(s ?? '').replace(/[^0-9.]/g, '')
          /*
           * COMPARED IN CENTS, NEVER AS FORMATTED TEXT. The first run of this
           * leg failed on a panel and an engine that AGREED: the panel renders
           * the recovered total with no fraction digits ("$50") and this file's
           * own money() renders two ("$50.00"), so a string comparison of the
           * two was false while the numbers were identical. A check that can
           * fail on a formatter is not checking the product.
           */
          const shownCents = Math.round(Number(digits(onScreen?.total) || '0') * 100)
          say(`${TAG} the engine's own proof for this slot: ${JSON.stringify(engineProof)}`)
          check(
            'the-panel-counts-the-person-who-came-back-and-bought',
            Number(engineProof?.returned ?? 0) >= 1 &&
              shownReturned === String(engineProof?.returned) &&
              shownCents === Number(engineProof?.recoveredCents ?? 0) &&
              Number(engineProof?.recoveredCents ?? 0) >= Number(returnerOrder?.saleCents ?? 1),
            `panel says came-back=${shownReturned} total=${onScreen?.total} (${shownCents} cents); the engine says returned=${
              engineProof?.returned
            } recovered=${money(engineProof?.recoveredCents ?? 0)}; this run's sale carried a face value of ${
              returnerOrder?.saleCents !== undefined ? money(returnerOrder.saleCents) : 'unknown'
            } (charged ${
              returnerOrder?.totalCents !== null && returnerOrder?.totalCents !== undefined
                ? money(returnerOrder.totalCents)
                : 'unknown'
            })`,
          )
        }

        const m = await measure(page, '4-proof-panel')
        check(`fit-4-proof-panel@${viewport.width}`, m.ok, m.detail)
      }
    } finally {
      await ctx.close()
    }
  } else {
    check('the-proof-panel-is-on-the-page', false, 'the organisation has no readable owner on TEST')
  }
} catch (cause) {
  failures += 1
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
} finally {
  await browser.close()
}

const failed = checks.filter(c => !c.pass)
say('')
if (!STRIPE_LEG) {
  say(`${TAG} the payment step of an abandonment: NOT EXERCISED (no STRIPE_SECRET_KEY in the environment; run scripts/verify/d2-stripe-drive.mjs)`)
}
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed at ${viewportName}`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify(checks, null, 2), 'utf8')

if (failed.length > 0 || failures > 0) process.exit(1)
console.log(`${TAG} every check passed at ${viewportName}.`)
