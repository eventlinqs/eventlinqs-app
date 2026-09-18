/**
 * FO1 ACCEPTANCE 2, THE HALF THAT NEEDS A CARD.
 *
 * "A driven test purchase on TEST for a founding organiser's event, with every
 * row tagged lane-B, shows the buyer no platform fee at 390, 768 and 1440, and
 * the ledger row carries the waived amount."
 *
 * `fo1-founding-offer-drive.mjs` proves the two ASSERTIONS that line names: the
 * buyer is shown no platform fee at all three widths, and the order row carries
 * the waived amount. What it cannot do is finish the sentence's first clause. A
 * purchase that is refused is not a purchase, so this drive completes the card
 * payment and asserts the same two things about a CONFIRMED, PAID order.
 *
 * WHY THIS DRIVE EXISTS AT ALL, stated plainly because lane B got it wrong once.
 * REVIEW-QUEUE-B.md recorded "no card payment can be completed on this machine"
 * as a credential the founder had to mint, with a Law 10 verdict of IMPOSSIBLE.
 * That verdict is WITHDRAWN. `.env.local`'s secret key is empty and its
 * publishable key belongs to another account, both of which are true, but the
 * publishable key is not fixed: the server can be STARTED to match the key the
 * Stripe CLI already holds. `scripts/dev/lane-b-serve-with-stripe.mjs` does
 * exactly that, and this drive refuses to run against a server that was not.
 *
 * THE SHAPE, and the middle step is the point of it.
 *
 *   1. PREFLIGHT. The Stripe TEST pair names one account, answers Stripe, and is
 *      the pair the BROWSER received. A drive whose server holds one account's
 *      key while the buyer's iframe holds another fails inside Stripe with a
 *      message nothing on this side ever sees.
 *   2. THE CONTROL, at 1440. A lane-B organiser with STANDARD terms sells a
 *      ticket for a real card. This is the harness proving itself: without it,
 *      a failure at step 3 is indistinguishable from a checkout driver that
 *      cannot click. It is not part of acceptance 2 and is labelled so.
 *   3. THE GRANT. The owner signs in at the real /admin/login and presses Grant
 *      on the real /admin/network. Nothing writes a founding window by hand, so
 *      what checkout sees is what an owner granted.
 *   4. THE FOUNDING PURCHASE, at 390, 768 and 1440. Same organiser, same event,
 *      same card. The buyer must be shown no service fee, the total must equal
 *      the face value, the order must reach `confirmed` with tickets issued, and
 *      the row must carry the waived amount.
 *
 * EVERY ROW IT CREATES IS TAGGED lane-B and it creates its own; it grants no
 * terms to a shared fixture and edits nothing another lane owns.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/fo1-founding-purchase-drive.mjs --out C:/dev/EVIDENCE/FO1
 *
 * A run KEEPS its fixture, because the orders on it are the evidence. When the
 * item closes, remove every one this drive has ever made:
 *   node --env-file=.env.local scripts/verify/fo1-founding-purchase-drive.mjs --cleanup
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readStripeTestKeys, probeStripeTestKey } from './lib/stripe-cli-test-keys.mjs'
import { buildFixture, drivePurchase, clearEmptyFixtures, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner, pressFoundingTerm } from './lib/fo1-founding-admin.mjs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const LANE_B_SLUG_PREFIX = 'lane-b-fo1-founding'
const args = process.argv.slice(2)
let out = null
let cleanupOnly = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--cleanup') cleanupOnly = true
}
if (!out && !cleanupOnly) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
if (out) {
  out = join(out, 'purchase')
  mkdirSync(out, { recursive: true })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/*
 * `--cleanup` REMOVES THE FIXTURES INCLUDING THE ONES CARRYING ORDERS, which a
 * run never does, because those orders are the evidence. It exists because this
 * drive's own closing message promises it, and a script that names a flag it
 * does not have is the same defect as a runbook naming a command that cannot
 * run: the reader believes the tidying is available and it is not.
 *
 * Scoped to lane B's slug prefix, so it cannot reach another lane's rows or a
 * seeded organisation.
 */
if (cleanupOnly) {
  const result = await purgeFixtures(db, m => console.log(`  ${m}`), LANE_B_SLUG_PREFIX)
  console.log(`removed ${result.removed} lane-B FO1 fixture(s)`)
  if (result.errors.length) {
    for (const e of result.errors) console.error(`  FAILED ${e}`)
    process.exit(1)
  }
  process.exit(0)
}

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stamp = `lane-b-${Date.now().toString(36)}`

/* ------------------------------------------------------------------ preflight */

/**
 * The key the BROWSER got, not the key the server was handed.
 *
 * `loadStripe` is called with `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
 * which Next resolves when it compiles the client chunk. A mismatch between that
 * and the server's secret key is the difference between a card declined for a
 * reason and a card declined for none, and nothing on this side of the iframe
 * ever sees Stripe's own message about it.
 *
 * IT IS READ OFF THE PAYMENT STEP, not off the event page, and the first version
 * of this drive got that wrong. Only `checkout-form.tsx` calls `loadStripe`, so
 * an event page serves no chunk carrying the key and the probe reported "the
 * server was not started correctly" about a server that was started correctly.
 * Stripe puts the key in the URL of every frame it mounts, so the frames ARE the
 * evidence, and they only exist once the buyer has reached the payment step.
 */
function publishableAccountsInFrames(page) {
  const seen = new Set()
  for (const f of page.frames()) {
    for (const m of (f.url() ?? '').matchAll(/pk_test_[A-Za-z0-9]{20,}/g)) seen.add(`acct_${m[0].slice(9, 25)}`)
  }
  return [...seen]
}

/**
 * What the screen says when a purchase does not complete.
 *
 * A Playwright timeout waiting for Stripe's card field is a HARNESS sentence,
 * and on its own it cannot tell "the element was slow" from "no payment intent
 * was ever created, so there is no element to wait for". The second is a product
 * refusal and it has words on screen; reading them turns the report from an
 * accusation into a quotation.
 */
async function refusalOnScreen(page) {
  const said = await page.evaluate(() => {
    const out = new Set()
    for (const el of document.querySelectorAll('[role="alert"], [data-error], .text-error, [class*="destructive"], p, div')) {
      const t = (el.textContent ?? '').trim()
      if (!t || t.length > 220) continue
      if (/pricing issue|payment system|could not|unable|try again|problem|error|failed/i.test(t)) out.add(t.replace(/\s+/g, ' '))
    }
    return [...out].slice(0, 4)
  }).catch(() => [])
  return { url: page.url(), said }
}

/** The money the buyer reads on the checkout summary, in cents. */
async function checkoutMoney(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')]
      .filter(d => d.children.length === 2 && /^(Subtotal|Service fee|Tax \(GST\)|Discount|Total)$/.test(d.children[0]?.textContent?.trim() ?? ''))
      .map(d => [d.children[0].textContent.trim(), d.children[1].textContent.trim()])
    const total = document.querySelector('[data-order-total]')?.textContent?.trim() ?? null
    return { rows, total }
  })
}

function centsFrom(text) {
  if (!text) return null
  if (/^free$/i.test(text.trim())) return 0
  const digits = text.replace(/[^0-9.]/g, '')
  return digits ? Math.round(Number(digits) * 100) : null
}

const ORDER_COLUMNS =
  'id, order_number, status, guest_email, subtotal_cents, platform_fee_cents, processing_fee_cents, founding_fee_waived_cents, total_cents, currency, created_at'

/**
 * The order row for a buyer who never reached a confirmation page.
 *
 * Checkout PRICES the cart, INSERTS the order, and only then asks for a payment
 * intent, so a purchase refused at the charge still leaves the row that carries
 * the waived amount. Acceptance 2 asks two things of the ledger and one of the
 * purchase; without this lookup a refusal would take the answerable half of the
 * question down with the unanswerable one and report nothing about either.
 */
async function orderForBuyer(eventId, buyerEmail) {
  const { data } = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('event_id', eventId)
    .eq('guest_email', buyerEmail)
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

/**
 * Only the webhook moves an order out of `pending`, so this is also the proof
 * that the signing secret the server holds is the one the listener is signing
 * with. Polls rather than sleeping a fixed time, because a fixed wait either
 * wastes a minute or fails on a slow one.
 */
async function waitForConfirmation(orderId, ms = 150000) {
  const until = Date.now() + ms
  let order = null
  while (Date.now() < until) {
    const { data } = await db.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle()
    order = data
    if (order?.status === 'confirmed') break
    await sleep(3000)
  }
  const { data: tickets } = await db.from('tickets').select('ticket_code, status').eq('order_id', orderId)
  return { order, tickets: tickets ?? [] }
}

/* --------------------------------------------------------------------- the run */

let browser = null
let fixture = null
let admin = null

try {
  const keys = readStripeTestKeys({ profile: process.env.STRIPE_CLI_PROFILE ?? 'default' })
  check('fo1.pay.stripe-pair-is-one-test-account', keys.ok, keys.ok ? `CLI profile "${keys.profile}" holds a TEST pair for ${keys.accountId}` : keys.reason)
  if (!keys.ok) throw new Error(keys.reason)
  const probe = await probeStripeTestKey(keys.secretKey)
  check('fo1.pay.stripe-key-is-live-at-stripe', probe.ok, probe.detail)
  if (!probe.ok) throw new Error(probe.detail)

  admin = await createProofAdmin(db)
  // An iteration that failed before buying anything leaves an organisation and
  // an auth user behind on a TEST project three lanes share. Scoped to lane B's
  // own slug, so it can only ever reach fixtures this drive made.
  await clearEmptyFixtures(db, m => console.log(`  cleanup: ${m}`), LANE_B_SLUG_PREFIX)
  fixture = await buildFixture(db, {
    stamp,
    ownerEmail: `lane-b-fo1-owner-${stamp}@eventlinqs.test`,
    password: `${stamp}-Aa1!`,
    capacity: 12,
    priceCents: 2500,
    log: m => console.log(`  fixture: ${m}`),
    brand: {
      org: 'Lane B FO1 Founding',
      orgSlug: LANE_B_SLUG_PREFIX,
      event: 'Lane B FO1 Founding Night',
      eventSlug: 'lane-b-fo1-founding-night',
      owner: 'Lane B FO1 Owner',
    },
  })
  console.log(`organisation ${fixture.org.name}`)
  console.log(`event        ${fixture.event.slug}`)

  browser = await chromium.launch({ headless: true })

  /* ---- the control, at 1440: the harness proving itself before it accuses ---- */

  const controlCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const controlPage = await controlCtx.newPage()
  let controlOrderId = null
  let accountsInBrowser = []
  try {
    controlOrderId = await drivePurchase(controlPage, {
      base: BASE,
      slug: fixture.event.slug,
      qty: 1,
      buyerEmail: `lane-b-fo1-control-${stamp}@mailinator.com`,
      shot: async (p, name) => {
        if (name === '04-card-entered') accountsInBrowser = publishableAccountsInFrames(p)
        await p.screenshot({ path: join(out, `control-1440-${name}.png`), fullPage: false })
      },
    })
  } catch (err) {
    check('fo1.pay.control-standard-purchase-completes', false, `the standard-terms purchase failed: ${err.message}`)
  }
  check(
    'fo1.pay.browser-got-this-accounts-publishable-key',
    accountsInBrowser.length > 0 && accountsInBrowser.every(a => a === keys.accountId),
    accountsInBrowser.length
      ? `Stripe's own frames carry ${accountsInBrowser.join(', ')} and the server holds ${keys.accountId}`
      : 'no pk_test_ key appeared in any Stripe frame; the server was not started by lane-b-serve-with-stripe.mjs',
  )
  if (controlOrderId) {
    const { order, tickets } = await waitForConfirmation(controlOrderId)
    check(
      'fo1.pay.control-standard-purchase-completes',
      order?.status === 'confirmed' && tickets.length > 0,
      `standard terms: order ${order?.order_number} is ${order?.status} with ${tickets.length} ticket(s), fee ${order?.platform_fee_cents}c of ${order?.total_cents}c`,
    )
    check(
      'fo1.pay.control-standard-order-is-charged-a-fee',
      (order?.platform_fee_cents ?? 0) > 0 && (order?.founding_fee_waived_cents ?? 0) === 0,
      `standard terms charge ${order?.platform_fee_cents}c and waive ${order?.founding_fee_waived_cents}c`,
    )
  }
  await controlCtx.close()

  /* ------------------------------------- the grant, through the owner's screen */

  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const ownerPage = await ownerCtx.newPage()
  check('fo1.pay.owner-signed-in', await signInAsOwner(ownerPage, BASE, admin), 'the owner reached the admin console through /admin/login')
  const grant = await pressFoundingTerm(ownerPage, BASE, fixture.org.name, 'Grant', join(out, 'grant.png'))
  check('fo1.pay.grant', grant.ok && /Fee free until \d/.test(grant.message), grant.message)
  await ownerCtx.close()

  const { data: grantedOrg } = await db
    .from('organisations')
    .select('is_founding, founding_fee_free_until')
    .eq('id', fixture.org.id)
    .maybeSingle()
  check(
    'fo1.pay.the-window-is-open',
    grantedOrg?.is_founding === true && !!grantedOrg?.founding_fee_free_until,
    `is_founding ${grantedOrg?.is_founding}, fee free until ${grantedOrg?.founding_fee_free_until}`,
  )

  /* -------------------- acceptance 2: the founding purchase, at all three widths */

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ ...vp, viewport: vp.viewport })
    const page = await ctx.newPage()
    const prefix = join(out, `founding-${vp.label}`)
    const buyerEmail = `lane-b-fo1-buyer-${vp.label}-${stamp}@mailinator.com`
    let money = null
    let orderId = null
    try {
      orderId = await drivePurchase(page, {
        base: BASE,
        slug: fixture.event.slug,
        qty: 1,
        buyerEmail,
        shot: async (p, name) => {
          // The checkout summary is on screen at 03; read it while it is there
          // rather than re-navigating to a page the purchase has moved on from.
          if (name === '03-checkout-details') money = await checkoutMoney(p)
          await p.screenshot({ path: `${prefix}-${name}.png`, fullPage: false })
        },
      })
    } catch (err) {
      const refusal = await refusalOnScreen(page)
      await page.screenshot({ path: `${prefix}-06-refused.png`, fullPage: false }).catch(() => {})
      check(
        `fo1.pay.${vp.label}.founding-purchase-completes`,
        false,
        `the founding purchase did not complete at ${refusal.url.replace(BASE, '')}. On screen: ${refusal.said.join(' // ') || 'nothing named'}. Harness: ${err.message.replace(/\s+/g, ' ').slice(0, 160)}`,
      )
    }

    const feeLine = money?.rows?.find(r => r[0] === 'Service fee') ?? null
    check(
      `fo1.pay.${vp.label}.buyer-is-shown-no-platform-fee`,
      money !== null && (feeLine === null || centsFrom(feeLine[1]) === 0),
      money === null
        ? 'the checkout summary was never read'
        : feeLine === null
          ? `no service fee line is rendered; the summary shows ${money.rows.map(r => r.join(' ')).join(' | ')}`
          : `the service fee line reads ${feeLine[1]}`,
    )
    const subtotal = centsFrom(money?.rows?.find(r => r[0] === 'Subtotal')?.[1] ?? null)
    const total = centsFrom(money?.total ?? null)
    check(
      `fo1.pay.${vp.label}.total-equals-face-value`,
      subtotal !== null && total !== null && subtotal === total,
      `subtotal ${subtotal}c vs total ${total}c`,
    )

    let order = null
    if (orderId) {
      const settled = await waitForConfirmation(orderId)
      order = settled.order
      check(
        `fo1.pay.${vp.label}.founding-purchase-completes`,
        order?.status === 'confirmed' && settled.tickets.length > 0,
        `order ${order?.order_number} is ${order?.status} with ${settled.tickets.length} ticket(s)`,
      )
    } else {
      order = await orderForBuyer(fixture.event.id, buyerEmail)
    }
    check(
      `fo1.pay.${vp.label}.ledger-carries-the-waived-amount`,
      order != null && order.platform_fee_cents === 0 && order.founding_fee_waived_cents > 0 && order.subtotal_cents === order.total_cents,
      order == null
        ? 'no order row was written at all'
        : `order ${order.order_number} (${order.status}): platform fee charged ${order.platform_fee_cents}, waived ${order.founding_fee_waived_cents}, subtotal ${order.subtotal_cents}, total ${order.total_cents}`,
    )
    await ctx.close()
  }
} catch (err) {
  check('fo1.pay.drive-ran-to-the-end', false, String(err?.message ?? err))
} finally {
  if (browser) await browser.close().catch(() => {})
  // Reservations this drive took and did not convert would sit as
  // `reserved_count` for ever: the sweep is a production cron and TEST has none.
  // `.rpc()` returns a builder that is thenable but has no `.catch`, so it is
  // awaited inside a try rather than chained; the first version threw here and
  // lost the whole report to a cleanup step.
  try {
    await db.rpc('expire_stale_reservations')
  } catch (error) {
    console.warn(`[fo1-purchase] could not release this run's reservations: ${error.message}. They will hold stock on TEST until something sweeps them.`)
  }

  const report = { base: BASE, when: new Date().toISOString(), stamp, fixture: fixture ? { organisation: fixture.org.name, event: fixture.event.slug } : null, checks }
  writeFileSync(join(out, 'fo1-purchase-report.json'), JSON.stringify(report, null, 2))
  await removeProofAdmin(db, admin)
  if (fixture) {
    console.log(`fixture ${fixture.org.name} KEPT: it carries the orders that are the evidence.`)
    console.log('Remove every lane-B FO1 fixture when the item closes with:  --cleanup')
  }

  console.log(`\n${checks.filter(c => c.ok).length}/${checks.length} checks passed`)
  if (failures.length) {
    console.log('\nFAILURES')
    for (const f of failures) console.log(`  ${f}`)
  }
  console.log(`report ${join(out, 'fo1-purchase-report.json')}`)
  process.exitCode = failures.length ? 2 : 0
}
