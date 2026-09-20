/**
 * LB-ORGDASH, DRIVEN: MORE THAN A THOUSAND ORDERS IN SIXTY DAYS, AND A HOME
 * SCREEN THAT COMPARES THIS MONTH AGAINST ALL OF LAST MONTH.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE FIXTURE IS THE PROOF. 1,080 confirmed orders spread evenly
 * over sixty days, 18 a day, all the same price. The TRUE growth is therefore
 * ZERO: 540 orders last month and 540 the month before.
 *
 * The old read was newest-first with no bound, so the 1,000-row ceiling kept
 * the newest thousand and dropped the eighty oldest, and the eighty oldest are
 * all in the PRIOR month. The screen then compared an intact 540 against a
 * trimmed 460 and reported growth of about 17 per cent where there was none,
 * in the flattering direction, on the figure an organiser repeats to a
 * promoter.
 *
 * So this drive asserts a NEGATIVE that the old code could not produce: the
 * tickets delta is 0.
 *
 * IT ALSO OPENS THE EVENT OVERVIEW, whose orders read had no `order by` at all,
 * so a capped read returned an arbitrary thousand rows and its gross revenue
 * moved between page loads. That page is loaded TWICE and the two readings must
 * agree, which is a thing the old code could fail at random.
 *
 * WHAT IT LEAVES ON TEST: nothing. The orders hang off one disposable
 * organisation under `lane-b-orgdash-presents-`, deleted by id and then
 * RE-READ.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-orgdash-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-ORGDASH
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-ORGDASH'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-orgdash-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const DAY_MS = 24 * 60 * 60 * 1000
const PER_DAY = 18
const DAYS = 60
const PRICE_CENTS = 2500
const TOTAL = PER_DAY * DAYS // 1,080: eighty past the ceiling
const HALF = PER_DAY * 30 // 540 each side, so the true growth is zero

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

async function serverCount(table, build) {
  const { count, error } = await build(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-orgdash fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-orgdash+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`
  let orgId = null

  const { ownerId, org, event } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 20,
    priceCents: PRICE_CENTS,
    log,
    brand: {
      org: 'Lane B Orgdash Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Orgdash Night',
      eventSlug: 'lane-b-orgdash-night',
      owner: 'Lane B Orgdash Owner',
    },
  })
  orgId = org.id
  log(`organisation ${orgId}, event ${event.id}, organiser ${ownerId}`)

  try {
    // ------------------------------------------------------------- the orders
    const now = Date.now()
    const rows = []
    for (let day = 0; day < DAYS; day += 1) {
      for (let n = 0; n < PER_DAY; n += 1) {
        rows.push({
          organisation_id: orgId,
          event_id: event.id,
          order_number: `LBOD-${stamp}-${day}-${n}`,
          // orders_must_have_buyer (baseline schema): a row needs a user_id
          // or a guest_email. These are guest orders, which is the lighter of
          // the two and needs no auth user per order.
          guest_email: `lane-b-orgdash+${stamp}-${day}-${n}@eventlinqs.test`,
          status: 'confirmed',
          total_cents: PRICE_CENTS,
          currency: 'AUD',
          created_at: new Date(now - (day + 0.5) * DAY_MS).toISOString(),
        })
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('orders').insert(rows.slice(i, i + 200))
      if (error) throw new Error(`writing orders at offset ${i}: ${error.message}`)
    }
    log(`wrote ${rows.length} confirmed orders across ${DAYS} days`)

    const trueTotal = await serverCount('orders', q =>
      q.eq('organisation_id', orgId).eq('status', 'confirmed'),
    )
    const trueLast30 = await serverCount('orders', q =>
      q
        .eq('organisation_id', orgId)
        .eq('status', 'confirmed')
        .gte('created_at', new Date(now - 30 * DAY_MS).toISOString()),
    )
    log(`database says: ${trueTotal} confirmed orders, ${trueLast30} of them in the last 30 days`)

    check(
      'lb-orgdash.fixture.is-past-the-ceiling',
      trueTotal === TOTAL && trueTotal > 1000,
      `${trueTotal} orders in 60 days (intended ${TOTAL}), ${trueTotal - 1000} past the documented 1,000-row ceiling`,
    )
    check(
      'lb-orgdash.fixture.is-evenly-split-so-the-true-growth-is-zero',
      trueLast30 === HALF && trueTotal - trueLast30 === HALF,
      `${trueLast30} last month and ${trueTotal - trueLast30} the month before. A truncated read keeps this month intact and eats the other.`,
    )

    // ------------------------------------------------------------- the driving
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
        'lb-orgdash.organiser.is-signed-in',
        Boolean(state?.cookies?.length),
        `${state?.cookies?.length ?? 0} cookies held after sign-in`,
      )

      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: state,
        })
        const page = await context.newPage()
        const failures = []
        page.on('pageerror', e => failures.push(String(e)))

        const home = await page.goto(`${BASE}/dashboard`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await page.waitForTimeout(3500)
        await answerTheCookieBanner(page)

        check(
          `lb-orgdash.${vp.label}.home-answers-200`,
          home?.status() === 200 && failures.length === 0,
          `HTTP ${home?.status()}, ${failures.length} client error(s)`,
        )

        const kpi = async (name, attr) =>
          page.locator(`[data-kpi="${name}"]`).first().getAttribute(attr).catch(() => null)

        const ticketsValue = await kpi('tickets-30', 'data-kpi-value')
        const ticketsDelta = await kpi('tickets-30', 'data-kpi-delta')
        const revenueValue = await kpi('revenue-30', 'data-kpi-value')
        const revenueDelta = await kpi('revenue-30', 'data-kpi-delta')
        log(
          `${vp.label} home shows tickets=${ticketsValue} (${ticketsDelta}%), revenue=${revenueValue} (${revenueDelta}%)`,
        )

        check(
          `lb-orgdash.${vp.label}.tickets-30-is-every-order-in-the-window`,
          Number(String(ticketsValue).replace(/[^0-9]/g, '')) === trueLast30,
          `the card says ${ticketsValue}, the database counts ${trueLast30}`,
        )

        /*
         * THE ASSERTION THE OLD CODE COULD NOT PASS. The fixture is evenly
         * split, so the true growth is exactly zero. A truncated read leaves
         * this month whole and eats the prior one, which can only push this
         * number UP.
         */
        check(
          `lb-orgdash.${vp.label}.growth-is-zero-because-the-months-are-equal`,
          Number(ticketsDelta) === 0,
          `the delta pill reads ${ticketsDelta}%. 540 orders each month is 0% growth; a read that lost the oldest eighty reports about +17%.`,
        )
        check(
          `lb-orgdash.${vp.label}.revenue-growth-is-zero-too`,
          Number(revenueDelta) === 0,
          `revenue delta ${revenueDelta}%`,
        )

        await page.screenshot({
          path: join(OUT, 'drive', `dashboard-${vp.label}.png`),
          fullPage: true,
        })

        /*
         * THE EVENT OVERVIEW, LOADED TWICE. Its read had no `order by`, so a
         * capped response is an ARBITRARY thousand rows and the gross could
         * differ between two loads of the same page with no data changing.
         */
        const readGross = async () => {
          const r = await page.goto(`${BASE}/dashboard/events/${event.id}`, {
            waitUntil: 'domcontentloaded',
            timeout: 180000,
          })
          await page.waitForTimeout(2500)
          const body = await page.locator('body').innerText()
          return { status: r?.status(), body }
        }
        const first = await readGross()
        const second = await readGross()

        check(
          `lb-orgdash.${vp.label}.event-overview-answers-200`,
          first.status === 200 && second.status === 200,
          `HTTP ${first.status} then ${second.status}`,
        )
        const expectedGross = `${((trueTotal * PRICE_CENTS) / 100).toLocaleString('en-AU')}`
        check(
          `lb-orgdash.${vp.label}.event-overview-sums-every-order`,
          first.body.includes(expectedGross),
          `expected gross of AUD ${expectedGross} from ${trueTotal} orders at ${PRICE_CENTS}c; a capped read would show at most 1,000 of them`,
        )
        check(
          `lb-orgdash.${vp.label}.event-overview-is-stable-across-two-loads`,
          first.body.includes(expectedGross) && second.body.includes(expectedGross),
          'the same page loaded twice reports the same gross; an unordered capped read need not',
        )

        await page.screenshot({
          path: join(OUT, 'drive', `event-overview-${vp.label}.png`),
          fullPage: true,
        })
        await context.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    log('purging')
    if (orgId) await db.from('orders').delete().eq('organisation_id', orgId)
    await purgeFixtures(db, log, SLUG_PREFIX)
  }

  const leftoverOrders = orgId
    ? await serverCount('orders', q => q.eq('organisation_id', orgId))
    : 0
  const leftoverOrgs = await serverCount('organisations', q => q.like('slug', `${SLUG_PREFIX}-%`))
  check(
    'lb-orgdash.teardown.nothing-is-left-on-test',
    leftoverOrders === 0 && leftoverOrgs === 0,
    `${leftoverOrders} order(s) and ${leftoverOrgs} organisation(s) remain, re-read from the database after the purge`,
  )

  const failed = results.filter(r => !r.ok)
  lines.push('')
  lines.push(`=== ${results.length - failed.length}/${results.length} checks passed ===`)
  writeFileSync(join(OUT, 'lb-orgdash-drive.txt'), lines.join('\n'), 'utf8')
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
  writeFileSync(join(OUT, 'lb-orgdash-drive.txt'), lines.join('\n'), 'utf8')
  process.exit(1)
})
