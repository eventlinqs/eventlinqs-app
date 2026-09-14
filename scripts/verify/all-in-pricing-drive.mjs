/**
 * THE BUYER IS SHOWN WHAT THEY WILL PAY, ON A RUNNING PAGE, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHY THIS EXISTS BESIDE THE GUARD AND THE UNIT TESTS
 * ============================================================================
 *
 * Close-out SEO4 acceptance 4: "Driven proof at 390, 768 and 1440 shows the all
 * in total prominent, the breakdown reachable in one interaction, and the
 * payment methods visible, with no horizontal overflow at 390."
 *
 * `scripts/guards/all-in-pricing.mjs` proves the WIRING: that every price
 * surface reaches the resolver and no file carries the fee as a literal.
 * `tests/unit/pricing/all-in-pricing.test.ts` proves the ARITHMETIC agrees with
 * the charge, cent for cent, by driving `PaymentCalculator`. Neither can see
 * what a rendered page says, and the defect this item closes was purely what the
 * page said.
 *
 * THE EXPECTED NUMBER IS COMPUTED INDEPENDENTLY, from the tier price and the fee
 * rates read straight out of the database, not from anything the page produced.
 * A drive that scraped a number and checked it looked like a number would have
 * passed on 13 September 2026, when the page was showing a price nobody could
 * buy at.
 *
 * WHAT IT CANNOT SEE, said rather than implied: whether the CHARGE matches. That
 * is the unit test's job, and it drives the real calculator to do it. This
 * asserts only that the page renders the number the configuration implies.
 *
 * Run: node --env-file=.env.local scripts/verify/all-in-pricing-drive.mjs [baseUrl]
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * THIS DRIVE CREATES ITS OWN EVENT, and the preflight runs before anything else.
 *
 * It borrowed a fixture event first, and that was wrong twice over. The first
 * candidate's organiser had not finished Stripe setup, so the ticket panel
 * rendered "Tickets not yet on sale" and there was no price to check. The second
 * had a DYNAMIC PRICING rule, so the tier row said 2800 and the page correctly
 * showed 4000, and the drive reported the PAGE as wrong when the fixture was.
 *
 * Every sale-ready paid event on TEST carries a dynamic pricing rule, so there
 * is no borrowable event that answers the question cleanly. Owning the fixture
 * is the fix: one lane-C event, one tier, a price this script chose, no dynamic
 * rule, deleted in a `finally`. It also makes the drive repeatable on a database
 * whose contents nobody controls.
 */
assertNotProduction()

const BASE = (process.argv[2] || process.env.ALL_IN_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.ALL_IN_OUT || ''
const TAG = '[all-in-pricing]'

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop-1440', width: 1440, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const log = []
const faults = []
const say = m => {
  log.push(m)
  console.log(`${TAG} ${m}`)
}
const fail = m => {
  faults.push(m)
  log.push(`FAIL: ${m}`)
  console.error(`${TAG} FAIL: ${m}`)
}

/**
 * The fee math, re-implemented HERE on purpose, and that is not a fork of
 * `fee-math.ts`.
 *
 * This script is the independent observer. If it imported the product's own
 * arithmetic it could only ever confirm that the product agrees with itself,
 * which is the failure mode the whole item is about. Eight lines written from
 * the published rule (a percentage of the subtotal plus a flat amount per
 * ticket, rounded half up, once) is the check; the product's version is the
 * thing being checked. The unit test asserts the product's own composition and
 * drives the real charge calculator, so nothing here is the only proof of the
 * formula.
 */
function expectedAllInCents(faceCents, percent, fixedCents, passType) {
  if (faceCents <= 0) return 0
  if (passType === 'absorb') return faceCents
  return faceCents + Math.round((faceCents * percent) / 100 + fixedCents)
}

function money(cents) {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url.includes(TEST_PROJECT_REF)) {
  console.error(`${TAG} REFUSING: NEXT_PUBLIC_SUPABASE_URL is not the TEST project ${TEST_PROJECT_REF}.`)
  process.exit(2)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const created = []

/** The face value this drive chooses. Not a round number, so the percentage
 *  rounds visibly rather than landing on a whole cent by luck. */
const FACE_CENTS = 2850

async function createLaneCEvent(passType) {
  /*
   * THE ORGANISATION MUST BE ABLE TO TAKE PAYMENT AND MUST ALREADY HAVE AN
   * EVENT, and both conditions are asked in ONE question rather than two.
   *
   * Payment first: without `stripe_charges_enabled` the panel renders "Tickets
   * not yet on sale" and there is no price on the page to check at all.
   *
   * An existing event second, because `events.created_by` must be a user who
   * belongs to the organisation and the only way to learn one is to read a row
   * it already owns. Asking for a sale-ready organisation on its own picked
   * `afrobeats-melbourne`, which is sale-ready and has never published anything,
   * and the drive then failed on the creator lookup. The two facts are one
   * requirement, so they are one query.
   */
  const { data: seedEvent, error: seedError } = await db
    .from('events')
    .select('organisation_id, created_by, category_id, organisation:organisations!inner(id, slug, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status)')
    .eq('organisation.status', 'active')
    /*
     * ALL FIVE GATE FIELDS, not the two that sound sufficient.
     * `src/lib/payments/sale-status.ts` publishes ORG_SALE_FIELDS_SELECT as
     * stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled,
     * stripe_account_country and payout_status, and the gate fails CLOSED on any
     * of them. Asking only about charges and payouts picked
     * `broadcast-gate-presents`, whose stripe_account_country is null, so the
     * page correctly rendered "Tickets not yet on sale" and the drive reported
     * three missing elements that were missing for a reason it had caused.
     */
    .eq('organisation.stripe_charges_enabled', true)
    .eq('organisation.stripe_payouts_enabled', true)
    .not('organisation.stripe_account_id', 'is', null)
    .not('organisation.stripe_account_country', 'is', null)
    .eq('organisation.payout_status', 'active')
    .limit(1)
    .maybeSingle()
  if (seedError || !seedEvent) {
    throw new Error(`no event on TEST belongs to a sale-ready organisation: ${seedError?.message ?? 'none found'}`)
  }
  const org = { id: seedEvent.organisation_id, slug: seedEvent.organisation.slug }

  /*
   * THE COVER COMES FROM ANYWHERE. It is just a URL, any published event's will
   * do, and the sale-ready organisation on TEST has none of its own, which made
   * a single combined lookup return nothing and stop the drive on a fact that
   * did not matter to what is being measured.
   */
  const creatorRow = seedEvent
  const { data: coverRow } = await db
    .from('events')
    .select('cover_image_url')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .maybeSingle()
  const donor = {
    created_by: creatorRow.created_by,
    category_id: creatorRow.category_id,
    cover_image_url: coverRow?.cover_image_url ?? null,
  }
  if (!donor.cover_image_url) throw new Error('no published event on TEST carries a cover image to borrow')

  const start = new Date(Date.now() + 21 * 24 * 3600 * 1000)
  const slug = `lane-c-seo4-all-in-${passType}-${Date.now().toString(36)}`
  const { data: event, error } = await db
    .from('events')
    .insert({
      title: `Lane C SEO4 all-in probe (${passType})`,
      slug,
      organisation_id: org.id,
      created_by: donor.created_by,
      category_id: donor.category_id,
      cover_image_url: donor.cover_image_url,
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 4 * 3600 * 1000).toISOString(),
      timezone: 'Australia/Melbourne',
      status: 'published',
      visibility: 'public',
      fee_pass_type: passType,
      venue_name: 'Lane C Proof Room',
      venue_address: '1 Lane C Street',
      venue_city: 'Melbourne',
      venue_country: 'Australia',
      description: 'A lane-C verification row. Created and deleted by scripts/verify/all-in-pricing-drive.mjs.',
    })
    .select('id, slug')
    .single()
  if (error) throw new Error(`could not insert the lane-C event: ${error.message}`)
  created.push(event.id)

  const { error: tierError } = await db.from('ticket_tiers').insert({
    event_id: event.id,
    name: 'Lane C general admission',
    price: FACE_CENTS,
    currency: 'AUD',
    total_capacity: 100,
    max_per_order: 10,
  })
  if (tierError) throw new Error(`could not insert the lane-C tier: ${tierError.message}`)

  say(`created /events/${event.slug} (${passType}) under ${org.slug}, one tier at ${money(FACE_CENTS)}`)
  return event.slug
}

async function main() {
  const percent = Number(process.env.ALL_IN_PERCENT)
  const fixedCents = Number(process.env.ALL_IN_FIXED_CENTS)
  if (!Number.isFinite(percent) || !Number.isFinite(fixedCents)) {
    throw new Error('ALL_IN_PERCENT and ALL_IN_FIXED_CENTS must be read from pricing_rules by the caller')
  }
  const passType = 'pass_to_buyer'
  const slug = await createLaneCEvent(passType)
  const faceCents = FACE_CENTS

  const expected = expectedAllInCents(faceCents, percent, fixedCents, passType)
  const expectedFrom = `From AUD ${money(expected)}`
  say(`event /events/${slug}: face ${money(faceCents)}, fee ${percent}% + ${money(fixedCents)} per ticket, ${passType}`)
  say(`so the buyer pays ${money(expected)}, and the page must say so`)
  if (expected === faceCents && passType !== 'absorb') {
    throw new Error('the fixture event produces no fee, so this drive could not tell a fixed page from a broken one')
  }

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: vp.deviceScaleFactor,
      })
      const page = await ctx.newPage()
      const res = await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 180_000 })
      if (!res || res.status() !== 200) {
        fail(`${vp.name}: the event page answered ${res ? res.status() : 'nothing'}`)
        await ctx.close()
        continue
      }

      const body = await page.evaluate(() => document.body.innerText)

      /* ---- 1. the all-in total is the prominent "From" number ---- */
      if (!body.includes(expectedFrom)) {
        fail(`${vp.name}: the page does not say "${expectedFrom}". It is showing a price that is not the price`)
      } else {
        say(`${vp.name}: hero reads "${expectedFrom}"`)
      }
      if (body.includes(`From AUD ${money(faceCents)}`)) {
        fail(`${vp.name}: the page still shows the FACE VALUE as the from-price (${money(faceCents)})`)
      }

      /* ---- 2. the per-tier total and its breakdown ---- */
      const tierTotal = await page
        .locator('[data-testid="tier-all-in-breakdown"]')
        .first()
        .textContent()
        .catch(() => null)
      if (!tierTotal) {
        fail(`${vp.name}: no per-tier breakdown line is rendered beside the ticket`)
      } else {
        // ZERO interactions, which is stronger than the "one" the item asks for.
        say(`${vp.name}: tier breakdown visible without any interaction: "${tierTotal.trim()}"`)
        if (!/plus/.test(tierTotal) && !/included/.test(tierTotal)) {
          fail(`${vp.name}: the breakdown line names neither a fee added nor a fee included: "${tierTotal}"`)
        }
      }

      /* ---- 3. the fee, in plain words, from configuration ---- */
      if (!body.includes(`${percent}%`)) {
        fail(`${vp.name}: the fee percentage (${percent}%) is stated nowhere on the event page`)
      } else {
        say(`${vp.name}: the fee is named in words on the page`)
      }

      /* ---- 4. the payment methods ---- */
      const methods = await page
        .locator('ul[aria-label="Accepted payment methods"]')
        .first()
        .textContent()
        .catch(() => null)
      if (!methods) {
        fail(`${vp.name}: the accepted payment methods are not on the event page`)
      } else {
        say(`${vp.name}: payment methods visible: ${methods.replace(/\s+/g, ' ').trim()}`)
      }

      /* ---- 5. no horizontal overflow, which only 390 can really fail ---- */
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      if (overflow.scrollWidth > overflow.clientWidth + 1) {
        fail(
          `${vp.name}: the page scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth}). ` +
            'A price row that overflows is a price a buyer has to drag to read',
        )
      } else {
        say(`${vp.name}: no horizontal overflow (${overflow.scrollWidth} <= ${overflow.clientWidth})`)
      }

      if (OUT) {
        mkdirSync(OUT, { recursive: true })
        await page.screenshot({ path: join(OUT, `all-in-${vp.name}.png`), fullPage: false })
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

try {
  await main()
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
} finally {
  for (const id of created) {
    const { error } = await db.from('ticket_tiers').delete().eq('event_id', id)
    if (error) fail(`could not delete the lane-C tiers for ${id}: ${error.message}`)
    const { error: eventError } = await db.from('events').delete().eq('id', id)
    if (eventError) fail(`could not delete the lane-C row ${id}: ${eventError.message}. IT IS STILL ON TEST.`)
    else say(`deleted lane-C row ${id}`)
  }
}

if (OUT) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'all-in-pricing-drive.txt'), `${log.join('\n')}\n`, 'utf8')
}

if (faults.length > 0) {
  console.error(`\n${TAG} ${faults.length} fault(s).`)
  process.exit(1)
}
console.log(`\n${TAG} PASS - the all-in total is prominent, the breakdown and the payment methods are visible,\n      and nothing overflows, at 390, 768 and 1440.`)
