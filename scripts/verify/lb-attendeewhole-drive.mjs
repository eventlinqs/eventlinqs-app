/**
 * LB-ATTENDEEWHOLE, DRIVEN: MORE THAN A THOUSAND ATTENDEES, AND AN ORGANISER
 * WHO IS PROMISED, IN WRITING ON THAT PAGE, THAT THEY OWN ALL OF THEM.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FIXTURE IS 1,150 AND NOT 1,000.
 *
 * Supabase caps one response at 1,000 rows and says nothing about it: HTTP 200,
 * `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * A fixture at or under the ceiling proves nothing, because the defective code
 * and the fixed code return the same thing. 1,150 puts 150 people on the far
 * side of it.
 *
 * The attendee page carries a heading that says "You own your audience" and a
 * paragraph promising the organiser that every name and email on the list
 * belongs to them. Every read behind it was unbounded. So the exact surface
 * that makes the promise was the surface breaking it, and the organisers it
 * broke it for were the successful ones.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH ONE IS A NUMBER RATHER THAN A SCREENSHOT.
 *
 *   the attendee tile     equals a count the DATABASE performed, not one this
 *                         script accumulated in the loop it is checking
 *   the CSV               has exactly 1,150 data rows, and the LAST buyer is
 *                         one of them. The read was oldest-first, so the last
 *                         buyer is precisely who a capped read cannot return
 *   the consent column    every one of the 1,150 reads "Yes". Consent rows are
 *                         unique per (organisation, email), so truncation drops
 *                         people and a dropped person reads as NOT consented
 *   the XLSX              the same 1,150, through a second encoder, because a
 *                         CSV and a spreadsheet are two different code paths
 *                         over one array and an organiser uses both
 *   the PDF door list     parses, and its page count is recorded so the
 *                         counter-proof can show the truncated door list is
 *                         physically shorter
 *   the orders screen     tickets sold, remaining, and gross revenue, all
 *                         summed from what arrived. Remaining is the one that
 *                         points the DANGEROUS way: a short order list leaves
 *                         it too HIGH, offering inventory already sold
 *   the orders CSV        1,150 rows and a total that equals the database's
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off one disposable
 * organisation under `lane-b-attendeewhole-presents-`, deleted by id and then
 * RE-READ rather than assumed.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-attendeewhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-ATTENDEEWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-ATTENDEEWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-attendeewhole-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const TOTAL = 1150 // 150 past the documented 1,000-row ceiling
/*
 * CONSENT ROWS THAT ARE NOT THIS EVENT'S ATTENDEES, WRITTEN FIRST.
 *
 * An organiser accumulates consent across every event they have ever run, so an
 * organisation's consent table is bigger than any one event's guest list. That
 * is the ordinary case, and it is also what makes the truncation bite: the
 * consent read is scoped to the ORGANISATION, carries no `order by`, and is
 * unbounded, so past the ceiling the rows that come back are an arbitrary
 * thousand of the organisation's whole history.
 *
 * The first counter-proof run did NOT reproduce the consent failure, because
 * the arbitrary thousand happened to be the attendees' own rows. That is
 * precisely what "arbitrary" means and it is the argument for the fix, but it
 * proves nothing on its own. These decoys are written BEFORE the attendees'
 * consents so the ceiling has something else to keep.
 */
const DECOY_CONSENTS = 1150
const PRICE_CENTS = 2500
const FEE_CENTS = 100
const CAPACITY = 2000

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

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

/** A count the SERVER performed. Never one accumulated here. */
async function serverCount(table, build) {
  const { count, error } = await build(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

async function insertInBatches(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size))
    if (error) throw new Error(`writing ${table} at offset ${i}: ${error.message}`)
  }
}

/** Data rows of a CSV, BOM stripped, trailing blank dropped. */
function csvRows(text) {
  const body = text.replace(/^\uFEFF/, '')
  const all = body.split('\r\n').filter(l => l.length > 0)
  return { header: all[0] ?? '', rows: all.slice(1) }
}

/**
 * axe-core over a surface that is already open and already signed in.
 *
 * SCOPED TO THE TWO SCREENS THIS ITEM CHANGED, which is what the Completion
 * Law's regression clause asks for: zero violations at EVERY impact level on
 * the affected surfaces, not a platform sweep. Both are behind an organiser
 * login, so they cannot be reached by `scripts/verify/axe-urls.mjs`, and
 * running it here means axe judges the page with 1,150 real rows on it rather
 * than an empty one.
 */
async function axeViolations(page) {
  await page.addScriptTag({ path: AXE_PATH })
  return page.evaluate(async () => {
    // WCAG 2 A and AA, which is the bar the constitution sets.
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return r.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.target?.join(' ') ?? '',
    }))
  })
}

function describeViolations(found) {
  if (found.length === 0) return 'zero violations at every impact level'
  return found.map(v => `${v.impact}:${v.id}(${v.nodes}) ${v.sample.slice(0, 60)}`).join(' | ')
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-attendeewhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-attendeewhole+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`
  let orgId = null
  let eventId = null

  const { ownerId, org, event, tier } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: CAPACITY,
    priceCents: PRICE_CENTS,
    log,
    brand: {
      org: 'Lane B Attendeewhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Attendeewhole Night',
      eventSlug: 'lane-b-attendeewhole-night',
      owner: 'Lane B Attendeewhole Owner',
    },
  })
  orgId = org.id
  eventId = event.id
  log(`organisation ${orgId}, event ${eventId}, tier ${tier.id}, organiser ${ownerId}`)

  try {
    // ------------------------------------------------------ orders and tickets
    /*
     * ONE ORDER, ONE ITEM, ONE TICKET, ONE CONSENT, 1,150 times. The tickets
     * are written OLDEST FIRST in time, matching the read the defect lived in,
     * so the people the ceiling dropped are the LAST ones inserted. Attendee
     * 01149 is therefore the single most useful row in the fixture: a capped
     * oldest-first read can never return it.
     */
    const now = Date.now()
    const orderRows = []
    for (let i = 0; i < TOTAL; i += 1) {
      orderRows.push({
        id: randomUUID(),
        organisation_id: orgId,
        event_id: eventId,
        order_number: `LBAW-${stamp}-${String(i).padStart(5, '0')}`,
        // orders_must_have_buyer (baseline schema) needs a user_id or a
        // guest_email. Guest orders are the lighter of the two.
        guest_email: `lane-b-attendeewhole+${stamp}-${String(i).padStart(5, '0')}@eventlinqs.test`,
        guest_name: `Attendee ${i}`,
        status: 'confirmed',
        subtotal_cents: PRICE_CENTS,
        discount_cents: 0,
        platform_fee_cents: FEE_CENTS,
        processing_fee_cents: 0,
        total_cents: PRICE_CENTS,
        currency: 'AUD',
        created_at: new Date(now - (TOTAL - i) * 60_000).toISOString(),
      })
    }
    await insertInBatches('orders', orderRows)
    log(`wrote ${orderRows.length} confirmed orders`)

    const itemRows = orderRows.map(o => ({
      id: randomUUID(),
      order_id: o.id,
      item_type: 'ticket',
      item_name: 'General Admission',
      ticket_tier_id: tier.id,
      quantity: 1,
      unit_price_cents: PRICE_CENTS,
      total_cents: PRICE_CENTS,
      created_at: o.created_at,
    }))
    await insertInBatches('order_items', itemRows)
    log(`wrote ${itemRows.length} order items`)

    const ticketRows = itemRows.map((item, i) => ({
      event_id: eventId,
      order_id: item.order_id,
      order_item_id: item.id,
      ticket_tier_id: tier.id,
      idx_in_item: 0,
      ticket_code: `LBAW-${stamp}-${String(i).padStart(5, '0')}`,
      holder_name: `Attendee ${String(i).padStart(5, '0')}`,
      holder_email: `lane-b-attendeewhole+${stamp}-${String(i).padStart(5, '0')}@eventlinqs.test`,
      status: 'valid',
      created_at: item.created_at,
    }))
    await insertInBatches('tickets', ticketRows)
    log(`wrote ${ticketRows.length} valid tickets`)

    const consentFor = email => ({
      organisation_id: orgId,
      email,
      status: 'granted',
      consent_text: 'Keep me posted about this organiser\u2019s events.',
      consent_version: 'v1',
      source: 'checkout',
    })

    // The organiser's older audience, from events that are not this one. These
    // go in FIRST, so an unbounded read of the organisation's consents has a
    // thousand rows to keep that are not this event's attendees.
    const decoyRows = Array.from({ length: DECOY_CONSENTS }, (_unused, i) =>
      consentFor(`lane-b-attendeewhole-past+${stamp}-${String(i).padStart(5, '0')}@eventlinqs.test`),
    )
    await insertInBatches('organiser_marketing_consents', decoyRows)
    log(`wrote ${decoyRows.length} consents from the organiser's earlier events`)

    const consentRows = ticketRows.map(t => consentFor(t.holder_email))
    await insertInBatches('organiser_marketing_consents', consentRows)
    log(`wrote ${consentRows.length} granted marketing consents for this event's attendees`)

    // ------------------------------------------- what the database itself says
    const trueTickets = await serverCount('tickets', q =>
      q.eq('event_id', eventId).eq('status', 'valid'),
    )
    const trueOrders = await serverCount('orders', q =>
      q.eq('event_id', eventId).eq('status', 'confirmed'),
    )
    const trueConsents = await serverCount('organiser_marketing_consents', q =>
      q.eq('organisation_id', orgId).eq('status', 'granted'),
    )
    log(`database says: ${trueTickets} tickets, ${trueOrders} orders, ${trueConsents} consents`)

    check(
      'lb-attendeewhole.fixture.is-past-the-ceiling',
      trueTickets === TOTAL &&
        trueOrders === TOTAL &&
        trueConsents === TOTAL + DECOY_CONSENTS &&
        trueTickets > 1000,
      `${trueTickets} tickets, ${trueOrders} orders, ${trueConsents} consents ` +
        `(${DECOY_CONSENTS} of them from the organiser's earlier events, written first); ` +
        `${trueTickets - 1000} attendees past the documented 1,000-row ceiling, and the ` +
        `organisation's consent table is ${trueConsents - 1000} past it`,
    )

    const expectedGrossCents = trueOrders * PRICE_CENTS
    const expectedRemaining = CAPACITY - trueTickets

    // -------------------------------------------------------------- the driving
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
        'lb-attendeewhole.organiser.is-signed-in',
        Boolean(state?.cookies?.length),
        `${state?.cookies?.length ?? 0} cookies held after sign-in`,
      )

      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: state,
        })
        const page = await context.newPage()
        const clientErrors = []
        page.on('pageerror', e => clientErrors.push(String(e)))

        /*
         * PREFLIGHT. `next dev` on this machine has twice come up serving a
         * PARTIAL route tree, where a route on disk answers 404 for no reason
         * the product can explain. It presents exactly as a total product
         * failure. Ask first, and say which it is.
         */
        const preflight = await page.request.get(`${BASE}/dashboard`)
        if (preflight.status() >= 400) {
          throw new Error(
            `preflight: /dashboard answered ${preflight.status()}. That is the server, not the product. Restart it and re-run.`,
          )
        }

        // ------------------------------------------------ the attendee screen
        const attendees = await page.goto(`${BASE}/dashboard/events/${eventId}/attendees`, {
          waitUntil: 'domcontentloaded',
          timeout: 240000,
        })
        await page.waitForTimeout(3000)
        await answerTheCookieBanner(page)

        check(
          `lb-attendeewhole.${vp.label}.attendee-screen-answers-200`,
          attendees?.status() === 200 && clientErrors.length === 0,
          `HTTP ${attendees?.status()}, ${clientErrors.length} client error(s)`,
        )

        const statValue = async name =>
          page.locator(`[data-stat="${name}"]`).first().getAttribute('data-stat-value').catch(() => null)

        const shownAttendees = await statValue('attendees')
        check(
          `lb-attendeewhole.${vp.label}.attendee-tile-is-every-attendee`,
          Number(shownAttendees) === trueTickets,
          `the tile says ${shownAttendees}, the database counts ${trueTickets}. ` +
            'A capped read shows exactly 1000 here and nothing on the page says so.',
        )

        const bodyText = await page.locator('body').innerText()
        check(
          `lb-attendeewhole.${vp.label}.the-promise-is-on-the-page`,
          bodyText.includes('You own your audience'),
          'the page states the data-ownership promise, which is what makes a short list a broken promise rather than a display bug',
        )

        await page.screenshot({
          path: join(OUT, 'drive', `attendees-${vp.label}.png`),
          fullPage: false,
        })

        const attendeeAxe = await axeViolations(page)
        check(
          `lb-attendeewhole.${vp.label}.attendee-screen-is-accessible`,
          attendeeAxe.length === 0,
          describeViolations(attendeeAxe),
        )

        // ------------------------------------------------------- the CSV export
        const csvBase = `${BASE}/dashboard/events/${eventId}/attendees/export`
        const csvResponse = await page.request.get(`${csvBase}?format=csv`, { timeout: 240000 })
        const csvText = await csvResponse.text()
        const { header, rows } = csvRows(csvText)

        check(
          `lb-attendeewhole.${vp.label}.attendee-csv-has-every-row`,
          csvResponse.status() === 200 && rows.length === trueTickets,
          `HTTP ${csvResponse.status()}, ${rows.length} data row(s) against ${trueTickets} attendees`,
        )

        const lastHolder = `${String(TOTAL - 1).padStart(5, '0')}@eventlinqs.test`
        check(
          `lb-attendeewhole.${vp.label}.the-last-buyer-is-in-the-export`,
          csvText.includes(lastHolder),
          `attendee ${String(TOTAL - 1).padStart(5, '0')} bought last, and the read is oldest-first, ` +
            'so they are exactly who a capped read cannot return',
        )

        /*
         * THE CONSENT COLUMN. Consent rows are unique per (organisation,
         * email), so a truncated consent read DROPS people, and a dropped
         * person reads as not consented. Every one of these attendees granted
         * consent, so a single "No" is the organiser being told they may not
         * lawfully email somebody who said they could.
         */
        const consentColumn = header.split(',').indexOf('Marketing consent')
        const notConsented = rows.filter(r => r.split(',')[consentColumn] !== 'Yes')
        check(
          `lb-attendeewhole.${vp.label}.every-consent-is-read`,
          consentColumn > -1 && notConsented.length === 0,
          `column ${consentColumn}, ${rows.length - notConsented.length} of ${rows.length} read "Yes". ` +
            `The organisation holds ${trueConsents} granted consents and the read is scoped to the ` +
            'ORGANISATION with no order by, so an unbounded read keeps an arbitrary thousand of the ' +
            "organiser's whole history and every attendee whose row it dropped reads as a refusal.",
        )

        // ------------------------------------------------------ the XLSX export
        const xlsxResponse = await page.request.get(`${csvBase}?format=xlsx`, { timeout: 240000 })
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(await xlsxResponse.body())
        const sheet = workbook.worksheets[0]
        // rowCount includes the header row.
        check(
          `lb-attendeewhole.${vp.label}.attendee-xlsx-has-every-row`,
          xlsxResponse.status() === 200 && sheet.rowCount - 1 === trueTickets,
          `HTTP ${xlsxResponse.status()}, ${sheet.rowCount - 1} data row(s) against ${trueTickets}. ` +
            'A second encoder over the same array, because an organiser uses both.',
        )

        // --------------------------------------------------- the PDF door list
        const pdfResponse = await page.request.get(`${csvBase}?format=pdf`, { timeout: 240000 })
        const pdf = await PDFDocument.load(await pdfResponse.body())
        const pdfPages = pdf.getPageCount()
        check(
          `lb-attendeewhole.${vp.label}.door-list-is-a-real-document`,
          pdfResponse.status() === 200 && pdfPages > 1,
          `HTTP ${pdfResponse.status()}, ${pdfPages} page(s) for ${trueTickets} attendees. ` +
            'Recorded so the counter-proof can show the truncated door list is physically shorter.',
        )

        // -------------------------------------------------- the orders screen
        const orders = await page.goto(`${BASE}/dashboard/events/${eventId}/orders`, {
          waitUntil: 'domcontentloaded',
          timeout: 240000,
        })
        await page.waitForTimeout(3000)

        check(
          `lb-attendeewhole.${vp.label}.orders-screen-answers-200`,
          orders?.status() === 200,
          `HTTP ${orders?.status()}`,
        )

        const soldShown = await statValue('tickets-sold')
        check(
          `lb-attendeewhole.${vp.label}.tickets-sold-counts-every-order`,
          Number(soldShown) === trueOrders,
          `the tile says ${soldShown}, the database counts ${trueOrders}`,
        )

        /*
         * REMAINING IS THE ONE THAT POINTS THE DANGEROUS WAY. It is
         * `capacity - ticketsSold`, so a short order list leaves it too HIGH:
         * the screen offers an organiser inventory they have already sold.
         */
        const remainingShown = await statValue('remaining')
        check(
          `lb-attendeewhole.${vp.label}.remaining-is-not-inventory-already-sold`,
          Number(remainingShown) === expectedRemaining,
          `the tile says ${remainingShown}, the truth is ${CAPACITY} - ${trueOrders} = ${expectedRemaining}. ` +
            'A read capped at 1000 reports 1000 remaining, which is 150 tickets that do not exist.',
        )

        const ordersBody = await page.locator('body').innerText()
        const expectedGross = new Intl.NumberFormat('en-AU', {
          style: 'currency',
          currency: 'AUD',
          currencyDisplay: 'code',
        }).format(expectedGrossCents / 100)
        check(
          `lb-attendeewhole.${vp.label}.gross-revenue-sums-every-order`,
          ordersBody.replace(/\u00a0/g, ' ').includes(expectedGross.replace(/\u00a0/g, ' ')),
          `expected ${expectedGross} from ${trueOrders} orders at ${PRICE_CENTS}c; ` +
            'a capped read can show at most 1000 of them',
        )

        await page.screenshot({
          path: join(OUT, 'drive', `orders-${vp.label}.png`),
          fullPage: false,
        })

        const ordersAxe = await axeViolations(page)
        check(
          `lb-attendeewhole.${vp.label}.orders-screen-is-accessible`,
          ordersAxe.length === 0,
          describeViolations(ordersAxe),
        )

        // ------------------------------------------------- the orders CSV export
        const ordersCsv = await page.request.get(
          `${BASE}/dashboard/events/${eventId}/orders/export?format=csv`,
          { timeout: 240000 },
        )
        const ordersText = await ordersCsv.text()
        const parsedOrders = csvRows(ordersText)
        const totalColumn = parsedOrders.header.split(',').indexOf('Total')
        const csvTotalCents = parsedOrders.rows.reduce(
          (sum, r) => sum + Math.round(Number(r.split(',')[totalColumn]) * 100),
          0,
        )

        check(
          `lb-attendeewhole.${vp.label}.orders-csv-has-every-row`,
          ordersCsv.status() === 200 && parsedOrders.rows.length === trueOrders,
          `HTTP ${ordersCsv.status()}, ${parsedOrders.rows.length} data row(s) against ${trueOrders} orders`,
        )
        check(
          `lb-attendeewhole.${vp.label}.orders-csv-totals-every-dollar`,
          csvTotalCents === expectedGrossCents,
          `the export totals ${csvTotalCents}c against ${expectedGrossCents}c in the database`,
        )

        await context.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    /*
     * CHILDREN FIRST, PARENTS LAST. purgeFixtures does not know about tickets
     * written outside a purchase, nor about consent rows, so both go here
     * explicitly and in an order the foreign keys allow.
     */
    log('purging')
    if (orgId) {
      await db.from('organiser_marketing_consents').delete().eq('organisation_id', orgId)
    }
    if (eventId) {
      await db.from('tickets').delete().eq('event_id', eventId)
      const { data: leftoverOrders } = await db.from('orders').select('id').eq('event_id', eventId)
      const ids = (leftoverOrders ?? []).map(o => o.id)
      for (let i = 0; i < ids.length; i += 200) {
        await db.from('order_items').delete().in('order_id', ids.slice(i, i + 200))
      }
      await db.from('orders').delete().eq('event_id', eventId)
    }
    await purgeFixtures(db, log, SLUG_PREFIX)
  }

  // --------------------------------------------- re-read, rather than assumed
  const leftTickets = eventId ? await serverCount('tickets', q => q.eq('event_id', eventId)) : 0
  const leftOrders = eventId ? await serverCount('orders', q => q.eq('event_id', eventId)) : 0
  const leftConsents = orgId
    ? await serverCount('organiser_marketing_consents', q => q.eq('organisation_id', orgId))
    : 0
  const leftOrgs = await serverCount('organisations', q => q.like('slug', `${SLUG_PREFIX}-%`))
  check(
    'lb-attendeewhole.teardown.nothing-is-left-on-test',
    leftTickets === 0 && leftOrders === 0 && leftConsents === 0 && leftOrgs === 0,
    `${leftTickets} ticket(s), ${leftOrders} order(s), ${leftConsents} consent(s) and ${leftOrgs} ` +
      'organisation(s) remain, re-read from the database after the purge',
  )

  const failed = results.filter(r => !r.ok)
  lines.push('')
  lines.push(`=== ${results.length - failed.length}/${results.length} checks passed ===`)
  writeFileSync(join(OUT, 'lb-attendeewhole-drive.txt'), lines.join('\n'), 'utf8')
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
  if (failed.length > 0) {
    for (const f of failed) console.error(`  FAILED: ${f.name} :: ${f.detail}`)
    process.exit(1)
  }
}

main().catch(async err => {
  log(`FATAL ${err.stack ?? err}`)
  try {
    await purgeFixtures(db, log, SLUG_PREFIX)
  } catch (e) {
    log(`teardown after failure also failed: ${e.message}`)
  }
  writeFileSync(join(OUT, 'lb-attendeewhole-drive.txt'), lines.join('\n'), 'utf8')
  process.exit(1)
})
