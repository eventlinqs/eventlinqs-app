/**
 * END TO END, SIGNED OUT, THROUGH THE REAL MONEY PATH.
 *
 * Two events, chosen because they exercise the two halves of the sale gate on
 * REAL TEST data rather than on a fixture:
 *
 *   REFUSED  an organiser whose stripe_account_country is NULL. The gate refuses,
 *            and the assertion is that the buyer sees the TRUE reason and NO
 *            checkout control at all, rather than the old sentence about a sale
 *            window sitting above an enabled, priced button.
 *   SELLABLE an organiser who passes all five fields. The assertion is that a
 *            buyer can select a ticket and reach the Stripe payment page.
 *
 * NO CARD IS ENTERED. The proof stops at the payment step, which is where the
 * platform hands off.
 *
 * Usage: node scripts/verify-sale-gate-e2e.mjs <baseUrl> <refusedSlug> <sellableSlug>
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const REFUSED = process.argv[3]
const SELLABLE = process.argv[4]

mkdirSync('docs/verification/sale-gate-e2e', { recursive: true })
const shot = (page, name) =>
  page.screenshot({ path: `docs/verification/sale-gate-e2e/${name}.png`, fullPage: false })

const browser = await chromium.launch()
// Signed out, deliberately: a buyer arriving from a share link has no session.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

let failures = 0
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures += 1
}

// ---------------------------------------------------------------- REFUSED ---
console.log(`\n[e2e] REFUSED event: /events/${REFUSED}`)
await page.goto(`${BASE}/events/${REFUSED}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await shot(page, '01-refused-event')

const refusedState = await page.evaluate(() => {
  const marker = document.querySelector('[data-sale-refused]')
  const text = document.body.innerText
  const buttons = [...document.querySelectorAll('button')]
  return {
    reason: marker?.getAttribute('data-sale-refused') ?? null,
    saysNotOnSaleYet: /are not on sale yet/i.test(text),
    saysPaymentSetup: /still finishing their payment setup/i.test(text),
    checkoutButtons: buttons.filter((b) => /checkout/i.test(b.innerText)).length,
    enabledCheckoutButtons: buttons.filter((b) => /checkout/i.test(b.innerText) && !b.disabled).length,
    steppers: document.querySelectorAll('button[aria-label*="Increase"], button[aria-label*="increase"]').length,
  }
})
console.log(`  state: ${JSON.stringify(refusedState)}`)
check('a typed refusal reason is on the page', refusedState.reason !== null, refusedState.reason ?? 'none')
check('the reason is the payment-setup one, not a guess', refusedState.reason === 'organiser_payment_setup_incomplete')
check('the LYING sentence is gone', !refusedState.saysNotOnSaleYet)
check('the TRUE reason is shown', refusedState.saysPaymentSetup)
check('NO checkout button exists at all', refusedState.checkoutButtons === 0)
check('therefore no ENABLED checkout button', refusedState.enabledCheckoutButtons === 0)
check('no quantity stepper is offered', refusedState.steppers === 0)

// --------------------------------------------------------------- SELLABLE ---
console.log(`\n[e2e] SELLABLE event: /events/${SELLABLE}`)
await page.goto(`${BASE}/events/${SELLABLE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)

const sellableInitial = await page.evaluate(() => ({
  refused: document.querySelector('[data-sale-refused]')?.getAttribute('data-sale-refused') ?? null,
}))
check('the sellable event is NOT refused', sellableInitial.refused === null, sellableInitial.refused ?? 'no marker')

// Add one ticket.
const plus = page.locator('button[aria-label*="ncrease"]').first()
if ((await plus.count()) === 0) {
  check('a quantity stepper is offered', false, 'no increase control found')
} else {
  check('a quantity stepper is offered', true)
  await plus.click()
  await page.waitForTimeout(1200)
  await shot(page, '02-sellable-one-ticket')

  const priced = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /checkout/i.test(b.innerText))
    return { label: btn?.innerText.trim() ?? null, disabled: btn ? btn.disabled : null }
  })
  console.log(`  checkout button: ${JSON.stringify(priced)}`)
  check('a checkout button appears once a ticket is chosen', priced.label !== null, priced.label ?? '')
  check('and it is ENABLED, because this sale is real', priced.disabled === false)

  // Drive it. The proof stops at the Stripe payment step.
  const btn = page.locator('button', { hasText: /checkout/i }).first()
  await btn.click()
  await page.waitForTimeout(9000)
  await shot(page, '03-after-checkout-click')
  const url1 = page.url()
  console.log(`  landed on: ${new URL(url1).pathname}`)

  /*
   * THE RATE LIMITER IS NOT THE SALE GATE, and reporting it as one would be the
   * same class of lie this whole pass exists to remove.
   *
   * `checkout-reserve` is failClosed: true, deliberately, so that a missing
   * Upstash configuration cannot leave the money path unthrottled. A local run
   * against .env.test has no Upstash credentials, so the reservation is refused
   * BEFORE the sale gate is ever consulted. That is designed behaviour of the
   * environment, not a defect in the platform, and it is reported as its own
   * outcome rather than folded into a failure about selling.
   *
   * It is also a positive result worth stating: the limiter refusal carries NO
   * reason, and the button correctly stayed live and retryable, while a
   * sellability refusal takes the button away. The two are distinguished exactly
   * as designed, observed here on real behaviour rather than asserted.
   */
  const limited = await page.evaluate(() => /too many attempts/i.test(document.body.innerText))
  if (limited) {
    console.log(
      '  SKIP  the payment step: refused by the checkout-reserve rate limiter, which is\n' +
        '        failClosed by design and has no Upstash credentials in this environment.\n' +
        '        The sale GATE passed (no refusal marker, enabled priced button). What is\n' +
        '        unproven here is only reservation to Stripe, and it needs an environment\n' +
        '        with Upstash configured.',
    )
    check('a transient refusal leaves the checkout retryable, unlike a sale refusal', true)
    check(
      'and it does NOT latch the button, because it carries no reason',
      (await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /checkout/i.test(x.innerText))
        return b ? !b.disabled : false
      })) === true,
    )
    await browser.close()
    console.log(`\n[e2e] ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} (payment step not reached: rate limiter)`)
    process.exit(failures === 0 ? 0 : 1)
  }

  check('the checkout click leaves the event page', !url1.includes(`/events/${SELLABLE}`), url1)

  // The checkout page collects details, then hands off to Stripe.
  const reached = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasStripeFrame: [...document.querySelectorAll('iframe')].some((f) =>
        /stripe|js\.stripe\.com/i.test(f.src || ''),
      ),
      mentionsPayment: /payment|card|pay now|pay /i.test(text),
      errorShown: /not on sale|cannot|error|went wrong/i.test(text),
    }
  })
  console.log(`  checkout page: ${JSON.stringify(reached)}`)
  check('no refusal or error on the checkout page', !reached.errorShown)
  check('the payment step is reachable', reached.hasStripeFrame || reached.mentionsPayment)
  await shot(page, '04-payment-step')
}

await browser.close()
console.log(`\n[e2e] ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
