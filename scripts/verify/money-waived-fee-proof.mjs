/**
 * MONEY FIX A1.7, ONE WIDTH. A fee-waived organiser can sell a paid ticket.
 *
 * THE DEFECT THIS PROVES FIXED. `assertOrganiserCanReceiveFunds` refused any
 * zero platform fee as "calculator drift". A founding organiser inside their
 * fee-free window resolves to exactly zero, so every paid ticket for a
 * fee-waived organiser was refused at checkout with "There was a pricing issue
 * with this checkout. Please refresh and try again." Refreshing could never
 * help, because the fee would be zero again. The organisers the growth plan's
 * first ranked lever exists to recruit were the only ones on the platform who
 * could not sell a ticket.
 *
 * THE JUDGE IS NEVER THE PAGE. A page that says "thank you" proves the browser
 * reached a route. What proves the money moved is the ORDER ROW the Stripe
 * webhook confirmed, read back out of the TEST database, with the platform fee
 * it recorded. Both are asserted here, and the run fails if the page looks
 * right and the row disagrees.
 *
 * TEST ONLY. Driven by money-waived-fee-drive.mjs, which owns the server, the
 * Stripe key pair and `stripe listen`. Run it, not this.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { buildFixture, drivePurchase } from './lib/refund-proof-fixture.mjs'

const TAG = '[a17-proof]'
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const OUT = (flag('out') ?? 'C:/dev/EVIDENCE/MONEY/a17').replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE
const VIEWPORT = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const SIZES = {
  'mobile-390': { width: 390, height: 844, isMobile: true },
  'tablet-768': { width: 768, height: 1024, isMobile: false },
  'desktop-1440': { width: 1440, height: 900, isMobile: false },
}
const size = SIZES[VIEWPORT]
if (!size) {
  console.error(`${TAG} unknown viewport ${VIEWPORT}`)
  process.exit(1)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!URL?.includes('vkapkibzokmfaxqogypq')) {
  console.error(`${TAG} REFUSING: ${URL} is not the TEST project.`)
  process.exit(1)
}
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const checks = []
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail })
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`)
}

const stamp = `a17${Date.now().toString(36)}`
const ownerEmail = `lane-a-a17-${stamp}@example.com`
const buyerEmail = `lane-a-a17-buyer-${stamp}@example.com`
const PRICE_CENTS = 5_000

let browser = null
try {
  /* 1. The fixture: a real organiser with a real Stripe posture, then the
   *    founding waiver written on to it. */
  const fixture = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: `A17-${stamp}-pw`,
    capacity: 10,
    priceCents: PRICE_CENTS,
    log: (line) => console.log(`${TAG} fixture: ${line}`),
  })

  const feeFreeUntil = new Date(Date.now() + 180 * 864e5).toISOString()
  const { error: waiverErr } = await db
    .from('organisations')
    .update({ founding_fee_free_until: feeFreeUntil })
    .eq('id', fixture.org.id)
  if (waiverErr) throw new Error(`could not write the waiver: ${waiverErr.message}`)

  const { data: orgAfter } = await db
    .from('organisations')
    .select('founding_fee_free_until')
    .eq('id', fixture.org.id)
    .maybeSingle()
  /*
   * The window is read back from the row rather than assumed from the write.
   *
   * NOT through the product's own isWaiverActive, deliberately: that module
   * imports the Sentry wrapper, which only resolves under Next, and a proof that
   * cannot start is worth nothing. It costs nothing here, because the predicate
   * is not what this proof turns on. Whether the waiver was ACTIVE is settled
   * further down by the money: an inactive waiver charges 3.5% + 99c, so a
   * recorded platform fee of exactly zero could not have happened without it.
   */
  const windowOpen =
    Boolean(orgAfter?.founding_fee_free_until) &&
    new Date(orgAfter.founding_fee_free_until).getTime() > Date.now()
  check(
    'the organiser is inside a founding fee-free window',
    windowOpen,
    `founding_fee_free_until=${orgAfter?.founding_fee_free_until}`,
  )

  /* 2. The purchase, pressed the way a person presses it, at this width. */
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.isMobile,
    hasTouch: size.isMobile,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  const pricingErrors = []
  page.on('console', (m) => {
    if (/pricing issue with this checkout/i.test(m.text())) pricingErrors.push(m.text())
  })

  const shot = async (p, name) => {
    await p.screenshot({ path: join(OUT, `${VIEWPORT}-${name}.png`), fullPage: false })
  }

  const purchasedOrderId = await drivePurchase(page, {
    base: BASE,
    slug: fixture.event.slug,
    qty: 1,
    buyerEmail,
    shot,
  })

  /* 3. THE REFUSAL MUST NOT HAVE HAPPENED, anywhere the buyer could see it. */
  const bodyText = await page.locator('body').innerText()
  check(
    'the buyer was never shown the pricing refusal',
    !/pricing issue with this checkout/i.test(bodyText) && pricingErrors.length === 0,
    pricingErrors.length > 0 ? pricingErrors[0] : 'no pricing refusal on the page or in the console',
  )

  /* 4. THE ROW, which is the only thing that proves the charge happened. */
  /*
   * The order is fetched BY THE ID THE CONFIRMATION URL CARRIED, not by "the
   * newest row for this organisation". The fixture is fresh so the two would
   * agree today, but "newest row" is the kind of lookup that silently starts
   * reading somebody else's order the day this runs beside anything concurrent.
   */
  check(
    'the checkout reached a confirmation carrying an order id',
    Boolean(purchasedOrderId),
    purchasedOrderId ?? 'the confirmation URL carried no order id',
  )
  const { data: order } = purchasedOrderId
    ? await db
        .from('orders')
        .select('id,order_number,status,subtotal_cents,platform_fee_cents,processing_fee_cents,total_cents,organisation_id')
        .eq('id', purchasedOrderId)
        .maybeSingle()
    : { data: null }

  check('an order exists for the waived organiser', Boolean(order), order ? order.order_number : 'no order row')
  check(
    'the order belongs to the waived organiser and nobody else',
    order?.organisation_id === fixture.org.id,
    `organisation_id=${order?.organisation_id ?? 'none'}`,
  )
  check(
    'the order reached a confirmed state, so the Stripe webhook was processed',
    order?.status === 'confirmed' || order?.status === 'completed',
    `status=${order?.status ?? 'none'}`,
  )
  check(
    'the platform retained NOTHING on a waived sale',
    order?.platform_fee_cents === 0 && order?.processing_fee_cents === 0,
    `platform_fee_cents=${order?.platform_fee_cents} processing_fee_cents=${order?.processing_fee_cents}`,
  )
  check(
    'the buyer paid exactly the face value, so "completely fee-free" is literally true',
    order?.total_cents === PRICE_CENTS && order?.subtotal_cents === PRICE_CENTS,
    `total_cents=${order?.total_cents} against a face value of ${PRICE_CENTS}`,
  )

  /* 5. The tickets exist, because a sale that issues nothing is not a sale. */
  const { count: ticketCount } = await db
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', fixture.event.id)
  check('the sale issued a ticket', (ticketCount ?? 0) >= 1, `${ticketCount ?? 0} ticket(s)`)

  await shot(page, '99-after')
} catch (cause) {
  check('the drive completed without throwing', false, cause instanceof Error ? cause.message : String(cause))
} finally {
  if (browser) await browser.close()
}

const failed = checks.filter((c) => !c.pass)
const summary =
  `${TAG} ${VIEWPORT}: ${checks.length - failed.length} of ${checks.length} checks passed, ${failed.length} failed\n` +
  checks.map((c) => `  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` :: ${c.detail}` : ''}`).join('\n')
writeFileSync(join(OUT, `${VIEWPORT}-checks.txt`), `${summary}\n`, 'utf8')
console.log(summary)
process.exit(failed.length > 0 ? 1 : 0)
