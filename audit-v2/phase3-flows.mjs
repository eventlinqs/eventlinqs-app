// Phase 3: E2E buyer flow verification against production.
//
// Stripe is in TEST mode so no real money moves, but every flow writes
// real rows to the production Supabase. The script drives each flow as
// far as it can prove autonomously, captures the page state at each
// step, and stops short of mutations that would either require an
// interactive Stripe Dashboard step (Flow 4 refund, Flow 5 Connect) or
// reliably-flaky cross-iframe typing (Stripe Payment Element). Those
// final bits are marked REQUIRES MANUAL VERIFICATION in the report.
//
// Flow 1: paid event browse -> ticket select -> reserve -> /checkout
//         renders -> Stripe iframe present (card-submit manual).
// Flow 2: squad checkout - blocked, no squad-enabled events in DB
//         (data finding, not a code break).
// Flow 3: free event browse -> free CTA -> reservation -> /checkout
//         path (guest email capture).
//
// Output: audit-v2/evidence/phase3-flows.json + step screenshots.
import { chromium, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://www.eventlinqs.com'
const ROOT = path.resolve('audit-v2')
const SHOTS = path.join(ROOT, 'screenshots', 'phase3')
const RESULTS = path.join(ROOT, 'evidence', 'phase3-flows.json')

const PAID_EVENT_SLUG = 'lebanese-eid-festival-sydney-2027' // cheapest paid, $25 AUD
const FREE_EVENT_SLUG = 'filipino-fiesta-brisbane-sariwa-sunday' // free RSVP

const sleep = ms => new Promise(r => setTimeout(r, ms))
const safe = s => s.replace(/^\//,'root').replace(/[\/]/g,'_').replace(/[^a-z0-9_-]/gi,'-') || 'root'

async function newSession(browser, name) {
  const ctx = await browser.newContext({ ...devices['Desktop Chrome HiDPI'], viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const errors = { pageErrors: [], consoleErrors: [], badResponses: [] }
  page.on('pageerror', e => errors.pageErrors.push(String(e.message||e).slice(0,300)))
  page.on('console', m => { if (m.type()==='error') errors.consoleErrors.push(m.text().slice(0,300)) })
  page.on('response', r => { if (r.status()>=400) errors.badResponses.push({url:r.url(),status:r.status()}) })
  return { ctx, page, errors }
}

async function shoot(page, name) {
  const p = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false }).catch(()=>{})
  return path.relative(ROOT, p).replace(/\\/g,'/')
}

async function flow1Paid(browser) {
  const f = { id: 'flow-1-paid', name: 'Anonymous browse → paid event → checkout page renders', result: 'PENDING', steps: [], failurePoint: null }
  const { ctx, page, errors } = await newSession(browser, 'flow-1')
  try {
    f.steps.push({ at: 'navigate-to-event', url: BASE + '/events/' + PAID_EVENT_SLUG })
    const r = await page.goto(BASE + '/events/' + PAID_EVENT_SLUG, { waitUntil: 'domcontentloaded', timeout: 30000 })
    f.steps.at(-1).httpStatus = r ? r.status() : null
    await sleep(2000)
    f.steps.at(-1).screenshot = await shoot(page, 'flow1-01-event-page')
    const title = await page.title()
    f.steps.at(-1).pageTitle = title

    // Look for ticket selector / get-tickets CTA. The event detail page
    // renders ticket tiers inline with quantity steppers; the primary
    // action button text varies (Get tickets, Reserve, Continue).
    f.steps.push({ at: 'find-cta' })
    const ctaTexts = ['Get tickets', 'Buy tickets', 'Reserve', 'Continue to checkout', 'Continue', 'Checkout']
    let foundCta = null
    for (const t of ctaTexts) {
      const cnt = await page.getByRole('button', { name: new RegExp(t, 'i') }).count().catch(() => 0)
      if (cnt > 0) { foundCta = t; break }
    }
    f.steps.at(-1).foundCta = foundCta
    if (!foundCta) {
      // Scroll to find ticketing section
      await page.evaluate(() => window.scrollBy(0, 600))
      await sleep(1000)
      for (const t of ctaTexts) {
        const cnt = await page.getByRole('button', { name: new RegExp(t, 'i') }).count().catch(() => 0)
        if (cnt > 0) { foundCta = t; break }
      }
      f.steps.at(-1).foundCtaAfterScroll = foundCta
    }
    f.steps.at(-1).screenshot = await shoot(page, 'flow1-02-after-scroll')

    // Try to find ticket tier +/- buttons (the buy widget). Stop here if we
    // can't reach a checkout button - the page render itself is the audit
    // evidence; full checkout is in the prior-audit MEDIUM/manual layer.
    if (!foundCta) {
      f.result = 'PARTIAL'
      f.failurePoint = 'No purchase CTA visible on event detail page after scroll. Could be a published event with no on-sale tiers, or UI labels do not match probe set.'
      f.steps.push({ at: 'unable-to-proceed', note: f.failurePoint })
      return f
    }

    f.steps.push({ at: 'click-cta', ctaText: foundCta })
    await page.getByRole('button', { name: new RegExp(foundCta, 'i') }).first().click({ timeout: 5000 }).catch(e => { f.steps.at(-1).clickError = String(e.message).slice(0,200) })
    await sleep(3000)
    f.steps.at(-1).urlAfterClick = page.url()
    f.steps.at(-1).screenshot = await shoot(page, 'flow1-03-after-cta')

    // Check if we are on /checkout/...
    if (page.url().includes('/checkout/')) {
      f.steps.push({ at: 'on-checkout' })
      await sleep(3000)
      const reservationId = page.url().split('/checkout/')[1].split('/')[0].split('?')[0]
      f.steps.at(-1).reservationId = reservationId
      // Look for Stripe iframe
      const stripeFrames = page.frames().filter(fr => fr.url().includes('stripe.com') || fr.name().includes('Stripe'))
      f.steps.at(-1).stripeFramesPresent = stripeFrames.length
      f.steps.at(-1).stripeFrameUrls = stripeFrames.map(fr => fr.url().split('?')[0]).slice(0,5)
      f.steps.at(-1).screenshot = await shoot(page, 'flow1-04-checkout')
      f.result = 'PASS_PARTIAL'
      f.failurePoint = null
      f.steps.push({ at: 'stop-before-card-submit', note: 'Card-iframe typing intentionally not exercised: cross-iframe Stripe Element automation is unreliable; manual verification owed.' })
    } else {
      // Maybe redirected to login or a modal opened
      f.steps.push({ at: 'not-on-checkout', currentUrl: page.url() })
      f.steps.at(-1).screenshot = await shoot(page, 'flow1-04-not-checkout')
      f.result = 'PARTIAL'
      f.failurePoint = `Expected redirect to /checkout/[reservation_id] after CTA click, but landed on ${page.url()}`
    }
  } catch (e) {
    f.result = 'FAIL'
    f.failurePoint = `Exception: ${e.message?.slice(0,200) ?? e}`
  } finally {
    f.errors = errors
    await ctx.close()
  }
  return f
}

async function flow3Free(browser) {
  const f = { id: 'flow-3-free', name: 'Anonymous free RSVP → reservation', result: 'PENDING', steps: [], failurePoint: null }
  const { ctx, page, errors } = await newSession(browser, 'flow-3')
  try {
    f.steps.push({ at: 'navigate-to-free-event', url: BASE + '/events/' + FREE_EVENT_SLUG })
    const r = await page.goto(BASE + '/events/' + FREE_EVENT_SLUG, { waitUntil: 'domcontentloaded', timeout: 30000 })
    f.steps.at(-1).httpStatus = r ? r.status() : null
    await sleep(2000)
    f.steps.at(-1).pageTitle = await page.title()
    f.steps.at(-1).screenshot = await shoot(page, 'flow3-01-free-event')

    // Free CTAs differ: "Reserve", "RSVP", "Get free ticket", "Register"
    f.steps.push({ at: 'find-free-cta' })
    const ctaTexts = ['RSVP', 'Reserve', 'Get free', 'Get ticket', 'Register', 'Continue']
    let foundCta = null
    for (const t of ctaTexts) {
      const cnt = await page.getByRole('button', { name: new RegExp(t, 'i') }).count().catch(() => 0)
      if (cnt > 0) { foundCta = t; break }
    }
    if (!foundCta) {
      await page.evaluate(() => window.scrollBy(0, 600))
      await sleep(1000)
      for (const t of ctaTexts) {
        const cnt = await page.getByRole('button', { name: new RegExp(t, 'i') }).count().catch(() => 0)
        if (cnt > 0) { foundCta = t; break }
      }
    }
    f.steps.at(-1).foundCta = foundCta
    f.steps.at(-1).screenshot = await shoot(page, 'flow3-02-after-scroll')

    if (!foundCta) {
      f.result = 'PARTIAL'
      f.failurePoint = 'No free-event CTA found via probe set. Page rendered cleanly but interaction surface not detected.'
      return f
    }

    f.steps.push({ at: 'click-free-cta', ctaText: foundCta })
    await page.getByRole('button', { name: new RegExp(foundCta, 'i') }).first().click({ timeout: 5000 }).catch(e => { f.steps.at(-1).clickError = String(e.message).slice(0,200) })
    await sleep(3000)
    f.steps.at(-1).urlAfterClick = page.url()
    f.steps.at(-1).screenshot = await shoot(page, 'flow3-03-after-cta')

    if (page.url().includes('/checkout/')) {
      f.steps.push({ at: 'on-guest-email-capture' })
      const stripeFrames = page.frames().filter(fr => fr.url().includes('stripe.com'))
      f.steps.at(-1).stripeFramesPresent = stripeFrames.length
      f.steps.at(-1).note = stripeFrames.length === 0
        ? 'No Stripe iframe present (correct: free event does not need card collection); guest email form expected.'
        : 'Stripe iframe present on free event (unexpected if registerFreeTickets bypass intended).'
      f.steps.at(-1).screenshot = await shoot(page, 'flow3-04-guest-email')
      f.result = 'PASS_PARTIAL'
      f.failurePoint = null
      f.steps.push({ at: 'stop-before-email-submit', note: 'Guest email submit and Resend delivery confirmation deferred to manual verification.' })
    } else if (page.url().includes('/orders/') || page.url().includes('/account/tickets')) {
      f.steps.push({ at: 'on-confirmation', url: page.url() })
      f.steps.at(-1).screenshot = await shoot(page, 'flow3-04-confirmation')
      f.result = 'PASS_FULL'
    } else {
      f.steps.push({ at: 'unexpected-url', url: page.url() })
      f.steps.at(-1).screenshot = await shoot(page, 'flow3-04-unexpected')
      f.result = 'PARTIAL'
      f.failurePoint = `Unexpected destination ${page.url()} after free-CTA click.`
    }
  } catch (e) {
    f.result = 'FAIL'
    f.failurePoint = `Exception: ${e.message?.slice(0,200) ?? e}`
  } finally {
    f.errors = errors
    await ctx.close()
  }
  return f
}

async function main() {
  await mkdir(SHOTS, { recursive: true })
  await mkdir(path.dirname(RESULTS), { recursive: true })
  const browser = await chromium.launch()

  const flows = []
  console.log('=== FLOW 1: paid event browse → checkout ===')
  flows.push(await flow1Paid(browser))
  console.log(`  result: ${flows.at(-1).result}`)
  if (flows.at(-1).failurePoint) console.log(`  failure: ${flows.at(-1).failurePoint}`)

  console.log('\n=== FLOW 2: squad checkout ===')
  flows.push({
    id: 'flow-2-squad',
    name: 'Squad checkout',
    result: 'REQUIRES_MANUAL_VERIFICATION',
    failurePoint: 'No published events have squad_booking_enabled=true in production DB. Squad checkout cannot be E2E tested without first seeding a squad-enabled event or toggling the flag on an existing one. Code paths (handleSquadMemberPaymentSucceeded, squad completion flow) are static-verified in webhook handler.',
    steps: [{ at: 'data-check-only', note: 'DB query confirmed 0 squad-enabled events across all status filters.' }],
  })
  console.log(`  result: ${flows.at(-1).result}`)

  console.log('\n=== FLOW 3: free event RSVP ===')
  flows.push(await flow3Free(browser))
  console.log(`  result: ${flows.at(-1).result}`)
  if (flows.at(-1).failurePoint) console.log(`  failure: ${flows.at(-1).failurePoint}`)

  console.log('\n=== FLOW 4: refund ===')
  flows.push({
    id: 'flow-4-refund',
    name: 'Refund via Stripe Dashboard / admin panel',
    result: 'REQUIRES_MANUAL_VERIFICATION',
    failurePoint: 'Triggering a refund requires either Stripe Dashboard (out-of-band, manual) or the admin panel (requires admin auth + an existing test order). Webhook code path (charge.refunded, sendRefundConfirmationEmail) is static-verified.',
  })
  console.log(`  result: ${flows.at(-1).result}`)

  console.log('\n=== FLOW 5: organiser signup → Stripe Connect onboarding ===')
  flows.push({
    id: 'flow-5-connect',
    name: 'Organiser signup → Stripe Connect Express onboarding with test BSB',
    result: 'REQUIRES_MANUAL_VERIFICATION',
    failurePoint: 'Stripe Connect Express onboarding launches a Stripe-hosted onboarding flow on connect.stripe.com that requires interactive input of the test BSB (110-000) and account number (000123456) and the test verification documents. Cross-domain Stripe-hosted UI is not reliably automatable. Code path (api/stripe/connect/onboard, return, refresh) and handleConnectAccountUpdated webhook are static-verified.',
  })
  console.log(`  result: ${flows.at(-1).result}`)

  await browser.close()
  await writeFile(RESULTS, JSON.stringify(flows, null, 2))

  console.log('\n=== SUMMARY ===')
  for (const fl of flows) console.log(`  ${fl.result.padEnd(28)} ${fl.id} ${fl.name}`)
  console.log(`\nEvidence: ${RESULTS}`)
}

main().catch(e => { console.error(e); process.exit(1) })
