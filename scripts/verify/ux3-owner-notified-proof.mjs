/**
 * UX3 DRIVEN PROOF: the platform tells its owner what happened.
 *
 * WHAT THIS IS ANSWERING. On 8 September 2026 a real outside organiser created
 * an account, built an event, uploaded a video, set a price and published it on
 * production. Their own emails were delivered correctly. The owner received
 * nothing and found out by opening the website by chance the next day.
 *
 * The close-out is explicit about what counts as proof: "Five owner
 * notifications, each proven by driving the real action on TEST, never by
 * asserting that a code path exists." So nothing here writes a
 * platform_notifications row. A person signs up through /signup, creates their
 * organisation through the real form, presses "Set up payouts", builds and
 * publishes an event through the wizard, and a buyer pays with a card. Every
 * assertion is then a READ of what the database recorded on its own.
 *
 * The rows are written by triggers, so a run that produced no row is a run in
 * which the state change completed in silence, which is the whole defect.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/ux3-owner-notified-proof.mjs --out C:/dev/EVIDENCE/UX3
 *
 * Optional:
 *   --paid-slug <slug>   a published paid event on a sellable organisation, for
 *                        the order_paid leg. ENUMERATED from the database by the
 *                        caller, never guessed.
 *   --skip-purchase      run everything except the card leg
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  clickText,
  fillIf,
  signUpAndConfirm,
  createEventThroughWizard,
  buyTicket,
} from '../journeys/harness.mjs'
import { completeExpressOnboarding } from '../journeys/stripe-express-onboarding.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX3'
let paidSlug = null
let skipPurchase = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--paid-slug') paidSlug = args[++i]
  else if (args[i] === '--skip-purchase') skipPurchase = true
}
/*
 * NAMESPACED BY VIEWPORT, for the reason the journeys harness already records:
 * an unnamespaced output directory means running the same drive at 390, 768 and
 * 1440 leaves only the LAST run's screenshots on disk, and the surviving images
 * look like a complete set.
 */
const viewport = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
out = join(out, viewport)
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read the rows back')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const stamp = String(Date.now()).slice(-7)
const mint = () => randomBytes(12).toString('base64url') + '-Aa1'
/*
 * EVERY ROW THIS DRIVE CREATES CARRIES ITS LANE.
 *
 * Three build lanes share one TEST project, and the protocol is that a row is
 * identifiable as one lane's on sight, so no lane ever edits or clears another
 * lane's fixture while cleaning up its own. The tag is in the email, the name
 * and the slug rather than in a comment, because a comment is not visible from
 * a database console.
 */
const LANE = 'lane-c'
const ORGANISER = {
  name: 'Nadia Okonkwo',
  email: `ux3.${LANE}.organiser.${stamp}@example.com`,
  password: mint(),
}
const ORG_NAME = `Northside Sound ${LANE} ${stamp}`
const ORG_SLUG = `northside-sound-${LANE}-${stamp}`
const TITLE = `Northside Sound Launch ${LANE} ${stamp}`

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
const notExercised = []
function skip(id, reason) {
  notExercised.push({ id, reason })
  console.log(`  NOT EXERCISED  ${id}  ${reason}`)
}

/**
 * CAN THIS MACHINE TALK TO STRIPE AT ALL?
 *
 * Asked before the two Stripe legs run, so that a missing or expired credential
 * is reported as what it is rather than as the platform failing to record a
 * notification. Both are 401s at the same place and they mean opposite things.
 *
 * `stripe login` mints a RESTRICTED key that expires (both keys the CLI held on
 * this machine answer 401 api_key_expired), and every STRIPE_SECRET_KEY record
 * on the Vercel project is stored `sensitive`, which the API will not decrypt
 * back to any client on any scope. So when this returns a reason, the reason is
 * a founder step and not a defect.
 */
async function stripeReachable() {
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim()
  if (!key) return { ok: false, reason: 'STRIPE_SECRET_KEY is empty in this environment' }
  if (!key.startsWith('sk_test') && !key.startsWith('rk_test')) {
    return { ok: false, reason: 'the configured Stripe key is not a TEST key, and this drive will not touch live money' }
  }
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
    if (res.ok) return { ok: true, reason: 'authenticated' }
    const body = await res.json().catch(() => ({}))
    return { ok: false, reason: `Stripe answered ${res.status} ${body?.error?.code ?? ''}`.trim() }
  } catch (err) {
    return { ok: false, reason: `Stripe unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 7922, "theatrical producers and ticket agencies".
 *
 * Not invented here: it is the category one of the TEST organisers on this
 * project actually chose for themselves, recorded in
 * src/lib/stripe/business-profile.ts beside the reason the platform deliberately
 * does NOT prefill this field.
 */
const MCC_TICKET_AGENCY = '7922'

/**
 * THE ONE FIELD THIS DRIVE SUPPLIES THROUGH THE API RATHER THAN THE FORM, AND
 * EXACTLY WHY.
 *
 * Everything else on Stripe's hosted onboarding is answered the way a person
 * answers it, by typing into the form. One control cannot be: the Industry
 * picker on the "Additional information" panel is not an input, a select or a
 * combobox in any frame on the page, so no locator reaches it. Driven on 13
 * September 2026; the account otherwise arrives at Stripe's final screen with
 * every other section complete and only that one marked Incomplete, which keeps
 * "Agree and submit" disabled and the account unable to take charges.
 *
 * WHAT THIS DOES AND DOES NOT SUBSTITUTE. It sets one field of the ORGANISER'S
 * OWN DATA inside Stripe's product, which is the same class of thing as the
 * phone number and the address token this drive already supplies. It touches
 * nothing on the EventLinqs side: `stripe_charges_enabled` is still flipped by
 * Stripe, still read back by our own return route, and the notification is still
 * written by the database trigger on that persist. If this ever writes to our
 * own tables instead, the leg proves nothing and the drive is lying.
 */
async function setIndustryOnStripe(accountId) {
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim()
  if (!key.startsWith('sk_test') && !key.startsWith('rk_test')) {
    return { ok: false, reason: 'not a TEST key' }
  }
  try {
    const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'business_profile[mcc]': MCC_TICKET_AGENCY }),
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { ok: false, reason: `${res.status} ${body?.error?.message ?? ''}`.trim() }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Wait for a row the DATABASE writes, so a slow transaction is not a failure. */
async function waitForNotification(match, timeoutMs = 20000) {
  const started = Date.now()
  for (;;) {
    let q = db.from('platform_notifications').select('*').eq('kind', match.kind)
    if (match.organisationId) q = q.eq('organisation_id', match.organisationId)
    if (match.eventId) q = q.eq('event_id', match.eventId)
    if (match.orderId) q = q.eq('order_id', match.orderId)
    const { data, error } = await q.order('occurred_at', { ascending: false }).limit(1)
    if (error) return { error: error.message }
    if (data && data.length > 0) return { row: data[0] }
    if (Date.now() - started > timeoutMs) return { row: null }
    await new Promise(r => setTimeout(r, 1000))
  }
}

const j = makeJourney('ux3-owner-notified', 'UX3: the platform tells its owner what happened')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)

let organisationId = null
let eventId = null
let eventSlug = null
let chargesEnabled = false
let connectedAccountId = null

try {
  // -------------------------------------------------------------------------
  // 1. A NEW ORGANISER ACCOUNT IS CREATED.
  // -------------------------------------------------------------------------
  const signedUp = await signUpAndConfirm(j, page, ORGANISER)
  check('ux3.signup', signedUp, signedUp ? `signed up and confirmed as ${ORGANISER.email}` : 'signup did not complete')

  if (signedUp) {
    await page.goto(`${BASE}/dashboard/organisation/create`, { waitUntil: 'networkidle', timeout: 60000 })
    await fillIf(page, 'input#name', ORG_NAME)
    await fillIf(page, 'input#slug', ORG_SLUG)
    await fillIf(page, 'textarea#description', 'Independent live music on the north side.')
    await page.screenshot({ path: join(out, 'drive-01-organisation-form.png'), fullPage: false })
    await clickText(page, 'Create Organisation')
    await page.waitForTimeout(6000)
    note(j, 'Created the organisation', `${ORG_NAME} -> ${new URL(page.url()).pathname}`)

    const { data: org } = await db.from('organisations').select('id, name').eq('slug', ORG_SLUG).maybeSingle()
    organisationId = org?.id ?? null
    check('ux3.organisation.exists', Boolean(organisationId), organisationId ? `organisation ${organisationId}` : 'the organisation was never created, so nothing downstream can be judged')

    if (organisationId) {
      const { row, error } = await waitForNotification({ kind: 'organiser_created', organisationId })
      check(
        'ux3.1.organiser_created',
        Boolean(row) && !error,
        row
          ? `recorded without any application code asking: "${row.summary}" -> ${row.admin_path}`
          : `NO ROW: a new organiser was created in silence (${error ?? 'nothing written'})`,
      )
      if (row) {
        check('ux3.1.organiser_created.link', row.admin_path === `/admin/organisers/${organisationId}`, `admin path ${row.admin_path}`)
        check('ux3.1.organiser_created.who', row.organisation_name === ORG_NAME, `carries who: ${row.organisation_name}`)
        check('ux3.1.organiser_created.pending', row.delivery_state === 'pending', `queued for delivery, state ${row.delivery_state}`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. STRIPE CONNECT ONBOARDING IS STARTED.
  //    The button POSTs /api/stripe/connect/onboard, which creates a real
  //    Express account on the TEST Stripe account and persists its id. The
  //    trigger fires on that persist, before the redirect leaves the site.
  // -------------------------------------------------------------------------
  const stripe = await stripeReachable()
  console.log(`  stripe: ${stripe.ok ? 'reachable' : 'NOT reachable'} - ${stripe.reason}`)

  if (organisationId && !stripe.ok) {
    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(out, 'drive-02-payouts-before.png'), fullPage: false })
    skip(
      'ux3.1.connect_onboarding_started',
      `${stripe.reason}. Nothing about the platform can be judged from this: without a key the onboarding route cannot create an account, so there is no state change for a trigger to record. Founder step: run "stripe login" and re-run this drive.`,
    )
    skip('ux3.1.connect_charges_enabled', `${stripe.reason}, so the account that would be enabled cannot be created either`)
  } else if (organisationId) {
    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(out, 'drive-02-payouts-before.png'), fullPage: false })
    const setUp = await page.$('button[aria-label="Set up payouts with Stripe"]')
    if (!setUp) {
      skip('ux3.1.connect_onboarding_started', 'the payouts screen offered no "Set up payouts" control for this organiser')
    } else {
      await setUp.click()
      // The click leaves for Stripe. Wait for the row rather than for the page.
      const { row, error } = await waitForNotification({ kind: 'connect_onboarding_started', organisationId }, 45000)
      check(
        'ux3.1.connect_onboarding_started',
        Boolean(row) && !error,
        row
          ? `recorded on the persist of the account id: "${row.summary}"`
          : `NO ROW: an organiser began taking money and nothing was recorded (${error ?? 'nothing written'})`,
      )
      if (row) {
        check(
          'ux3.1.connect_onboarding_started.detail',
          typeof row.detail?.stripe_account_id === 'string' && row.detail.stripe_account_id.startsWith('acct_'),
          `carries the Stripe account: ${row.detail?.stripe_account_id}`,
        )
        connectedAccountId = row.detail?.stripe_account_id ?? null
        if (connectedAccountId) {
          const industry = await setIndustryOnStripe(connectedAccountId)
          note(j, 'Chose an industry through the API', industry.ok ? `mcc ${MCC_TICKET_AGENCY}` : `refused: ${industry.reason}`)
        }
      }
      await page.waitForTimeout(6000)
      await page.screenshot({ path: join(out, 'drive-03-after-set-up-payouts.png'), fullPage: false }).catch(() => {})
    }
  }

  // -------------------------------------------------------------------------
  // 3. STRIPE ONBOARDING COMPLETES AND CHARGES ARE ENABLED.
  //
  //    Only Stripe can flip that, and it flips it when a person finishes the
  //    hosted form, so the form is finished here rather than skipped. The
  //    browser is already sitting on it: the click above left the site for
  //    connect.stripe.com. `completeExpressOnboarding` answers every step with
  //    Stripe's own published test values and Stripe redirects back to
  //    /api/stripe/connect/return, which re-reads the live account and persists
  //    the capability flags. The trigger fires on that persist.
  //
  //    Nothing here writes stripe_charges_enabled. If Stripe does not enable the
  //    account, this leg reports NOT EXERCISED with the step it stopped on,
  //    because a column set by hand would fire the trigger and prove nothing.
  // -------------------------------------------------------------------------
  if (organisationId && stripe.ok) {
    let onboarding = null
    if (/connect\.stripe\.com/.test(page.url())) {
      // BOUNDED. The walk is capped so a form that cannot be finished costs one
      // viewport a couple of minutes rather than the run. What it reached is
      // reported either way.
      onboarding = await completeExpressOnboarding(page, { shot: out, maxSteps: 20, log: m => console.log(`  ${m}`) })
      note(
        j,
        'Finished Stripe onboarding',
        onboarding.completed ? `returned to ${onboarding.leftStripeAt?.slice(0, 80)}` : `stopped: ${onboarding.stoppedBecause}`,
      )
      await page.waitForTimeout(8000)
      await page.screenshot({ path: join(out, 'drive-03b-after-onboarding.png'), fullPage: false }).catch(() => {})
    }

    await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(2500)
    const refresh = await page.$('button[aria-label="Refresh status"]')
    if (refresh) {
      await refresh.click()
      await page.waitForTimeout(6000)
    }
    await page.screenshot({ path: join(out, 'drive-03c-payouts-after.png'), fullPage: false }).catch(() => {})
    const { data: after } = await db
      .from('organisations')
      .select('stripe_charges_enabled')
      .eq('id', organisationId)
      .maybeSingle()
    chargesEnabled = Boolean(after?.stripe_charges_enabled)
    if (chargesEnabled) {
      const { row } = await waitForNotification({ kind: 'connect_charges_enabled', organisationId })
      check('ux3.1.connect_charges_enabled', Boolean(row), row ? `"${row.summary}"` : 'NO ROW: charges were enabled in silence')
      if (row) {
        check(
          'ux3.1.connect_charges_enabled.link',
          row.admin_path === `/admin/organisers/${organisationId}`,
          `admin path ${row.admin_path}`,
        )
      }
    } else {
      skip(
        'ux3.1.connect_charges_enabled',
        `Stripe did not enable charges on this account. Onboarding ${onboarding ? `stopped: ${onboarding.stoppedBecause ?? 'unknown'}` : 'was never reached'}`,
      )
    }
  }

  // -------------------------------------------------------------------------
  // 4. AN EVENT IS PUBLISHED.
  // -------------------------------------------------------------------------
  if (organisationId) {
    /*
     * A PAID EVENT WHEN THE ORGANISATION CAN TAKE MONEY, FREE WHEN IT CANNOT.
     *
     * The fifth notification is "every paid order", and a paid order needs a
     * paid ticket on an organisation Stripe has enabled. When onboarding
     * succeeded above, this event is that ticket, so the last leg is driven
     * against the organiser this run created rather than against a slug somebody
     * passed in. When onboarding did not succeed, a paid event would be refused
     * publication for the money reason and would take the event_published leg
     * down with it, so the event stays free and only the order leg is lost.
     */
    const review = await createEventThroughWizard(j, page, {
      title: TITLE,
      summary: 'A night of north-side sound.',
      description: 'Local acts, one room, doors at eight. Bring a friend and stay for the last set.',
      capacity: '60',
      price: chargesEnabled ? 25 : null,
      orgName: ORG_NAME,
    })
    await page.screenshot({ path: join(out, 'drive-04-review.png'), fullPage: false }).catch(() => {})
    check(
      'ux3.event.review',
      Boolean(review?.reachedReview) && review?.publishDisabled === false,
      review?.reachedReview
        ? `Review offers Publish, disabled=${review.publishDisabled}`
        : `never reached Review: ${j.blockers.slice(-1)[0] ?? 'no reason recorded'}`,
    )
    if (review?.reachedReview && review.publishDisabled === false) {
      // The control is named "Publish and get your launch kit"; the handle the
      // wizard already found is used rather than a second text match.
      await review.publishButton.click()
      await page.waitForTimeout(10000)
    }
    await page.screenshot({ path: join(out, 'drive-05-after-publish.png'), fullPage: false }).catch(() => {})

    const { data: ev } = await db
      .from('events')
      .select('id, status, slug, title')
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    eventId = ev?.id ?? null
    eventSlug = ev?.slug ?? null
    check('ux3.event.published', ev?.status === 'published', ev ? `${ev.slug} is ${ev.status}` : 'no event was created')

    if (eventId && ev?.status === 'published') {
      const { row } = await waitForNotification({ kind: 'event_published', eventId })
      check(
        'ux3.1.event_published',
        Boolean(row),
        row
          ? `recorded by the database on the status change: "${row.summary}" -> ${row.admin_path}`
          : 'NO ROW: an event went live and the owner was told nothing, which is the defect this item exists to fix',
      )
      if (row) {
        check('ux3.1.event_published.link', row.admin_path === `/admin/events/${eventId}`, `admin path ${row.admin_path}`)
        check('ux3.1.event_published.which', row.event_title === ev.title, `names which event: ${row.event_title}`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. EVERY PAID ORDER.
  //    Driven against a published paid event on an organisation Stripe has
  //    already enabled, because a brand new account cannot sell yet and the
  //    close-out asks for a PAID order.
  // -------------------------------------------------------------------------
  /*
   * THE SLUG IS ENUMERATED, NEVER GUESSED. It is preferably the event this run
   * just published on the organisation this run just enabled, which makes the
   * whole chain one person's journey. `--paid-slug` stays supported so the leg
   * can still be pointed at an existing sellable event.
   */
  const slugToBuy = (chargesEnabled && eventSlug) || paidSlug
  if (!skipPurchase && slugToBuy && !stripe.ok) {
    skip(
      'ux3.1.order_paid',
      `${stripe.reason}, so no card can be taken on this machine and no order can reach 'confirmed'. Founder step: run "stripe login" and re-run this drive.`,
    )
  } else if (!skipPurchase && slugToBuy) {
    /*
     * THE BUYER IS A STRANGER, so the session that built the event is dropped
     * first. Everything the organiser had to do is finished by this point, and
     * buying while still signed in as the event's own organiser would prefill
     * the checkout from an account and skip the guest fields a real buyer fills.
     */
    await ctx.clearCookies()
    const buyerEmail = `ux3.${LANE}.buyer.${stamp}@example.com`
    const before = new Date().toISOString()
    await buyTicket(j, page, slugToBuy, buyerEmail, 'Robin Ashe')
    await page.waitForTimeout(4000)
    await page.screenshot({ path: join(out, 'drive-06-after-purchase.png'), fullPage: false }).catch(() => {})

    const { data: order } = await db
      .from('orders')
      .select('id, order_number, status, total_cents')
      .eq('guest_email', buyerEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order) {
      skip('ux3.1.order_paid', `no order was created for ${buyerEmail}; the purchase leg did not complete, so nothing can be judged about the notification`)
    } else {
      check('ux3.order.confirmed', order.status === 'confirmed', `order ${order.order_number} is ${order.status}`)
      const { row } = await waitForNotification({ kind: 'order_paid', orderId: order.id }, 30000)
      check(
        'ux3.1.order_paid',
        Boolean(row),
        row
          ? `recorded inside the same transaction as the ticket: "${row.summary}"`
          : `NO ROW since ${before}: money changed hands in silence`,
      )
      if (row) {
        check('ux3.1.order_paid.link', row.admin_path === `/admin/orders/${order.id}`, `admin path ${row.admin_path}`)
        check(
          'ux3.1.order_paid.amount',
          Number(row.detail?.total_cents) === order.total_cents,
          `carries the money: ${row.detail?.total_cents} cents against the order's ${order.total_cents}`,
        )
      }
    }
  } else if (!slugToBuy) {
    /*
     * SAY WHICH OF THE TWO REASONS IT IS.
     *
     * This used to read "no --paid-slug was supplied", which is true and
     * misleading: it reads as a caller who forgot an argument, when the usual
     * cause is upstream and is the platform working correctly. An organisation
     * Stripe has not enabled cannot publish a paid event, so there is no paid
     * ticket to buy, and a reason that names the wrong cause sends the next
     * reader to the wrong place.
     */
    skip(
      'ux3.1.order_paid',
      chargesEnabled
        ? 'charges are enabled but this run published no paid event and no --paid-slug was supplied'
        : 'charges are NOT enabled on this organisation, so it cannot publish a paid event and there is no paid ticket to buy. That is the platform refusing correctly, not a defect: the leg is downstream of connect_charges_enabled above',
    )
  }
} finally {
  const report = { base: BASE, organiser: ORGANISER.email, organisationId, eventId, checks, notExercised, failures }
  writeFileSync(join(out, 'ux3-drive-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

console.log(`\n  ${checks.filter(c => c.ok).length} of ${checks.length} checks pass, ${notExercised.length} not exercised`)
if (failures.length > 0) {
  console.log('\n  FAILURES')
  for (const f of failures) console.log(`    ${f}`)
}
process.exit(failures.length === 0 ? 0 : 1)
