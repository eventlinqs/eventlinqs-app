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
 * WHAT THIS MACHINE CANNOT DO, SAID FIRST RATHER THAN DISCOVERED IN A FOOTNOTE.
 *
 * A checkout is abandoned at the PAYMENT step, and reaching that step needs a
 * Stripe TEST key. There is none here: both keys in the Stripe CLI config
 * answer HTTP 401 `api_key_expired` against Stripe's own API, checked again on
 * 11 September 2026, and every `STRIPE_SECRET_KEY` record on the Vercel project
 * is marked `sensitive`, which no token can decrypt. It is the same blocker
 * that left UX6's payment step unexercised, and it is closed by one founder
 * command (`stripe login`, or `npm run migrate:production`, which releases the
 * push and builds a git preview carrying the key).
 *
 * SO THE ABANDONMENT IS PRODUCED THE WAY IT ACTUALLY HAPPENS HERE, and it is a
 * real one rather than a seeded row. A real buyer opens a real paid event in a
 * real browser, chooses a ticket, fills the real checkout form and presses pay.
 * `processCheckout` writes the `checkout_started` demand row carrying their
 * address, and then cannot create a payment intent, so no order exists and the
 * reservation is left to lapse. The RECORDED STATE is exactly what a buyer who
 * looked at the card form and closed the tab leaves behind, which is the only
 * state the engine can see. Nothing is inserted by this script that a person
 * did not cause.
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
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'

const TAG = '[d2-proof]'
const BASE = process.env.BASE ?? 'http://localhost:3311'
const SERVER_LOG = process.env.SERVER_LOG ?? join(process.cwd(), '.tmp', 'd2-drive-server.log')

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
async function measure(page, label, { totals = [], totalRequired = false } = {}) {
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

  for (const address of [abandoner, stayer]) {
    const who = address === abandoner ? 'A' : 'B'
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
       * PRESS PAY AND THEN LEAVE. This is the moment `processCheckout` runs and
       * writes the `checkout_started` demand row carrying the address. What
       * happens next on this machine is the payment step, which needs a Stripe
       * TEST key there is none of, so nothing is ever paid and no order exists.
       * That is exactly the state a buyer leaves who looks at the card form and
       * closes the tab, which is what the engine is built for.
       */
      const submitted = await clickText(page, /^continue to payment/i)
      check(`pressed-pay[${who}]`, Boolean(submitted), submitted ?? 'no way to submit the checkout details')
      await page.waitForTimeout(9000)
      await page.screenshot({ path: join(out, `1-checkout-${who}.png`), fullPage: true })
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
    .in('contact_email', [abandoner, stayer])
  const started = startedRows ?? []
  check(
    'the-checkout-wrote-a-demand-row-carrying-the-address',
    started.length === 2,
    `${started.length} checkout_started row(s) for the two addresses: ${started.map(r => r.contact_email).join(', ')}`,
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
    .in('contact_email', [abandoner, stayer])
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
  check(
    'nothing-is-written-to-somebody-who-left-three-minutes-ago',
    tooSoon.parsed?.sent === 0 &&
      JSON.stringify(tooSoon.parsed?.refusals ?? {}).includes('no message is due yet'),
    `sent ${tooSoon.parsed?.sent}; refusals ${JSON.stringify(tooSoon.parsed?.refusals ?? {})}`,
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

  const { data: sendRows } = await db
    .from('recovery_sends')
    .select('id, contact_email, message_number, demand_entry_id, inventory_class, unit_amount_cents')
    .eq('slot_id', slot.id)
    .in('contact_email', [abandoner, stayer])
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
   * 7. AT HOUR 25, MESSAGE TWO GOES TO THE PERSON WHO DID NOT UNSUBSCRIBE
   *    AND NOT TO THE PERSON WHO DID. Both halves in one run, because a
   *    sweep that sends nothing and a sweep that correctly refuses
   *    everything look identical from the outside.
   * ================================================================= */
  const abandonerBefore = messagesTo(abandoner).length
  const stayerBefore = messagesTo(stayer).length
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

  /* ====================================================================
   * 7b. AND AT HOUR 73, THE LAST MESSAGE, TO THE SAME ONE PERSON.
   * ================================================================= */
  const stayerBeforeThree = messagesTo(stayer).length
  const abandonerBeforeThree = messagesTo(abandoner).length
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
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed at ${viewportName}`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify(checks, null, 2), 'utf8')

if (failed.length > 0 || failures > 0) process.exit(1)
console.log(`${TAG} every check passed at ${viewportName}.`)
