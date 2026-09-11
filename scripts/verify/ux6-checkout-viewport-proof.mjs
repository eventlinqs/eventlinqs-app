/**
 * THE BUYER'S SURFACES, MEASURED AT 390, 768 AND 1440 (close-out UX6).
 *
 * ------------------------------------------------------------------------
 * WHAT IT IS FOR. On 9 September 2026 the owner bought a real ticket on a real
 * phone (order EL-9HE57YNV, AUD 18.00). The payment worked and the ticket email
 * arrived. The LAYOUT did not: the payment summary was cut off at the right edge
 * at 390 and there was no way to scroll to it. UX6 makes that a launch blocker,
 * because it sits on the worst-converting device on the one screen that takes
 * money, and every advertising dollar spent while it is open buys a visit to a
 * checkout the buyer cannot finish.
 *
 * WHAT IT DOES. Walks the buyer path the way a person walks it, with a mouse and
 * a keyboard, at each of the three widths in turn, and at every stop measures
 * the page rather than looking at it:
 *
 *   1  the event page
 *   2  ticket selection, with more than one ticket, so the attendee block repeats
 *   3  checkout, the details step
 *   4  the payment step        (paid path only; needs a live Stripe TEST key)
 *   5  the confirmation        (free path: a real order, a real ticket)
 *   6  the bearer ticket view  /t/<code>?k=<secret>, exactly as the email links it
 *   7  /tickets                the signed-out answer, which a guest gets
 *
 * Every stop is also scanned with axe-core (WCAG 2.0/2.1 A and AA). This is the
 * only place checkout, the confirmation and a bearer ticket CAN be scanned:
 * scripts/axe-overnight.mjs covers the public pages and has no reservation, no
 * order and no ticket secret to reach these with. serious and critical fail;
 * moderate and minor are printed rather than swallowed.
 *
 * WHAT IT ASSERTS is defined once in ./lib/viewport-fit.mjs and is deliberately
 * stronger than "documentElement.scrollWidth <= innerWidth", because that number
 * CANNOT go red on this codebase: `html, body { overflow-x: clip }` in
 * globals.css makes scrollWidth equal clientWidth by definition, so oversized
 * content is silently cut off rather than scrolled to. Both are asserted. Read
 * the header of that file for the measurement that settled it.
 *
 * THE EVENTS ARE ENUMERATED, NEVER GUESSED. A slug typed into a script is a slug
 * that rots. The paid and free events are chosen by querying the database for a
 * published, unseated, currently sellable event with enough headroom left, and
 * the chosen slugs are printed so the run can be reproduced.
 *
 * IT REFUSES TO RUN AGAINST PRODUCTION. It buys tickets.
 *
 * Run:
 *   node scripts/verify/ux6-checkout-viewport-proof.mjs [baseUrl]
 *   UX6_OUT=C:\dev\EVIDENCE\UX6 node scripts/verify/ux6-checkout-viewport-proof.mjs http://localhost:3311
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, to pick
 * the events and to read the issued ticket back. UX6_WIDTHS overrides the widths
 * for a fast single-width iteration; the default is the three the law names.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEASURE_VIEWPORT_FIT, MEASURE_ORDER_TOTALS, judgeSurface } from './lib/viewport-fit.mjs'

const TAG = '[ux6]'
const BASE = (process.argv[2] || process.env.UX6_BASE || 'http://127.0.0.1:3311').replace(/\/$/, '')
const OUT = process.env.UX6_OUT || join(process.cwd(), '.tmp', 'ux6')
const WIDTHS = (process.env.UX6_WIDTHS || '390,768,1440').split(',').map((w) => Number(w.trim()))
/*
 * The widths BETWEEN the three the law names, where the header defect of
 * 10 September 2026 lived unseen. 1024 and 1280 are the two Tailwind
 * breakpoints the chrome now switches on, so they are the two places a
 * regression would land; 1100 sits between them, where nothing switches and the
 * old header was 172px past the edge; 1366 is a common laptop width.
 */
const CHROME_WIDTHS = (process.env.UX6_CHROME_WIDTHS || '1024,1100,1280,1366')
  .split(',')
  .map((w) => Number(w.trim()))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} refusing to run against production: this drive buys tickets`)
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`${TAG} FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`)
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const faults = []
const notes = []
/*
 * Whether this environment could reach the Stripe payment step at all. Read from
 * the environment rather than assumed, so the same script is strict on a preview
 * (where the key is real) and honest on a developer machine (where it is not).
 */
const STRIPE_CONFIGURED =
  /^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY ?? '') ||
  /* When the SERVER being driven is not this process - a Vercel preview, which
   * holds its own Stripe TEST key and never hands it back - the local
   * environment cannot answer the question. UX6_REQUIRE_PAYMENT_STEP=1 says so
   * explicitly, and it makes the run STRICTER rather than more forgiving, which
   * is the only direction a flag on a gate may point. */
  process.env.UX6_REQUIRE_PAYMENT_STEP === '1'
let paymentStepMeasured = 0
let paymentStepSkipped = 0
let axeScans = 0
let thirdPartyAxe = 0
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}
const note = (m) => {
  notes.push(m)
  console.log(`${TAG} ${m}`)
}

/* ------------------------------------------------------- pick the events */

/**
 * A published, unseated, currently sellable event whose tier still has room for
 * two. `free` picks a zero-price tier, otherwise a priced one. Returns the slug
 * or null, and NEVER a guess.
 */
async function pickEvent({ free }) {
  const { data: tiers, error } = await db
    .from('ticket_tiers')
    .select(
      'id, name, price, total_capacity, sold_count, reserved_count, max_per_order, is_active, is_visible, sale_start, sale_end, ' +
        'event:events!inner(slug, title, status, start_date, seat_map_id, external_ticket_url, ' +
        'organisation:organisations!inner(stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status))',
    )
    .eq('is_active', true)
    .eq('is_visible', true)
    .limit(1000)
  if (error) {
    fail(`could not read ticket tiers: ${error.message}`)
    return null
  }
  const now = Date.now()
  /*
   * THE PICKER APPLIES THE PRODUCT'S OWN SALE RULE, or it picks a page with no
   * ticket selector on it. On 12 September 2026 the gate's own run of this
   * drive chose kit-inspection-night-635605: published, priced, 250 places,
   * and owned by an organisation with no Stripe account, which the event page
   * correctly answers with "Tickets not yet on sale" and no quantity control.
   * The drive then failed three surfaces at every width, none of them a
   * defect. The rule mirrored here is `isOrganiserSellable` and
   * `isExternallyTicketed` in src/lib/payments/sale-status.ts and the tier
   * sale window it also reads: a connected account, charges enabled, payouts
   * enabled, an active payout status, a country on the account, no external
   * ticket URL, and a sale window that is open. A free event needs no Stripe
   * and is judged on the window alone.
   */
  const organiserCanSell = (o) =>
    Boolean(o?.stripe_account_id) &&
    o.stripe_charges_enabled === true &&
    o.stripe_payouts_enabled === true &&
    o.payout_status === 'active' &&
    typeof o.stripe_account_country === 'string' &&
    o.stripe_account_country.trim() !== ''
  const windowOpen = (t) =>
    !(t.sale_start && now < new Date(t.sale_start).getTime()) && !(t.sale_end && now > new Date(t.sale_end).getTime())
  const usable = (tiers ?? []).filter((t) => {
    const e = t.event
    if (!e || e.status !== 'published') return false
    if (e.seat_map_id) return false
    if (typeof e.external_ticket_url === 'string' && e.external_ticket_url.trim() !== '') return false
    if (new Date(e.start_date).getTime() <= now) return false
    if (!t.name || t.name.trim() === '') return false
    if (free ? t.price !== 0 : t.price <= 0) return false
    if (!free && !organiserCanSell(e.organisation)) return false
    if (!windowOpen(t)) return false
    if ((t.max_per_order ?? 1) < 2) return false
    const left = (t.total_capacity ?? 0) - (t.sold_count ?? 0) - (t.reserved_count ?? 0)
    return (t.total_capacity ?? 0) > 0 && left >= 4
  })
  usable.sort((a, b) => new Date(a.event.start_date) - new Date(b.event.start_date))
  return usable[0] ?? null
}

/* ------------------------------------------------------------ the driver */

function makePage(page, width, label) {
  return {
    async measure(surface, { totalRequired = false } = {}) {
      // The reversal condition UX6 names, answered the way it asks: webfonts that
      // land late move boxes, so the measurement WAITS for them rather than
      // carrying a tolerance. `.then(() => true)` because a FontFaceSet is not a
      // serialisable return value.
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await page.waitForTimeout(400)
      /*
       * INVOKED, not merely evaluated. page.evaluate given a STRING treats it as
       * an expression, so passing the arrow function's source returns the
       * FUNCTION and serialises it to undefined. Wrapping it in `(...)()` calls
       * it in the page. The first run of this drive died on exactly that, which
       * is the useful kind of failure: a measurement that returns nothing.
       */
      const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
      const totals = await page.evaluate(`(${MEASURE_ORDER_TOTALS})()`)
      const found = judgeSurface({ label: `${label}/${surface}`, width, fit, totals, totalRequired })
      for (const f of found) fail(f)
      const shot = join(OUT, `${width}`, `${label}-${surface}.png`)
      mkdirSync(join(OUT, `${width}`), { recursive: true })
      await page.screenshot({ path: shot, fullPage: true })
      /*
       * ACCESSIBILITY, ON THE SURFACES THAT HAD NONE.
       *
       * scripts/axe-overnight.mjs covers the public pages and cannot cover
       * checkout, the confirmation or a bearer ticket: each needs a real
       * reservation, a real order or a real secret, and it has none of those.
       * This walk has all three, so it is the only place these surfaces can be
       * scanned at all, and the COMPLETION LAW asks for axe on every surface an
       * item affects. serious and critical FAIL; moderate and minor are printed
       * rather than swallowed, so a lower-impact finding is visible without
       * being attributed to this item.
       */
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      /*
       * A THIRD-PARTY FRAME IS REPORTED, NOT JUDGED.
       *
       * Stripe's Payment Element and its hCaptcha render inside iframes Stripe
       * hosts. On 12 September 2026 the first run of this drive against a
       * preview holding a live TEST key found axe critical
       * "aria-required-children" on Stripe's own payment-method selector (a
       * <select> inside a role that does not permit one), inside
       * iframe[name^="__privateStripeFrame"], at 390 and 1440, and nowhere in
       * anything this platform authors. Nothing in this repository can change
       * that markup, so a fault there fails nothing the platform can fix, and a
       * gate that fails on what cannot be fixed is switched off within a week.
       *
       * So a violation whose every node sits inside a Stripe or hCaptcha frame
       * is PRINTED, COUNTED in the report and the verdict line, and not
       * swallowed; everything outside those frames is judged exactly as before.
       * The test is on the node target's first segment, which axe writes as the
       * frame element for anything found inside a frame.
       */
      const insideThirdPartyFrame = (n) => /^iframe\[name="?(__privateStripe|hcaptcha)/.test((n.target ?? [])[0] ?? '')
      const thirdParty = (v) => v.nodes.length > 0 && v.nodes.every(insideThirdPartyFrame)
      for (const v of axe.violations.filter(thirdParty)) {
        thirdPartyAxe += 1
        note(
          `${label}/${surface} @ ${width}: axe ${v.impact} "${v.id}" on ${v.nodes.length} node(s) INSIDE A THIRD-PARTY FRAME ` +
            `(${(v.nodes[0].target ?? []).join(' ')}): ${v.help}. Stripe's own markup, reported here and not judged.`,
        )
      }
      const ours = axe.violations.filter((v) => !thirdParty(v))
      const bad = ours.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      for (const v of bad) {
        /*
         * NAME THE NODES. This reported only a COUNT, and a count sends the
         * next reader guessing at which of a page's several hundred elements
         * axe meant - which is exactly what happened on 11 September 2026, when
         * "color-contrast on 2 node(s)" was pinned on a link added the same
         * hour and turned out to be neither that link nor that change. A check
         * that cannot say what it saw is half a check.
         */
        const where = v.nodes
          .slice(0, 4)
          .map((n) => `${(n.target ?? []).join(' ')} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 200)}`)
          .join(' || ')
        fail(
          `${label}/${surface} @ ${width}: axe ${v.impact} "${v.id}" on ${v.nodes.length} node(s): ${v.help} -> ${where}`,
        )
      }
      const lesser = ours.filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
      for (const v of lesser) {
        note(`${label}/${surface} @ ${width}: axe ${v.impact} "${v.id}" on ${v.nodes.length} node(s): ${v.help}`)
      }
      axeScans += 1

      const totalText = totals.map((t) => t.text).filter(Boolean).join(' | ') || 'none on this surface'
      console.log(
        `${TAG}   ${label}/${surface} @ ${width}: doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, ` +
          `${fit.faults.length} clipped, ${fit.exempt.length} exempt, ${ours.length} axe` +
          `${axe.violations.length > ours.length ? ` (+${axe.violations.length - ours.length} inside third-party frames)` : ''}, total ${totalText}`,
      )
      for (const e of fit.exempt) console.log(`${TAG}       exempt: ${e.selector} (${e.why})`)
      return { fit, totals }
    },
  }
}

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
      (e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
    )
    if (rx.test(name)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

/** The buyer path for one event, at one width. `label` names the path in output. */
async function walk({ browser, width, slug, label, complete }) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 1000 },
    isMobile: width < 500,
    hasTouch: width < 900,
    deviceScaleFactor: width < 500 ? 2 : 1,
    locale: 'en-AU',
  })
  const page = await ctx.newPage()
  const m = makePage(page, width, label)
  const stamp = String(Date.now()).slice(-7)
  const buyer = `ux6.${label}.${width}.${stamp}@example.com`
  let ticket = null
  try {
    const res = await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (res?.status() !== 200) fail(`${label} @ ${width}: the event page answered HTTP ${res?.status()}`)
    await page.waitForTimeout(2500)
    await m.measure('1-event-page')

    // Two tickets, through the real stepper, so the attendee block repeats.
    for (let i = 0; i < 2; i++) {
      const plus = await clickText(page, /^\+$/)
      if (!plus) {
        fail(`${label} @ ${width}: no quantity control on the event page`)
        break
      }
      await page.waitForTimeout(900)
    }
    /*
     * The all-in total block on ticket selection is rendered only when money is
     * at stake (`showAllIn = !allFree && subtotalCents > 0` in ticket-selector),
     * which is correct: a free event has no total to disclose under the ACCC
     * all-in rule. So it is REQUIRED on the paid path and merely measured on the
     * free one, rather than demanded everywhere and quietly relaxed later.
     */
    await m.measure('2-ticket-select', { totalRequired: label === 'paid' })

    const toCheckout =
      (await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed|register)/i))
    if (!toCheckout) {
      fail(`${label} @ ${width}: ticket selection offers no way to continue to checkout`)
      return
    }
    await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
    await page.waitForTimeout(4000)
    if (!/\/checkout\//.test(page.url())) {
      fail(`${label} @ ${width}: "${toCheckout}" did not reach checkout; ended on ${page.url().replace(BASE, '')}`)
      return
    }
    await m.measure('3-checkout-details', { totalRequired: true })

    await fillByLabel(page, /full name/i, 'Robin Ashe')
    await fillByLabel(page, /^email/i, buyer)
    await page.waitForTimeout(600)
    const reused = await clickText(page, /use my details for all tickets/i)
    if (!reused) {
      await fillByLabel(page, /first name/i, 'Robin')
      await fillByLabel(page, /last name/i, 'Ashe')
      for (const e of await page.$$('input[type="email"]')) await e.fill(buyer).catch(() => {})
    }
    await page.waitForTimeout(1200)
    await m.measure('4-checkout-filled', { totalRequired: true })

    const submitted =
      (await clickText(page, /^register for free/i)) ?? (await clickText(page, /^continue to payment/i))
    if (!submitted) {
      fail(`${label} @ ${width}: no way to submit the checkout details`)
      return
    }
    await page.waitForTimeout(9000)

    if (!complete) {
      // The paid path stops here: the payment step needs a live Stripe TEST key.
      const onPayment = await page.evaluate(() =>
        [...document.querySelectorAll('h3')].some((h) => /^payment$/i.test(h.textContent?.trim() ?? '')),
      )
      if (onPayment) {
        /*
         * WAIT FOR STRIPE TO PAINT, THEN ASK WHERE THE BUYER IS LOOKING.
         *
         * The first run of this drive against a preview with a live key
         * (12 September 2026) measured the step nine seconds after the click,
         * while Stripe's frame was still laying out: at 768 the capture held
         * a sliver of the fields, and at 390 the page had been dragged to the
         * Pay button by scroll anchoring as the skeleton and then the frame
         * inserted above the fold (scrollY 145 to 381 to 890, timed at 500ms
         * intervals). A buyer on a phone was left with every card field above
         * the top of the screen. So the step is measured only once Stripe has
         * painted an input, and the FIRST assertion is where the buyer is
         * looking: the Payment heading must be inside the viewport.
         */
        // `.first()`: once Link is present Stripe mounts a second frame with the
        // same title, and an unqualified locator is a strict-mode violation.
        const stripeFrame = page.frameLocator('iframe[title="Secure payment input frame"]').first()
        const t = Date.now()
        const painted = await stripeFrame
          .locator('input')
          .first()
          .waitFor({ state: 'visible', timeout: 45_000 })
          .then(() => true)
          .catch(() => false)
        if (!painted) fail(`${label} @ ${width}: Stripe's payment frame showed no input within 45s of the step appearing`)
        else note(`${label} @ ${width}: Stripe's payment frame painted ${Date.now() - t}ms after the step appeared`)
        // Scroll anchoring lands within the frame that grows the content; a beat
        // more so the measurement is of the settled page, never of the race.
        await page.waitForTimeout(1500)
        const where = await page.evaluate(() => {
          const h = [...document.querySelectorAll('h3')].find((x) => /^payment$/i.test(x.textContent?.trim() ?? ''))
          const r = h?.getBoundingClientRect()
          return { scrollY: Math.round(window.scrollY), headingTop: r ? Math.round(r.top) : null, innerHeight: window.innerHeight }
        })
        if (where.headingTop === null || where.headingTop < 0 || where.headingTop >= where.innerHeight) {
          fail(
            `${label} @ ${width}: after Stripe painted, the Payment heading sits ${where.headingTop}px from the top of a ` +
              `${where.innerHeight}px viewport (scrollY ${where.scrollY}). The buyer is not looking at the top of the payment ` +
              `step: the page moved as Stripe's frame grew above the fold, and the card fields are off the screen.`,
          )
        } else {
          note(`${label} @ ${width}: the buyer is looking at the top of the payment step (heading ${where.headingTop}px down, scrollY ${where.scrollY})`)
        }
        /*
         * WHAT THE BUYER SEES, as a viewport capture beside the full-page one.
         * Under mobile emulation a full-page capture does not paint the
         * cross-origin Stripe frame beyond the viewport (observed 12 September
         * 2026: a blank card where the fields are), so the full-page image
         * alone would send a reader looking for a defect that is not there.
         */
        mkdirSync(join(OUT, `${width}`), { recursive: true })
        await page.screenshot({ path: join(OUT, `${width}`, `${label}-5-payment-step-viewport.png`) })
        await m.measure('5-payment-step', { totalRequired: true })
        paymentStepMeasured += 1
      } else {
        const shown = await page.evaluate(() =>
          (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
        )
        /*
         * A LEG THAT WAS NOT WALKED IS NEVER A LEG THAT PASSED.
         *
         * The payment step needs a live PaymentIntent, which needs a working
         * Stripe secret. Where the environment HAS one, not reaching this step
         * is a FAULT: the surface UX6.1 is actually about would otherwise be the
         * one surface the proof never looks at, and the run would go green.
         * Where the environment has none, it is recorded as NOT EXERCISED, in
         * the verdict as well as the log, so nobody can read the exit code as
         * coverage it does not have.
         */
        if (STRIPE_CONFIGURED) {
          fail(
            `${label} @ ${width}: Stripe is configured here, so the payment step must be reachable, ` +
              `and it was not. On screen: "${shown}"`,
          )
        } else {
          paymentStepSkipped += 1
          note(
            `${label} @ ${width}: the payment step is NOT EXERCISED: no STRIPE_SECRET_KEY in this ` +
              `environment, so no PaymentIntent can be created. On screen: "${shown}"`,
          )
        }
      }
      return
    }

    await page.waitForURL(/\/orders\//, { timeout: 60_000 }).catch(() => {})
    if (!/\/orders\//.test(page.url())) {
      fail(
        `${label} @ ${width}: after submitting, the buyer is on ${page.url().replace(BASE, '')} rather than a confirmation`,
      )
      return
    }
    await page.waitForTimeout(3000)
    await m.measure('5-confirmation', { totalRequired: true })

    // The bearer ticket, reached exactly as the email links it: no sign in.
    const orderId = page.url().match(/\/orders\/([^/?]+)/)?.[1] ?? null
    if (!orderId) {
      fail(`${label} @ ${width}: could not read the order id out of ${page.url()}`)
      return
    }
    const { data: rows } = await db
      .from('tickets')
      .select('ticket_code, secret')
      .eq('order_id', orderId)
      .limit(1)
    ticket = rows?.[0] ?? null
    if (!ticket) {
      fail(`${label} @ ${width}: the order completed but no ticket row exists for ${orderId}`)
      return
    }
    const bearer = `${BASE}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
    const tRes = await page.goto(bearer, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (tRes?.status() !== 200) fail(`${label} @ ${width}: the bearer ticket link answered HTTP ${tRes?.status()}`)
    await page.waitForTimeout(2000)
    await m.measure('6-ticket-view')

    // And what a signed-out buyer gets from /tickets, which the email used to
    // send every guest to (close-out UX6.4).
    await page.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2000)
    await m.measure('7-tickets-signed-out')
    note(`${label} @ ${width}: /tickets signed out lands on ${page.url().replace(BASE, '')}`)
  } finally {
    await ctx.close()
  }
  return ticket
}

/**
 * THE SHARED CHROME, AT THE WIDTHS BETWEEN THE THREE THE LAW NAMES.
 *
 * WHY THIS EXISTS. UX6 names 390, 768 and 1440, and the full buyer walk runs at
 * all three. The header defect this drive found on its first run was laid out
 * off the right edge at 768 AND at 820, 900, 960, 1024 and 1100, and came inside
 * the viewport only at 1280. A regression re-introduced at 1100 would sit in the
 * gap between two of the three widths and pass, which is a gate with a hole in
 * the middle of it.
 *
 * It is a page LOAD per width rather than a walk, so closing the hole costs
 * seconds rather than doubling the step. The surface is the buyer's own event
 * page, because the chrome it carries is the chrome the buyer sees.
 */
async function measureChromeAcross({ browser, slug, widths }) {
  for (const width of widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 900,
      locale: 'en-AU',
    })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(2200)
      await makePage(page, width, 'chrome').measure('event-page')
    } finally {
      await ctx.close()
    }
  }
}

/* ---------------------------------------------------------------- the run */

mkdirSync(OUT, { recursive: true })
const paid = await pickEvent({ free: false })
const free = await pickEvent({ free: true })
if (!paid) fail('no published, unseated, sellable PAID event with room for two on this database')
if (!free) fail('no published, unseated, sellable FREE event with room for two on this database')
if (!paid || !free) {
  console.error(`${TAG} cannot drive without both events`)
  process.exit(1)
}
note(`base ${BASE}`)
note(`paid event: ${paid.event.slug} (tier "${paid.name}", ${paid.price} cents)`)
note(`free event: ${free.event.slug} (tier "${free.name}")`)
note(`widths: ${WIDTHS.join(', ')}`)

const browser = await chromium.launch()
try {
  for (const width of WIDTHS) {
    console.log(`\n${TAG} ================= ${width} =================`)
    await walk({ browser, width, slug: free.event.slug, label: 'free', complete: true })
    await walk({ browser, width, slug: paid.event.slug, label: 'paid', complete: false })
  }
  console.log(`
${TAG} ========== the chrome, between the three widths ==========`)
  await measureChromeAcross({ browser, slug: paid.event.slug, widths: CHROME_WIDTHS })
} finally {
  await browser.close()
}

const verdict =
  faults.length > 0
    ? 'FAIL'
    : paymentStepSkipped > 0
      ? 'PASS, WITH THE STRIPE PAYMENT STEP NOT EXERCISED'
      : 'PASS'
const report = {
  base: BASE,
  widths: WIDTHS,
  paidSlug: paid.event.slug,
  freeSlug: free.event.slug,
  stripeConfigured: STRIPE_CONFIGURED,
  axeScans,
  thirdPartyAxe,
  paymentStepMeasured,
  paymentStepSkipped,
  notes,
  faults,
  verdict,
}
writeFileSync(join(OUT, 'ux6-report.json'), JSON.stringify(report, null, 2))
console.log(`\n${TAG} ${faults.length} fault(s) across ${WIDTHS.length} width(s). Evidence: ${OUT}`)
console.log(
  `${TAG} payment step: ${paymentStepMeasured} measured, ${paymentStepSkipped} NOT EXERCISED ` +
    `(STRIPE_SECRET_KEY ${STRIPE_CONFIGURED ? 'present' : 'absent'})`,
)
console.log(`${TAG} axe: ${axeScans} scan(s), WCAG 2.0/2.1 A and AA; ${thirdPartyAxe} violation(s) inside third-party frames, reported and not judged`)
if (faults.length > 0) {
  console.error(`${TAG} FAIL`)
  process.exit(1)
}
if (paymentStepSkipped > 0) {
  console.log(`${TAG} ${verdict}`)
  console.log(
    `${TAG} every surface this environment can reach fits its viewport and shows its total. ` +
      `The Stripe payment step is UNMEASURED here and must be driven where a TEST key exists.`,
  )
  process.exit(0)
}
console.log(`${TAG} PASS - every buyer surface, payment step included, fits its viewport and shows its total.`)
