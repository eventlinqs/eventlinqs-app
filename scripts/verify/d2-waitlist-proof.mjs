/**
 * DRIVEN PROOF: A FREED PLACE IS OFFERED DOWN THE QUEUE, AND THE OFFER RUNS OUT.
 * Close-out D2, the acceptance line:
 *
 *     "Driven proof of waitlist: sell out, join, refund, confirm the email fires
 *      and the hold expires to the next person."
 *
 * ----------------------------------------------------------------------------
 * IT SELLS OUT FOR REAL, because there was no other way to get there honestly.
 * TEST carries no sold-out tier at all, and every nearly-sold-out one is PAID,
 * so buying the last place would need the Stripe TEST key this machine does not
 * have. So the drive builds what it needs, entirely through the interface:
 *
 *   1. a real organiser signs up at /signup and publishes a real event through
 *      the real wizard, with ONE free place;
 *   2. a real attendee takes that place through the real public checkout, which
 *      sells the tier out;
 *   3. two more real attendees join the real waiting list, in order.
 *
 * Nothing above is seeded. Every account, event, order and queue position is
 * produced by pressing what a person presses.
 *
 * ----------------------------------------------------------------------------
 * THE TRIGGER IS A REFUND, AND A REFUND IS A STRIPE CALL. Until 12 September
 * 2026 no working Stripe TEST key existed on this machine (both CLI keys
 * answered `api_key_expired`), so the release was produced by calling
 * `promoteWaitlist` directly through `d2-run-engine.mjs`, the same function the
 * webhook reaches, and Stripe's half was reported NOT EXERCISED.
 *
 * WITH A KEY IN THE ENVIRONMENT (STRIPE_SECRET_KEY, which
 * scripts/verify/d2-stripe-drive.mjs supplies from the CLI's own config beside
 * the matching publishable key and a `stripe listen` forwarder), the run is the
 * PAID one the close-out actually describes:
 *
 *   1. an organiser this drive MAKES: it signs up, creates its organisation and
 *      finishes Stripe's own hosted Express onboarding in real Chrome, so that
 *      STRIPE enables charges rather than a column being written by hand. Then
 *      it publishes a PAID event with one place. (Until 14 September 2026 this
 *      step borrowed an organisation off the shared TEST database and signed in
 *      through the forgot-password path; both halves failed on a machine three
 *      lanes write to, and the reasoning is at makeASellingOrganiser below.);
 *   2. a real attendee takes it with Stripe's test card, and the webhook
 *      confirms the order and issues the ticket;
 *   3. two more join the real waiting list, in order;
 *   4. the organiser REFUNDS the order through the real refund dialog on the
 *      order page; Stripe's `charge.refunded` arrives at the local route,
 *      `reconcile_refund` voids the ticket and returns the place, and the
 *      webhook's own `promoteWaitlist` offers it to the person who joined first.
 *
 * Without a key, the free run above is unchanged and Stripe's half is reported
 * NOT EXERCISED, exactly as before.
 *
 * Usage:
 *   BASE=... SERVER_LOG=... node --env-file=.env.local \
 *     scripts/verify/d2-waitlist-proof.mjs --out C:/dev/EVIDENCE/D2
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  fillIf,
  realChromeBrowser,
  signIn,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'
import { completeExpressOnboarding } from '../journeys/stripe-express-onboarding.mjs'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'
import { joinWaitlistThroughTheUi } from './lib/waitlist-join.mjs'
import { stripeFrameOn, payWithTestCard, waitForConfirmedOrder } from './lib/test-card.mjs'

const TAG = '[d2-waitlist]'
const SERVER_LOG = process.env.SERVER_LOG ?? '.tmp-serve.log'
/*
 * STRIPE'S HALF RUNS WHEN A KEY IS IN THE ENVIRONMENT. The drive that supplies
 * one (d2-stripe-drive.mjs) also starts `stripe listen` and writes its
 * redacted log beside the evidence, which is how this proof shows the refund
 * event actually arrived at the route rather than inferring it.
 */
const STRIPE_LEG = Boolean((process.env.STRIPE_SECRET_KEY ?? '').trim())

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D2'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
out = join(out, 'waitlist')
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} REFUSING: this is the PRODUCTION Supabase project and this drive WRITES.`)
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

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const PASSWORD = 'D2Waitlist!2026Proof'
/** Ticket agency. See the note at the API call in makeASellingOrganiser. */
const MCC_TICKET_AGENCY = '7922'
const LISTEN_LOG = join(out, '..', 'stripe-listen.log')

/*
 * AN ORGANISER WHO CAN SELL, MADE RATHER THAN BORROWED.
 *
 * WHAT THIS REPLACED, AND WHY. Until 14 September 2026 this proof ENUMERATED an
 * existing organisation off TEST that the charge precondition would accept
 * (src/lib/payments/sale-status.ts: a connected account, charges and payouts
 * enabled, an active payout status) whose owner had a synthetic address, and
 * then signed in as that person through the real forgot-password path, because
 * no password of theirs is on this machine. Both halves failed, on consecutive
 * runs, for reasons that were never going to go away:
 *
 *   - THE BORROW IS A RACE. TEST is shared by three build lanes, which churn
 *     organisations with synthetic owners seconds apart. The picker found one on
 *     the first attempt and none on the third: "no organisation with charges and
 *     payouts enabled and a synthetic owner".
 *   - THE SIGN-IN NEVER ESTABLISHED. The recovery link landed on
 *     /auth/reset-password with no inputs on the page.
 *
 * Both are the same mistake underneath: depending on a row this lane does not
 * own, and on a credential it never had. So the proof builds its own, through
 * the interface, the way a person would: sign up, create the organisation, and
 * finish Stripe's hosted Express onboarding so that STRIPE enables charges.
 *
 * NOTHING HERE WRITES stripe_charges_enabled. Only Stripe can set it, and it
 * does so when a person finishes that form; a column set by hand would fire the
 * trigger and prove nothing about the journey. The flag is read back OUT OF THE
 * DATABASE after the return, never assumed from a redirect.
 *
 * IT NEEDS REAL CHROME, AND ONLY FOR THIS LEG. Stripe's first onboarding step
 * carries an hCaptcha that refuses bundled headless Chromium for ever
 * ("Challenge expired. Please try again."); real Chrome with a persistent
 * profile is admitted. The harness exports exactly that under
 * JOURNEY_BROWSER=chrome, but it CANNOT be set for this whole proof: that
 * wrapper holds ONE context and deletes and recreates the Chrome profile on
 * every newContext() call, and this proof opens a context per person (the
 * organiser, the buyer, and each member of the queue). The first buyer context
 * would destroy the organiser's session. So the onboarding leg gets its own
 * real-Chrome browser, opened and closed around itself, and every other context
 * in this file stays on the bundled browser it has always used.
 */
async function makeASellingOrganiser() {
  const email = `d2-seller-${RUN}@example.com`
  const orgSlug = `lane-a-queue-proof-${RUN}`
  const orgName = `Lane A Queue Proof ${RUN}`

  const realChrome = realChromeBrowser()
  const ctx = await realChrome.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await attach(j, page)
  try {
    const signedUp = await signUpAndConfirm(j, page, { name: 'Ada Seller', email, password: PASSWORD })
    check('the-selling-organiser-signs-up', signedUp, signedUp ? email : (j.blockers.at(-1) ?? 'signup refused'))
    if (!signedUp) return null

    await page.goto(`${BASE}/dashboard/organisation/create`, { waitUntil: 'networkidle', timeout: 60_000 })
    await fillIf(page, 'input#name', orgName)
    await fillIf(page, 'input#slug', orgSlug)
    await fillIf(page, 'textarea#description', 'One place, and a queue behind it.')
    await clickText(page, /create organisation/i)
    await page.waitForTimeout(6000)
    const { data: org } = await db.from('organisations').select('id, name').eq('slug', orgSlug).maybeSingle()
    check('the-selling-organiser-has-an-organisation', Boolean(org?.id), org?.id ?? `no organisation at slug ${orgSlug}`)
    if (!org?.id) return null

    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(2500)
    const setUp = await page.$('button[aria-label="Set up payouts with Stripe"]')
    check('the-payouts-screen-offers-onboarding', Boolean(setUp), setUp ? 'Set up payouts with Stripe' : 'no control on /dashboard/payouts')
    if (!setUp) return null
    await setUp.click()
    await page.waitForTimeout(8000)
    await page.screenshot({ path: join(out, '00-connect-onboarding-start.png'), fullPage: false }).catch(() => {})

    /*
     * THE INDUSTRY IS CHOSEN THROUGH THE API, BEFORE THE FORM IS WALKED, exactly
     * as ux3-owner-notified-proof.mjs does it. Stripe's hosted form asks for an
     * industry in a searchable dropdown that a step walker cannot fill reliably,
     * and the platform deliberately does not prefill the field for real
     * organisers (the reason is in src/lib/stripe/business-profile.ts). Setting
     * it here removes that one step from the walk without touching what the
     * product does. 7922 is a category a real TEST organiser on this project
     * chose for itself, not an invention.
     */
    const { data: started } = await db
      .from('organisations')
      .select('stripe_account_id')
      .eq('id', org.id)
      .maybeSingle()
    const accountId = started?.stripe_account_id ?? null
    check(
      'the-onboarding-persisted-a-connected-account',
      typeof accountId === 'string' && accountId.startsWith('acct_'),
      accountId ?? 'no stripe_account_id on the organisation after the click',
    )
    if (accountId) {
      const key = (process.env.STRIPE_SECRET_KEY ?? '').trim()
      const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'business_profile[mcc]': MCC_TICKET_AGENCY }),
      }).catch(error => ({ ok: false, status: 0, error }))
      say(`${TAG}   industry set through the API: ${res.ok ? `mcc ${MCC_TICKET_AGENCY}` : `refused, HTTP ${res.status ?? '?'}`}`)
    }

    const onStripe = /connect\.stripe\.com/.test(page.url())
    check('the-organiser-reaches-stripes-hosted-form', onStripe, page.url().replace(/\?.*$/, ''))
    if (!onStripe) return null

    const onboarding = await completeExpressOnboarding(page, { shot: out, maxSteps: 40, log: m => say(`${TAG}   ${m}`) })
    check(
      'stripes-hosted-onboarding-completes',
      Boolean(onboarding?.completed),
      onboarding?.completed
        ? `returned to ${String(onboarding.leftStripeAt ?? '').slice(0, 90)}`
        : `stopped: ${onboarding?.stoppedBecause}`,
    )

    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(3000)
    const refresh = await page.$('button[aria-label="Refresh status"]')
    if (refresh) {
      await refresh.click()
      await page.waitForTimeout(6000)
    }

    /*
     * READ BACK OUT OF THE DATABASE, never off the screen and never off the
     * redirect. Stripe decides this, our return route persists what Stripe says,
     * and the only honest question is what the row holds afterwards.
     */
    const { data: after } = await db
      .from('organisations')
      .select('id, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status')
      .eq('id', org.id)
      .maybeSingle()
    const sellable =
      Boolean(after?.stripe_account_id) &&
      after?.stripe_charges_enabled === true &&
      after?.stripe_payouts_enabled === true &&
      after?.payout_status === 'active'
    check(
      'stripe-enabled-charges-for-the-organiser-this-drive-made',
      sellable,
      `account=${after?.stripe_account_id ?? 'none'} charges=${after?.stripe_charges_enabled} ` +
        `payouts=${after?.stripe_payouts_enabled} payout_status=${after?.payout_status}`,
    )
    if (!sellable) return null
    return { org: after, email }
  } finally {
    await realChrome.close().catch(() => {})
  }
}

/*
 * THE FORGOT-PASSWORD SIGN-IN WAS REMOVED ON 14 SEPTEMBER 2026, and the reason
 * is recorded so nobody restores it thinking it was an oversight.
 *
 * It existed only because this proof used to BORROW an organiser off the shared
 * TEST database, whose password is nobody here. It now makes its own, so it
 * knows the password and signs in the ordinary way. Driving a password reset was
 * never part of D2; it was the cost of the borrow.
 *
 * What it found on its way out is NOT lost and is not being claimed as a defect
 * either: the recovery link landed on /auth/reset-password showing "Validating
 * your reset link" with no inputs. Reading that page afterwards
 * (src/components/auth/reset-password-form.tsx) shows it does NOT park there:
 * it reads an expired-link error out of the fragment first, and where there is
 * neither a session nor a URL error it waits 4000ms and then says session_missing
 * with a way forward. This drive measured inside that window. If a drive is ever
 * put back on that path, wait past the timeout and take the verdict from what the
 * page then says, rather than from the spinner.
 */


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
const offersTo = address =>
  inbox().filter(m => m.to.toLowerCase() === address.toLowerCase() && /just opened up/i.test(m.subject))

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
    { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, EMAIL_TRANSPORT: 'console' } },
  )
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
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

/* =========================================================================
 * THE RUN
 * ====================================================================== */
const j = makeJourney('d2-waitlist', 'D2: a freed place goes down the queue')
say(`${TAG} against ${BASE}; the inbox is ${SERVER_LOG}`)
say(
  STRIPE_LEG
    ? `${TAG} a Stripe TEST key is in the environment: the place is PAID, taken with the test card, and freed by a real refund`
    : `${TAG} no Stripe key in the environment: the place is free and the release is the same function the webhook calls`,
)

const browser = await chromium.launch()
let slug = null
let eventId = null
let tierId = null
let firstOrderId = null
let orgCtx = null
let orgPage = null

let organiser = `d2-org-${RUN}@example.com`
const first = `d2-first-${RUN}@example.com`
const second = `d2-second-${RUN}@example.com`
const third = `d2-third-${RUN}@example.com`

try {
  /* ---- 1. A REAL ORGANISER, AND A REAL EVENT WITH ONE PLACE ---- */
  {
    orgCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await orgCtx.newPage()
    orgPage = page
    await attach(j, page)
    if (STRIPE_LEG) {
      /*
       * The organiser is MADE by this lane, in real Chrome, through Stripe's own
       * hosted onboarding, and only then is it signed in here on the bundled
       * browser every other context in this run uses. The sign-in is an ordinary
       * one because this drive chose the password: no recovery link, no row
       * borrowed off a database three lanes are writing to.
       */
      const seller = await makeASellingOrganiser()
      check(
        'an-organiser-who-can-take-a-charge-exists-because-this-drive-made-one',
        Boolean(seller),
        seller ? `"${seller.org.name}" (${seller.email}) on ${seller.org.stripe_account_id}` : 'the organiser could not be brought to a sellable state',
      )
      if (!seller) throw new Error('no selling organiser')
      organiser = seller.email
      const signedIn = await signIn(j, page, organiser, PASSWORD)
      check('the-organiser-signs-in', Boolean(signedIn), signedIn ? organiser : (j.blockers.at(-1) ?? 'sign-in refused'))
      if (!signedIn) throw new Error('organiser not signed in')
    } else {
      const signedUp = await signUpAndConfirm(j, page, { name: 'Ada Waitlist', email: organiser, password: PASSWORD })
      check('the-organiser-signs-up', signedUp, signedUp ? organiser : (j.blockers.at(-1) ?? 'signup refused'))
      if (!signedUp) throw new Error('no organiser')
    }

    const review = await createEventThroughWizard(j, page, {
      title: `Queue Proof Night ${RUN}`,
      summary: 'One place, and a queue behind it.',
      description: STRIPE_LEG
        ? 'A real event with a single paid place, so a real waiting list can form behind it and a real refund can free it.'
        : 'A real event with a single free place, so a real waiting list can form behind it.',
      price: STRIPE_LEG ? 5 : 0,
      capacity: '1',
    })
    check(
      'the-event-reaches-a-publishable-review',
      Boolean(review?.reachedReview) && review?.publishDisabled === false,
      review?.reachedReview ? `Review offers Publish, disabled=${review.publishDisabled}` : 'never reached Review',
    )
    if (!review?.reachedReview || review.publishDisabled !== false) throw new Error('could not publish')
    await review.publishButton.click()
    await page.waitForTimeout(9000)
    await page.screenshot({ path: join(out, '01-published.png'), fullPage: false }).catch(() => {})
    if (!STRIPE_LEG) {
      await orgCtx.close()
      orgCtx = null
      orgPage = null
    }
  }

  {
    const { data: created } = await db
      .from('events')
      .select('id, slug, status, title')
      .ilike('title', `Queue Proof Night ${RUN}%`)
      .maybeSingle()
    eventId = created?.id ?? null
    slug = created?.slug ?? null
    check('the-event-published', created?.status === 'published' && Boolean(slug), `status=${created?.status} slug=${slug}`)
    if (!eventId || !slug) throw new Error('the event did not publish')

    const { data: tier } = await db
      .from('ticket_tiers')
      .select('id, name, price, total_capacity, sold_count, reserved_count')
      .eq('event_id', eventId)
      .maybeSingle()
    tierId = tier?.id ?? null
    const wantPrice = STRIPE_LEG ? 500 : 0
    check(
      STRIPE_LEG ? 'the-tier-has-exactly-one-paid-place' : 'the-tier-has-exactly-one-free-place',
      tier?.price === wantPrice && (tier?.total_capacity ?? 0) === 1,
      `price=${tier?.price} (wanted ${wantPrice}) capacity=${tier?.total_capacity}`,
    )
  }

  /* ---- 2. A REAL ATTENDEE TAKES THE ONE PLACE, SELLING IT OUT ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2500)
    const plus = await clickText(page, /^\+$/)
    check('the-last-place-can-be-taken', Boolean(plus), plus ? 'the stepper answered' : 'no quantity control')
    await page.waitForTimeout(1200)
    const onward =
      (await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed|register)/i))
    await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    check('the-buyer-reaches-checkout', /\/checkout\//.test(page.url()), `"${onward}" -> ${page.url().replace(BASE, '')}`)

    await fillByLabel(page, /full name/i, 'Bo Early')
    await fillByLabel(page, /^email/i, first)
    await page.waitForTimeout(500)
    const reused = await clickText(page, /use my details for all tickets/i)
    if (!reused) {
      await fillByLabel(page, /first name/i, 'Bo')
      await fillByLabel(page, /last name/i, 'Early')
      for (const e of await page.$$('input[type="email"]')) await e.fill(first).catch(() => {})
    }
    await page.waitForTimeout(1000)
    if (STRIPE_LEG) {
      /*
       * THE PAID PLACE, TAKEN WITH THE TEST CARD. The judge is the database
       * after the webhook: an order the route confirmed and a ticket it issued.
       */
      const onward = await clickText(page, /^continue to payment/i)
      check('the-buyer-continues-to-payment', Boolean(onward), onward ?? 'no way to continue to payment')
      const painted = await stripeFrameOn(page)
      check('the-card-form-painted', painted, painted ? 'the Stripe payment frame is on the page' : 'no Stripe frame within 60s')
      await page.screenshot({ path: join(out, '02-card-form.png'), fullPage: true }).catch(() => {})
      const pressed = painted ? await payWithTestCard(page) : null
      check('the-buyer-pays-with-the-test-card', Boolean(pressed), pressed ?? 'no Pay button')
      await page.waitForURL(/\/orders\/[^/]+\/confirmation/, { timeout: 120_000 }).catch(() => {})
      firstOrderId = page.url().match(/\/orders\/([^/?]+)/)?.[1] ?? null
      check('stripe-sends-the-buyer-to-the-confirmation', Boolean(firstOrderId), page.url().replace(BASE, ''))
      if (firstOrderId) {
        const confirmed = await waitForConfirmedOrder(db, firstOrderId)
        check(
          'the-webhook-confirmed-the-order-and-issued-the-ticket',
          confirmed.status === 'confirmed' && confirmed.tickets > 0,
          `order ${firstOrderId}: status ${confirmed.status}, ${confirmed.tickets} ticket(s), total ${confirmed.totalCents ?? '?'} cents`,
        )
      }
      await page.waitForTimeout(2000)
    } else {
      const submitted = await clickText(page, /^register for free/i)
      check('the-free-place-is-taken', Boolean(submitted), submitted ?? 'no way to complete a free registration')
      await page.waitForTimeout(9000)
    }
    await page.screenshot({ path: join(out, '02-sold-out.png'), fullPage: false }).catch(() => {})
    await ctx.close()
  }

  {
    const { data: tier } = await db
      .from('ticket_tiers')
      .select('total_capacity, sold_count, reserved_count')
      .eq('id', tierId)
      .maybeSingle()
    const left = (tier?.total_capacity ?? 0) - (tier?.sold_count ?? 0) - (tier?.reserved_count ?? 0)
    check('the-tier-is-now-sold-out', left <= 0, `capacity ${tier?.total_capacity}, sold ${tier?.sold_count}, left ${left}`)
  }

  /* ---- 3. TWO REAL PEOPLE JOIN THE REAL WAITING LIST, IN ORDER ---- */
  for (const [address, who] of [
    [second, 'second'],
    [third, 'third'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    const signedUp = await signUpAndConfirm(j, page, {
      name: `Kit ${who}`,
      email: address,
      password: PASSWORD,
    })
    check(`the-${who}-person-signs-up`, signedUp, signedUp ? address : (j.blockers.at(-1) ?? 'signup refused'))
    if (!signedUp) {
      await ctx.close()
      continue
    }

    const queueLength = async () => {
      const { count } = await db
        .from('waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
      return count ?? 0
    }
    const wanted = (await queueLength()) + 1

    /*
     * THE JOIN ITSELF MOVED TO scripts/verify/lib/waitlist-join.mjs on
     * 14 September 2026 (close-out R1), unchanged in behaviour. R1 needs a queue
     * behind a sold-out place to prove that a refund issued OUTSIDE the
     * application still offers the freed place down the list, and the four
     * lessons this block paid for (the trigger matched instead of the modal
     * submit, the fixed-position click that never settles, the two coordinate
     * spaces, and the row that arrives at six seconds) are lessons a copy would
     * have inherited frozen. They are in that file's header, verbatim.
     */
    const attempt = await joinWaitlistThroughTheUi(page, {
      base: BASE,
      slug,
      queueLength,
      wanted,
      log: m => say(`${TAG}   ${m}`),
    })
    const { joined, confirmed, reach, queued } = attempt
    if (reach) {
      check(
        `the-${who}-can-actually-reach-the-join-button`,
        reach.reached,
        reach.reached
          ? `the button is the topmost element at ${Math.round(reach.x)},${Math.round(reach.y)}`
          : `covered by ${reach.topmost} at ${Math.round(reach.x)},${Math.round(reach.y)}`,
      )
    } else if (confirmed === null && joined === null) {
      check(`the-${who}-can-actually-reach-the-join-button`, false, 'no join control on the page at all')
    }
    await page.screenshot({ path: join(out, `03-joined-${who}.png`), fullPage: false }).catch(() => {})
    check(
      `the-${who}-person-joins-the-waiting-list`,
      attempt.ok,
      `"${joined ?? 'nothing to click'}"${confirmed ? ` then "${confirmed}"` : ' (joined directly, no dialog)'}; ` +
        `${queued} row(s) on the list, wanted ${wanted}`,
    )
    await ctx.close()

    /*
     * THE LEDGER ROW LANDS AFTER THE RESPONSE, by D1's reversal condition, so
     * the drive waits for THAT too before the next person joins. The queue is
     * ordered by when the demand row landed, and two rows racing would make the
     * "in join order" assertion a coin toss rather than a check.
     */
    const { data: slotSoFar } = await db.from('ledger_slots').select('id').eq('source_ref', eventId).maybeSingle()
    if (slotSoFar?.id) {
      for (let i = 0; i < 15; i += 1) {
        const { count } = await db
          .from('ledger_entries')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', slotSoFar.id)
          .eq('demand_action', 'waitlist_join')
        if ((count ?? 0) >= wanted) break
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  const { data: slotRow } = await db.from('ledger_slots').select('id').eq('source_ref', eventId).maybeSingle()
  const slotId = slotRow?.id ?? null
  check('the-ledger-knows-this-slot', Boolean(slotId), slotId ?? 'no slot')

  const { data: joins } = await db
    .from('ledger_entries')
    .select('id, contact_email, occurred_at, quantity, inventory_class')
    .eq('slot_id', slotId)
    .eq('demand_action', 'waitlist_join')
    .order('occurred_at', { ascending: true })
  const queue = (joins ?? []).map(r => r.contact_email)
  check(
    'the-queue-is-in-the-ledger-in-join-order',
    queue.length === 2 && queue[0] === second && queue[1] === third,
    `queue: ${queue.join(' then ') || 'empty'}`,
  )
  check(
    'the-queue-row-carries-what-the-offer-must-name',
    (joins ?? []).every(r => r.inventory_class && (r.quantity ?? 0) > 0),
    (joins ?? []).map(r => `${r.inventory_class} x${r.quantity}`).join(', ') || 'nothing recorded',
  )

  /* ---- 4. A PLACE FREES UP. ---- */
  if (STRIPE_LEG && orgPage && firstOrderId) {
    /*
     * THE REFUND, THROUGH THE ORGANISER'S OWN DIALOG. The list must offer the
     * order, the order page must carry the refund panel, and the panel is
     * measured at 390, 768 and 1440 before the refund is confirmed once at
     * 1440. Then Stripe's half: `charge.refunded` at the local route,
     * `reconcile_refund` completing the refund row, the ticket refunded, the
     * place back in inventory, and the webhook's own promotion of the queue.
     */
    await orgPage.goto(`${BASE}/dashboard/events/${eventId}/orders`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await orgPage.waitForTimeout(2500)
    const listed = await orgPage.$(`a[href*="/orders/${firstOrderId}"]`)
    check('the-organiser-sees-the-order-in-their-list', Boolean(listed), listed ? `a link to /orders/${firstOrderId}` : 'no link to the order on the orders page')
    await orgPage.screenshot({ path: join(out, '04-orders-list.png'), fullPage: true }).catch(() => {})

    for (const [w, h] of [
      [390, 844],
      [768, 1024],
      [1440, 1000],
    ]) {
      await orgPage.setViewportSize({ width: w, height: h })
      await orgPage.goto(`${BASE}/dashboard/events/${eventId}/orders/${firstOrderId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      await orgPage.waitForTimeout(2000)
      await orgPage.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
      const fit = await orgPage.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
      const faults = judgeSurface({ label: `refund-dialog@${w}`, width: w, fit, totals: [], totalRequired: false })
      const offers = await orgPage.locator('label:has-text("Refund all remaining tickets") input[type="checkbox"]').count()
      await orgPage.screenshot({ path: join(out, `04-refund-dialog-${w}.png`), fullPage: true }).catch(() => {})
      check(
        `the-refund-panel-is-on-the-order-page@${w}`,
        offers === 1,
        offers === 1 ? 'offers every remaining ticket' : `${offers} "refund all" control(s)`,
      )
      check(
        `fit-refund-dialog@${w}`,
        fit.innerWidth === w && faults.length === 0,
        faults.length === 0 ? `doc.scrollWidth ${fit.docScrollWidth}/${fit.innerWidth}, 0 clipped` : faults.join(' // '),
      )
    }

    const all = orgPage.locator('label:has-text("Refund all remaining tickets") input[type="checkbox"]').first()
    await all.check().catch(() => {})
    const review = await clickText(orgPage, /^review refund$/i)
    check('the-organiser-reviews-the-refund', Boolean(review), review ?? 'no Review refund button')
    await orgPage.waitForTimeout(800)
    const warned = await orgPage.locator('text=This cannot be undone').count()
    check('the-confirm-step-says-it-cannot-be-undone', warned > 0, warned > 0 ? 'the sentence is on the page' : 'no irreversibility sentence')
    await orgPage.screenshot({ path: join(out, '04-refund-confirm-1440.png'), fullPage: true }).catch(() => {})
    const confirmed = await clickText(orgPage, /^confirm refund$/i)
    check('the-organiser-confirms-the-refund', Boolean(confirmed), confirmed ?? 'no Confirm refund button')
    let startedAtStripe = false
    for (let i = 0; i < 30 && !startedAtStripe; i += 1) {
      startedAtStripe = (await orgPage.locator('text=Refund started').count()) > 0
      if (!startedAtStripe) await orgPage.waitForTimeout(1000)
    }
    check('the-dialog-says-the-refund-went-to-stripe', startedAtStripe, startedAtStripe ? '"Refund started"' : 'the dialog never said Refund started')
    await orgPage.screenshot({ path: join(out, '04-refund-started-1440.png'), fullPage: true }).catch(() => {})

    let refundRow = null
    let tierAfter = null
    for (let i = 0; i < 40; i += 1) {
      const { data: r } = await db
        .from('refunds')
        .select('id, status, stripe_refund_id, processed_at')
        .eq('order_id', firstOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      refundRow = r ?? null
      const { data: t } = await db
        .from('ticket_tiers')
        .select('total_capacity, sold_count, reserved_count')
        .eq('id', tierId)
        .maybeSingle()
      tierAfter = t ?? null
      if (refundRow?.status === 'completed') break
      await new Promise(r => setTimeout(r, 3000))
    }
    check(
      'stripe-confirmed-the-refund-and-reconcile-completed-it',
      refundRow?.status === 'completed' && Boolean(refundRow?.stripe_refund_id),
      `refund ${refundRow?.id ?? 'none'}: status ${refundRow?.status ?? 'none'}, stripe refund id ${refundRow?.stripe_refund_id ? 'recorded' : 'absent'}, processed_at ${refundRow?.processed_at ?? 'null'}`,
    )
    const { data: tk } = await db.from('tickets').select('status').eq('order_id', firstOrderId)
    check(
      'the-refunded-ticket-stops-admitting',
      (tk ?? []).length > 0 && (tk ?? []).every(t => t.status === 'refunded'),
      (tk ?? []).map(t => t.status).join(', ') || 'no ticket rows',
    )
    check(
      'the-place-returns-to-inventory',
      Boolean(tierAfter) && tierAfter.sold_count === 0,
      `capacity ${tierAfter?.total_capacity}, sold ${tierAfter?.sold_count}, reserved ${tierAfter?.reserved_count}`,
    )
    const listenText = existsSync(LISTEN_LOG) ? readFileSync(LISTEN_LOG, 'utf8') : ''
    check(
      'charge.refunded-reached-the-local-route',
      /charge\.refunded/.test(listenText) && /\[200\]\s+POST/.test(listenText),
      existsSync(LISTEN_LOG)
        ? `${(listenText.match(/charge\.refunded/g) ?? []).length} charge.refunded line(s), ${(listenText.match(/\[200\]\s+POST/g) ?? []).length} accepted POST(s) in ${LISTEN_LOG}`
        : `no stripe listen log at ${LISTEN_LOG}`,
    )
    for (let i = 0; i < 30 && offersTo(second).length === 0; i += 1) await new Promise(r => setTimeout(r, 1000))
    say(`${TAG} the release came through Stripe's charge.refunded and the webhook's own promotion of the queue`)
  } else {
    if (STRIPE_LEG) check('the-refund-could-be-driven', false, 'a Stripe key was present but no paid order or organiser page exists to refund')
    // The same call the refund webhook makes, without Stripe's half.
    const promoted = engine('promote', '--event', eventId, '--tier', tierId, '--units', '1')
    say(`${TAG} the release said: ${JSON.stringify(promoted.parsed ?? promoted.text.slice(0, 400))}`)
    await new Promise(r => setTimeout(r, 1500))
  }

  check(
    'the-offer-goes-to-the-person-who-joined-first',
    offersTo(second).length === 1,
    offersTo(second).length === 1 ? `subject "${offersTo(second)[0].subject}"` : `${offersTo(second).length} offer(s)`,
  )
  check(
    'and-not-to-the-person-behind-them',
    offersTo(third).length === 0,
    `${offersTo(third).length} offer(s) to the third person`,
  )
  if (offersTo(second).length === 1) {
    const offer = offersTo(second)[0]
    check(
      'the-offer-links-somewhere-they-can-claim-it',
      offer.links.some(l => l.includes(`/events/${slug}`)),
      offer.links.join(' | ') || 'no links',
    )
    check(
      'the-offer-carries-a-way-to-stop',
      offer.links.some(l => l.includes('/unsubscribe/recovery/')),
      offer.links.find(l => l.includes('/unsubscribe/recovery/')) ?? 'no stop link',
    )
  }

  const { data: holds } = await db
    .from('recovery_holds')
    .select('id, contact_email, units, expires_at, claimed_at, released_at, demand_entry_id')
    .eq('slot_id', slotId)
  check(
    'the-offer-is-recorded-with-the-moment-it-runs-out',
    (holds ?? []).length === 1 && Boolean(holds[0].expires_at) && Number(holds[0].demand_entry_id) > 0,
    (holds ?? []).map(h => `${h.contact_email} until ${h.expires_at} (entry ${h.demand_entry_id})`).join(', ') || 'no hold',
  )

  /* ---- 5. NOTHING HAPPENS TWICE ---- */
  const beforeRepeat = offersTo(second).length + offersTo(third).length
  engine('activate', '--slot', slotId, '--units', '1')
  await new Promise(r => setTimeout(r, 1200))
  check(
    'a-second-sweep-inside-the-window-offers-nobody-else',
    offersTo(second).length + offersTo(third).length === beforeRepeat,
    `offers ${beforeRepeat} -> ${offersTo(second).length + offersTo(third).length}`,
  )

  /* ---- 6. THE HOLD RUNS OUT AND THE PLACE PASSES DOWN THE LIST ---- */
  const lapsed = engine('activate', '--slot', slotId, '--units', '1', '--hours-ahead', '1')
  say(`${TAG} an hour later: ${JSON.stringify(lapsed.parsed ?? lapsed.text.slice(0, 400))}`)
  await new Promise(r => setTimeout(r, 1500))

  check(
    'the-hold-that-ran-out-is-handed-back',
    (lapsed.parsed?.released ?? 0) === 1,
    `released ${lapsed.parsed?.released}, offered ${lapsed.parsed?.offered}`,
  )
  check(
    'and-the-place-passes-to-the-next-person',
    offersTo(third).length === 1,
    offersTo(third).length === 1 ? `subject "${offersTo(third)[0].subject}"` : `${offersTo(third).length} offer(s)`,
  )
  check(
    'the-person-whose-turn-ran-out-is-not-offered-it-again',
    offersTo(second).length === 1,
    `${offersTo(second).length} offer(s) to the first person`,
  )

  const { data: afterHolds } = await db
    .from('recovery_holds')
    .select('contact_email, released_at, expires_at')
    .eq('slot_id', slotId)
    .order('id', { ascending: true })
  check(
    'both-outcomes-are-on-the-record',
    (afterHolds ?? []).length === 2 && Boolean(afterHolds[0].released_at) && !afterHolds[1].released_at,
    (afterHolds ?? [])
      .map(h => `${h.contact_email}: ${h.released_at ? `released ${h.released_at}` : `holding until ${h.expires_at}`}`)
      .join(' | ') || 'no holds',
  )

  /* ---- 7. AND IT STOPS. There is nobody else in the queue. ---- */
  const beforeEnd = offersTo(second).length + offersTo(third).length
  engine('activate', '--slot', slotId, '--units', '1', '--hours-ahead', '2')
  await new Promise(r => setTimeout(r, 1200))
  check(
    'when-the-queue-is-exhausted-nobody-is-written-to-again',
    offersTo(second).length + offersTo(third).length === beforeEnd,
    `offers ${beforeEnd} -> ${offersTo(second).length + offersTo(third).length}`,
  )
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
  checks.push({ id: 'the-run-completed', pass: false, detail: String(cause) })
} finally {
  if (orgCtx) await orgCtx.close().catch(() => {})
  await browser.close()
}

const failed = checks.filter(c => !c.pass)
say('')
if (!STRIPE_LEG) {
  say(`${TAG} Stripe's half of the refund: NOT EXERCISED (no STRIPE_SECRET_KEY in the environment; run scripts/verify/d2-stripe-drive.mjs)`)
}
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
note(j, 'waitlist proof finished', `${checks.length - failed.length}/${checks.length}`)
writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify(checks, null, 2), 'utf8')

if (failed.length > 0) process.exit(1)
console.log(`${TAG} every check passed.`)
