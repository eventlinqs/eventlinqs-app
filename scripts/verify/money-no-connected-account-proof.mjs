/**
 * MONEY FIX, ACCEPTANCE LINE 7, ONE WIDTH. A buyer cannot be charged for an
 * organiser who has no connected account, and is told so plainly.
 *
 * WHAT THE ITEM ASKS FOR: "A driven proof that a purchase is refused when the
 * organiser has no connected account, rendered at 390, 768 and 1440."
 *
 * THE CONTROL IS THE PROOF. A page that refuses to sell proves nothing on its
 * own: an event with no tier, a sold out tier, a broken build and a missing
 * stylesheet all refuse to sell too, and all four look the same through a
 * screenshot. So this proof sells FIRST. It builds a charge-ready organiser,
 * confirms the same event on the same build at the same width offers its ticket,
 * and only then takes the connected account away and confirms the refusal. One
 * fixture, one width, two states, and the only thing that changed between them
 * is the four columns the sale gate reads.
 *
 * WHY THE COLUMNS ARE READ BACK. The refusal is asserted against the row as the
 * database holds it after the write, never against the write's own return value,
 * because a proof that trusts its own arrangement is proving its arrangement.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not reach Stripe and needs no card,
 * no webhook and no `stripe listen`: the refusal happens before any charge is
 * attempted, which is the point. The charge precondition's own named error is
 * covered by tests/unit/payments, and this is the half a person can see.
 *
 * TEST ONLY. Driven by money-no-connected-account-drive.mjs, which owns the
 * server and the environment. Run that, not this.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const TAG = '[a7-proof]'
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const OUT = (flag('out') ?? 'C:/dev/EVIDENCE/MONEY-A7/a7').replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE
const VIEWPORT = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const SIZES = {
  'mobile-390': { width: 390, height: 844, isMobile: true },
  'tablet-768': { width: 768, height: 1024, isMobile: false },
  'desktop-1440': { width: 1440, height: 900, isMobile: false },
}
const size = SIZES[VIEWPORT]
if (!BASE) throw new Error(`${TAG} BASE is not set; run money-no-connected-account-drive.mjs`)
if (!size) throw new Error(`${TAG} unknown viewport ${VIEWPORT}`)

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(`${TAG} the TEST Supabase credentials are not in the environment`)
}
if (/gndnldyfudbytbboxesk/.test(URL)) {
  throw new Error(`${TAG} REFUSING: that is the PRODUCTION project. This proof writes fixtures.`)
}
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const checks = []
/** capture name -> sha256 of the PNG, so the report can be checked without the images. */
const shots = {}
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail })
  console.log(`${TAG} ${pass ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

/**
 * The sentence the buyer is shown, quoted from the product rather than invented
 * here: src/lib/payments/sale-status.ts. Matched on its distinctive middle so a
 * copy edit to the top and tail does not silently stop this proof asserting
 * anything, while a change of MEANING still fails it.
 */
const REFUSAL = /still finishing their payment setup/i

const stamp = `a7${Date.now().toString(36)}`
const ownerEmail = `lane-a-a7-${stamp}@example.com`
const SLUG_PREFIX = 'lane-a-a7-presents'
const PRICE_CENTS = 4_500

let browser = null
let fixture = null
try {
  fixture = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: `A7-${stamp}-pw`,
    capacity: 10,
    priceCents: PRICE_CENTS,
    log: (line) => console.log(`${TAG} fixture: ${line}`),
    brand: {
      org: 'Lane A A7 Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane A A7 Night',
      eventSlug: 'lane-a-a7-night',
      owner: 'Lane A A7 Owner',
    },
  })

  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.isMobile,
    hasTouch: size.isMobile,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  /*
   * THE SHOT IS fullPage, AND THAT IS NOT A PREFERENCE.
   *
   * The first run of this proof took viewport-only shots, and at 390 and 768 the
   * control and the refusal came out BYTE FOR BYTE IDENTICAL (sha256 8d0ffe6b...
   * at 390, 513be6ff... at 768). Every assertion passed, because the assertions
   * read the page's TEXT and the text really had changed. What had not changed
   * was the part of the page above the fold: at narrow widths the ticket panel
   * sits below it, so both images showed the same hero and the evidence for
   * two of the three widths this item names showed nothing of what it claimed.
   *
   * So the page is captured whole, and the two captures are HASHED and compared
   * below. A proof whose own evidence is the same picture twice fails.
   */
  const shot = async (name) => {
    const path = join(OUT, `${VIEWPORT}-${name}.png`)
    const buffer = await page.screenshot({ path, fullPage: true })
    shots[name] = createHash('sha256').update(buffer).digest('hex')
  }
  /*
   * THE PAGE IS WAITED FOR, NEVER SAMPLED ONCE, and that distinction cost a run.
   *
   * Reading the body the instant `load` fires asks the question before the
   * answer exists: this route streams, so the first text on screen is the
   * route's loading shell, 347 characters with no event title in it. The first
   * three-width run after full-page captures were added failed twice on exactly
   * that, once on the control at 768 and once on the refusal at 1440, and both
   * read as the product failing to render a page it renders perfectly well.
   *
   * So it waits for the event's own title, which is present in BOTH states being
   * proven, and on timeout returns whatever is there so the shell check below
   * reports the shell by name instead of this throwing something less useful.
   */
  const load = async () => {
    await page.goto(`${BASE}/events/${fixture.event.slug}`, { waitUntil: 'load', timeout: 120_000 })
    /*
     * POLLED ON THE EXACT STRING THE ASSERTIONS READ, which the first two
     * attempts at this were not. A locator filtered by text and awaited with
     * `waitFor({ state: 'attached' })` returned immediately on a page that was
     * still the 347 character loading shell, and the leg then failed at 1440
     * having "measured" a page that had not rendered. Waiting on one thing and
     * asserting on another is how a harness accuses a product.
     */
    const deadline = Date.now() + 60_000
    let text = ''
    for (;;) {
      text = await page.evaluate(() => document.body.innerText)
      if (text.length > 400 && text.includes(fixture.event.title)) return text
      if (Date.now() > deadline) return text
      await page.waitForTimeout(250)
    }
  }

  /* ── THE CONTROL: the same event, the same build, the same width, SELLING ── */

  const beforeText = await load()
  await shot('1-control-the-event-sells')

  /*
   * THE PAGE MUST BE A PAGE. A `next start` whose .next was rebuilt underneath
   * it serves an unstyled loading shell, and every assertion below would then be
   * true of a broken harness rather than of the product (the reason is written
   * out in lib/refund-proof-fixture.mjs). Length is the cheapest tell there is.
   */
  check(
    'the event page rendered rather than serving a loading shell',
    beforeText.length > 400 && beforeText.includes(fixture.event.title),
    `${beforeText.length} characters of text, title ${beforeText.includes(fixture.event.title) ? 'present' : 'ABSENT'}`,
  )
  check(
    'with a connected account the buyer is NOT told the organiser is unfinished',
    !REFUSAL.test(beforeText),
    'the refusal sentence is absent, so this page can sell',
  )
  check(
    'with a connected account the ticket is offered',
    beforeText.includes(fixture.tier.name),
    `tier "${fixture.tier.name}" ${beforeText.includes(fixture.tier.name) ? 'on the page' : 'NOT on the page'}`,
  )

  /* ── THE CHANGE: one organiser loses the connected account, nothing else ── */

  /*
   * THIS IS THE PRODUCT'S OWN DISCONNECTED ROW, not an approximation of one.
   * Every column and value below is DISCONNECTED_STATE from
   * src/lib/stripe/reconcile-connect.ts, which is what disconnectConnectedAccount
   * writes when an organiser really does disconnect, and it is written in ONE
   * update for the same reason the product does: a half-cleared row is a state
   * neither the product nor this proof should ever be able to produce.
   *
   * IT IS COPIED RATHER THAN IMPORTED, and that is a deliberate trade with a
   * stated cost. Importing the TypeScript would tie this proof to a module that
   * pulls in Stripe and the Sentry wrapper, and a proof that cannot start is
   * worth nothing (the same reasoning money-waived-fee-proof.mjs records for
   * isWaiverActive). The cost is that this set can lag the product's. The
   * readback below asserts the four columns the SALE GATE actually reads, so a
   * drift in the other four would cost accuracy in the record and never a false
   * pass.
   *
   * `payout_status: 'unset'` is the value migration 20260809000001 exists to
   * allow. It was rejected by TEST on 20 September 2026 with
   * "violates check constraint organisations_payout_status_check", because TEST
   * had the migration RECORDED as applied and did not have its effect, while
   * production did. TEST was brought back to the repository's shape before this
   * proof was believed.
   */
  const { error: stripErr } = await db
    .from('organisations')
    .update({
      stripe_account_id: null,
      stripe_onboarding_complete: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_country: null,
      stripe_capabilities: {},
      stripe_requirements: {},
      payout_destination: null,
      payout_status: 'unset',
    })
    .eq('id', fixture.org.id)
  if (stripErr) throw new Error(`could not remove the connected account: ${stripErr.message}`)

  const { data: after } = await db
    .from('organisations')
    .select('stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status')
    .eq('id', fixture.org.id)
    .maybeSingle()
  check(
    'the organisation now genuinely has no connected account, read back from the database',
    after != null &&
      after.stripe_account_id === null &&
      after.stripe_charges_enabled === false &&
      after.stripe_payouts_enabled === false,
    `stripe_account_id=${JSON.stringify(after?.stripe_account_id)} charges=${after?.stripe_charges_enabled} payouts=${after?.stripe_payouts_enabled} payout_status=${after?.payout_status}`,
  )

  /* ── THE REFUSAL, as the buyer meets it ── */

  const afterText = await load()
  await shot('2-refused-no-connected-account')

  check(
    'the event page still renders, so the buyer meets a refusal and not a broken page',
    afterText.length > 400 && afterText.includes(fixture.event.title),
    `${afterText.length} characters of text`,
  )
  check(
    'the buyer is told plainly that the organiser has not finished payment setup',
    REFUSAL.test(afterText),
    REFUSAL.test(afterText) ? 'the refusal sentence is on the page' : 'NO refusal sentence on the page',
  )
  check(
    'the ticket is no longer offered for sale',
    !afterText.includes(fixture.tier.name),
    `tier "${fixture.tier.name}" ${afterText.includes(fixture.tier.name) ? 'is STILL offered' : 'is not offered'}`,
  )

  /*
   * NO WAY TO PAY, not merely no tier. A tile, a link or a button that still
   * reaches checkout would be the defect wearing the refusal's clothes, so the
   * page's own anchors and buttons are enumerated rather than eyeballed.
   */
  const payRoutes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => /checkout|\/pay\b|purchase|\/order/i.test(h)),
  )
  check(
    'no control on the refused page leads to checkout',
    payRoutes.length === 0,
    payRoutes.length ? payRoutes.join(', ') : 'zero checkout links on the page',
  )

  /*
   * NO CONTROL MAY PROMISE A TICKET EITHER, and this is the check that found a
   * live defect rather than confirming one.
   *
   * The first passing run of this proof was believed on its report and then the
   * SCREENSHOT was read, which is the standing rule here. It showed the refusal
   * panel rendering correctly at the bottom of the page and, at the top of the
   * same page, a gold "Get tickets" button beside "From AUD $47.57" and an
   * "Only 10 left" pill. Three controls on the event page share one label, and
   * the label only asked whether the event was SOLD OUT, never whether it could
   * be sold at all. So an organiser who cannot be paid still had a button
   * promising a purchase, walking the buyer to a panel that refuses them.
   *
   * The text assertions above could not have caught it: "General Admission" is
   * genuinely absent and no href genuinely reaches checkout. It is the WORDS ON
   * THE BUTTON that lied, so the buttons are read by name.
   */
  const promises = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => /^(get|buy) tickets$|^join the waitlist$/i.test(t)),
  )
  check(
    'no control on the refused page promises a ticket it cannot sell',
    promises.length === 0,
    promises.length ? `control(s) reading: ${promises.join(' | ')}` : 'no control offers tickets or a waitlist',
  )

  /*
   * THE EVIDENCE MUST SHOW THE CHANGE. Two identical pictures cannot be a
   * before and an after, whatever the text assertions say, and at 390 and 768
   * that is exactly what the first run of this proof produced.
   */
  const control = shots['1-control-the-event-sells']
  const refused = shots['2-refused-no-connected-account']
  check(
    'the refused capture is a different picture from the selling one',
    Boolean(control) && Boolean(refused) && control !== refused,
    control === refused ? `both captures hash to ${String(control).slice(0, 16)}` : `${String(control).slice(0, 16)} then ${String(refused).slice(0, 16)}`,
  )

  /* The width this was measured at is recorded in the evidence, not assumed. */
  const measured = page.viewportSize()
  check(
    'the proof was taken at the width it claims',
    measured?.width === size.width,
    `viewport ${measured?.width}x${measured?.height} for ${VIEWPORT}`,
  )
} catch (cause) {
  check('the proof completed without throwing', false, cause instanceof Error ? cause.message : String(cause))
} finally {
  if (browser) await browser.close().catch(() => {})
  /*
   * THE FIXTURE IS PUBLISHED, SO IT IS ADVERTISED, SO IT MUST GO. A published
   * event left on the shared TEST project enters the sitemap and answers 404 the
   * moment its row is removed, which is what refused a push at the route sweep
   * on 14 September. Torn down here rather than by the next person.
   */
  try {
    await purgeFixtures(db, (line) => console.log(`${TAG} teardown: ${line}`), SLUG_PREFIX)
  } catch (cause) {
    check('the fixture was torn down', false, cause instanceof Error ? cause.message : String(cause))
  }
}

const failed = checks.filter((c) => !c.pass)
const report = {
  proof: 'MONEY FIX acceptance line 7: a purchase is refused when the organiser has no connected account',
  viewport: VIEWPORT,
  width: size.width,
  base: BASE,
  at: new Date().toISOString(),
  passed: checks.length - failed.length,
  total: checks.length,
  captureHashes: shots,
  checks,
}
writeFileSync(join(OUT, `${VIEWPORT}-report.json`), JSON.stringify(report, null, 2))
console.log(`${TAG} ${report.passed} of ${report.total} checks passed at ${VIEWPORT}. Evidence under ${OUT}`)
if (failed.length > 0) process.exit(1)
