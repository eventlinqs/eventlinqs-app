/**
 * LB-EDITREVENUE, DRIVEN: ONE EVENT, TWO ORGANISER SCREENS, AND THE NUMBERS
 * THEY SHOW HAVE TO BE THE SAME NUMBERS.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE FIXTURE IS THE PROOF. Five orders on one event, chosen so
 * that every way the edit screen was wrong moves a figure the drive can read
 * off the page:
 *
 *   confirmed           5,000c   counted by both screens, before and after
 *   partially_refunded  2,687c   DROPPED ENTIRELY by `.eq('status','confirmed')`
 *   refunded              900c   DROPPED ENTIRELY, and its refund with it
 *   pending             9,999c   must never count, on either screen
 *   cancelled           4,444c   must never count, on either screen
 *
 * with refunds of 687c completed, 900c completed and 2,000c PENDING. The
 * pending one is there because a refund that has only been requested is not
 * money that has gone back, and counting it would understate what the organiser
 * is owed: the same class of error in the other direction.
 *
 * So the truth is gross 8,587c, refunded 1,587c, net 7,000c. The OLD edit
 * screen answered gross 5,000c with no refund line at all, because it asked for
 * one status and netted nothing. The assertion below is that the two screens
 * agree AND that they agree on the right number, which is a thing the old code
 * could not do for this fixture.
 *
 * IT ALSO PROVES THE CEILING IS REAL, against the live TEST database rather
 * than against a fake. `readEventRevenue` is called with a page size of two
 * over three paid orders: a single unbounded-equivalent request returns two
 * rows with HTTP 200 and no error, which is the silence the whole defect family
 * lives in, and the pager returns three.
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off one disposable
 * organisation under `lane-b-editrevenue-presents-`, deleted by id and then
 * RE-READ to prove it went.
 *
 * Run (dev server on 3100 against TEST):
 *   node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *        scripts/verify/lb-editrevenue-drive.mjs --out C:/dev/EVIDENCE/LB-EDITREVENUE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { readEventRevenue } from '@/lib/organisers/event-revenue'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-EDITREVENUE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-editrevenue-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

/** The five orders, and what each one exists to catch. */
const ORDERS = [
  { status: 'confirmed', total: 5000, fee: 250 },
  { status: 'partially_refunded', total: 2687, fee: 134 },
  { status: 'refunded', total: 900, fee: 45 },
  { status: 'pending', total: 9999, fee: 999 },
  { status: 'cancelled', total: 4444, fee: 444 },
]
const EXPECTED_GROSS = 5000 + 2687 + 900
const EXPECTED_REFUNDED = 687 + 900
const EXPECTED_FEE = 250 + 134 + 45
/*
 * THE CARD'S NET IS THE ORGANISER'S, NOT THE PLATFORM'S GMV NET. RevenueSummary
 * renders gross - fee - refunds, which is what the organiser is left with; the
 * `netGmvCents` the aggregator returns is gross - refunds and is the platform's
 * measure. The first run of this drive asserted the second against the first
 * and failed on a correct screen, which is worth the four lines: the two
 * quantities are different by exactly the fee and only one of them is on screen.
 */
const EXPECTED_NET = EXPECTED_GROSS - EXPECTED_FEE - EXPECTED_REFUNDED
/** What the shared reader returns, which is the GMV net: gross - refunds. */
const EXPECTED_GMV_NET = EXPECTED_GROSS - EXPECTED_REFUNDED

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** "AUD 85.87" -> 8587. The card renders through Intl, so the separators vary. */
function centsFromCard(text) {
  const m = text.match(/-?[\d,]+\.\d{2}/)
  if (!m) return null
  return Math.round(Number.parseFloat(m[0].replace(/,/g, '')) * 100)
}

/**
 * The Revenue Summary card, read the way an organiser reads it: by the label
 * beside each figure, never by position.
 */
async function readRevenueCard(page) {
  const card = page.locator('div', { has: page.getByRole('heading', { name: /revenue summary/i }) }).last()
  if ((await card.count()) === 0) return null
  const rows = {}
  for (const [key, label] of [
    ['gross', /gross sales/i],
    ['fee', /platform fee/i],
    ['refunds', /^refunds$/i],
    ['net', /net revenue/i],
  ]) {
    const row = card.locator('div.flex', { has: card.locator('span', { hasText: label }) })
    const line = card.getByText(label).first()
    if ((await line.count()) === 0) {
      rows[key] = null
      continue
    }
    void row
    const value = await line.locator('xpath=following-sibling::span[1]').first().textContent()
    rows[key] = value ? centsFromCard(value) : null
  }
  return rows
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-editrevenue fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-editrevenue+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`

  const { ownerId, org, event } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 20,
    priceCents: 5000,
    log,
    brand: {
      org: 'Lane B Editrevenue Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Editrevenue Night',
      eventSlug: 'lane-b-editrevenue-night',
      owner: 'Lane B Editrevenue Owner',
    },
  })
  log(`organisation ${org.id}, event ${event.id}, organiser ${ownerId}`)

  let exitCode = 0
  try {
    // ------------------------------------------------------------- the orders
    const orderIds = {}
    for (const [i, o] of ORDERS.entries()) {
      const { data, error } = await db
        .from('orders')
        .insert({
          organisation_id: org.id,
          event_id: event.id,
          order_number: `LBER-${stamp}-${i}`,
          guest_email: `lane-b-editrevenue+${stamp}-${i}@eventlinqs.test`,
          status: o.status,
          total_cents: o.total,
          platform_fee_cents: o.fee,
          processing_fee_cents: 0,
          currency: 'AUD',
        })
        .select('id')
        .single()
      if (error) throw new Error(`writing the ${o.status} order: ${error.message}`)
      orderIds[o.status] = data.id
    }
    log(`wrote ${ORDERS.length} orders, one in each status the table allows`)

    for (const r of [
      { order: 'partially_refunded', amount_cents: 687, status: 'completed' },
      { order: 'refunded', amount_cents: 900, status: 'completed' },
      { order: 'confirmed', amount_cents: 2000, status: 'pending' },
    ]) {
      /*
       * reason, status and initiator are ENUMS, and their values were read out
       * of pg_enum rather than guessed: `refund_reason` has no free-text
       * member, so a fixture label was refused outright.
       */
      const { error } = await db.from('refunds').insert({
        order_id: orderIds[r.order],
        organisation_id: org.id,
        amount_cents: r.amount_cents,
        currency: 'AUD',
        status: r.status,
        reason: 'other',
        initiator: 'organiser',
        organiser_internal_notes: 'lane-b-editrevenue fixture',
      })
      if (error) throw new Error(`writing the ${r.status} refund: ${error.message}`)
    }
    log('wrote 3 refunds: two completed, one still pending')

    // --------------------------------------------- the ceiling, against TEST
    //
    // A single request for a window of two returns two rows with no error, on
    // an event that has three paid orders. That is the silence the defect lived
    // in, measured here rather than asserted.
    const { data: truncated, error: truncatedError } = await db
      .from('orders')
      .select('id')
      .eq('event_id', event.id)
      .in('status', ['confirmed', 'partially_refunded', 'refunded'])
      .order('id', { ascending: true })
      .range(0, 1)
    check(
      'lb-editrevenue.ceiling.a-truncated-read-reports-no-error',
      truncated?.length === 2 && !truncatedError,
      `${truncated?.length ?? 0} of 3 paid orders came back, error=${truncatedError?.message ?? 'null'}`,
    )

    const pagedSmall = await readEventRevenue(db, event.id, { pageSize: 2 })
    check(
      'lb-editrevenue.ceiling.the-pager-reads-past-it',
      pagedSmall.paidOrders === 3 && pagedSmall.grossCents === EXPECTED_GROSS,
      `${pagedSmall.paidOrders} paid orders and ${pagedSmall.grossCents}c gross through a page size of 2`,
    )

    const paged = await readEventRevenue(db, event.id)
    check(
      'lb-editrevenue.reader.agrees-with-the-fixture',
      paged.grossCents === EXPECTED_GROSS &&
        paged.refundedCents === EXPECTED_REFUNDED &&
        paged.netCents === EXPECTED_GMV_NET,
      `gross ${paged.grossCents}c, refunded ${paged.refundedCents}c, net ${paged.netCents}c`,
    )

    // ------------------------------------------------------------ the driving
    const browser = await chromium.launch()
    try {
      const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const signInPage = await signIn.newPage()
      await signInPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(signInPage)
      await signInPage.getByLabel(/email/i).first().fill(ownerEmail)
      await signInPage.getByLabel(/password/i).first().fill(ownerPassword)
      await Promise.all([
        signInPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
        signInPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
      ])
      await signInPage.waitForTimeout(2000)
      const state = await signIn.storageState()
      await signIn.close()
      check(
        'lb-editrevenue.organiser.is-signed-in',
        Boolean(state?.cookies?.length),
        `${state?.cookies?.length ?? 0} cookies held after sign-in`,
      )

      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: state,
        })
        const page = await context.newPage()
        const pageErrors = []
        page.on('pageerror', e => pageErrors.push(String(e)))

        const cards = {}
        for (const [screen, path] of [
          ['edit', `/dashboard/events/${event.id}/edit`],
          ['orders', `/dashboard/events/${event.id}/orders`],
        ]) {
          const response = await page.goto(`${BASE}${path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000,
          })
          await answerTheCookieBanner(page)
          await page.waitForTimeout(1200)
          check(
            `lb-editrevenue.${screen}.${vp.label}.answers-200`,
            response?.status() === 200,
            `HTTP ${response?.status()} at ${path}`,
          )
          cards[screen] = await readRevenueCard(page)
          log(`${screen} ${vp.label} card ${JSON.stringify(cards[screen])}`)
          await page.screenshot({
            path: join(OUT, 'drive', `${screen}-${vp.label}.png`),
            fullPage: true,
          })
        }

        /*
         * THE CREATE FORM, because its two option reads were changed too and a
         * change nobody drove is a change nobody has seen work. The category
         * select is the one the old code could render EMPTY on a failed read,
         * on a form where category is required, so the assertion is that it has
         * real options rather than that the page merely answered.
         */
        const createResponse = await page.goto(`${BASE}/dashboard/events/create`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await answerTheCookieBanner(page)
        await page.waitForTimeout(1200)
        check(
          `lb-editrevenue.create.${vp.label}.answers-200`,
          createResponse?.status() === 200,
          `HTTP ${createResponse?.status()} at /dashboard/events/create`,
        )
        const categoryOptions = await page
          .locator('select#category, select[name="category_id"], select')
          .first()
          .locator('option')
          .count()
        check(
          `lb-editrevenue.create.${vp.label}.category-select-has-options`,
          categoryOptions > 1,
          `${categoryOptions} option(s) in the first select on the create form`,
        )
        await page.screenshot({
          path: join(OUT, 'drive', `create-${vp.label}.png`),
          fullPage: true,
        })

        // THE ASSERTION THE DEFECT WOULD HAVE FAILED.
        const edit = cards.edit ?? {}
        const orders = cards.orders ?? {}
        check(
          `lb-editrevenue.agreement.${vp.label}`,
          edit.gross === orders.gross &&
            edit.fee === orders.fee &&
            edit.net === orders.net &&
            edit.refunds === orders.refunds,
          `edit ${JSON.stringify(edit)} vs orders ${JSON.stringify(orders)}`,
        )
        check(
          `lb-editrevenue.edit-screen-is-right.${vp.label}`,
          edit.gross === EXPECTED_GROSS && edit.refunds === EXPECTED_REFUNDED && edit.net === EXPECTED_NET,
          `gross ${edit.gross}c (want ${EXPECTED_GROSS}), refunds ${edit.refunds}c (want ${EXPECTED_REFUNDED}), net ${edit.net}c (want ${EXPECTED_NET})`,
        )
        check(
          `lb-editrevenue.edit-screen-fee.${vp.label}`,
          edit.fee === EXPECTED_FEE,
          `one fee line of ${edit.fee}c (want ${EXPECTED_FEE})`,
        )
        check(
          `lb-editrevenue.${vp.label}.no-page-error`,
          pageErrors.length === 0,
          pageErrors.length ? pageErrors.join(' | ') : 'no uncaught error on either screen',
        )

        await context.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    // ------------------------------------------------------ leave it as found
    log('purging the lane-b-editrevenue fixture')
    await purgeFixtures(db, log, SLUG_PREFIX)
    const { count: left, error: leftError } = await db
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${SLUG_PREFIX}%`)
    check(
      'lb-editrevenue.test-is-left-as-found',
      left === 0 && !leftError,
      `${left ?? 'unknown'} lane-b-editrevenue organisation(s) left, error=${leftError?.message ?? 'null'}`,
    )
  }

  const failed = results.filter(r => !r.ok)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
  writeFileSync(
    join(OUT, 'results.json'),
    `${JSON.stringify({ base: BASE, expected: { gross: EXPECTED_GROSS, refunded: EXPECTED_REFUNDED, net: EXPECTED_NET, fee: EXPECTED_FEE }, results }, null, 2)}\n`,
    'utf8',
  )
  log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    for (const f of failed) log(`STILL FAILING: ${f.name} :: ${f.detail}`)
    exitCode = 1
  }
  process.exit(exitCode)
}

main().catch(err => {
  log(`FATAL ${err?.stack ?? err}`)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
  process.exit(1)
})
