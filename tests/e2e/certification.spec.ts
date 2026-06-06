/**
 * Launch-certification E2E harness - the full buyer journey plus failure
 * drills, run against a real wired deployment (staging by default).
 *
 * Run:
 *   CERT_BASE_URL=https://staging.eventlinqs.com \
 *   CERT_PAID_EVENT_SLUG=<paid-event-with-connected-stripe> \
 *   CERT_FREE_EVENT_SLUG=<free-event> \
 *   CERT_EXPIRED_RESERVATION_ID=<id of a reservation past its 10-min TTL> \
 *   npx playwright test --config playwright.certification.config.ts
 *
 * Every scenario gates on the env it needs and skips with a clear message when
 * that env is absent, so the suite is safe to run with partial config and
 * safe to leave in the repo (it is excluded from the default Playwright suite
 * and from CI; see playwright.config.ts testIgnore).
 *
 * Selector note: per the no-buyer-component rule this harness adds no
 * data-testids. It targets accessible names (roles, labels, visible text).
 * The one best-effort area is the Stripe Payment Element iframe; if Stripe
 * ships a markup change, only fillStripeCard() needs adjusting. Full mapping
 * of routes and selectors is in docs/launch-hardening/certification.md.
 */
import { test, expect, type Page, type FrameLocator } from '@playwright/test'

const CONFIG = {
  baseUrl: process.env.CERT_BASE_URL,
  paidEventSlug: process.env.CERT_PAID_EVENT_SLUG,
  freeEventSlug: process.env.CERT_FREE_EVENT_SLUG,
  expiredReservationId: process.env.CERT_EXPIRED_RESERVATION_ID,
  buyerEmail: process.env.CERT_BUYER_EMAIL ?? `cert+${Date.now()}@eventlinqs.test`,
  buyerName: process.env.CERT_BUYER_NAME ?? 'Cert Buyer',
}

// Stripe test cards (test mode only). https://docs.stripe.com/testing
const CARD_SUCCESS = '4242 4242 4242 4242'
const CARD_DECLINE = '4000 0000 0000 0002'
const CARD_EXP = '12 / 34'
const CARD_CVC = '123'

// ── helpers ─────────────────────────────────────────────────────────────────

/** The Payment Element renders its fields inside a Stripe iframe. */
function stripeFrame(page: Page): FrameLocator {
  // Stripe's Payment Element iframe. The title is the most stable hook; fall
  // back to the private-frame name if Stripe changes the title.
  return page
    .frameLocator(
      'iframe[title*="payment" i], iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]',
    )
    .first()
}

async function fillStripeCard(page: Page, cardNumber: string): Promise<void> {
  const frame = stripeFrame(page)
  await frame.getByLabel(/card number/i).fill(cardNumber)
  await frame.getByLabel(/expir/i).fill(CARD_EXP)
  await frame.getByLabel(/cvc|security code|cvv/i).fill(CARD_CVC)
  // Some Payment Element configs show a postal code field; fill if present.
  const postal = frame.getByLabel(/postal|zip/i)
  if (await postal.count()) await postal.fill('3000')
}

/** Fill the buyer name + email on the checkout page (semantic labels). */
async function fillBuyerDetails(page: Page): Promise<void> {
  const name = page.getByLabel(/full name|your name|^name/i).first()
  if (await name.count()) await name.fill(CONFIG.buyerName)
  const email = page.getByLabel(/email/i).first()
  if (await email.count()) await email.fill(CONFIG.buyerEmail)
}

/**
 * On an event detail page, add one ticket of the first available tier and
 * advance. Tier steppers carry no test-id, so this is best-effort: bump the
 * first increment control if a default quantity is not preselected, then click
 * the primary "Get tickets" / "Register" CTA.
 */
async function addOneTicketAndProceed(page: Page): Promise<void> {
  const increment = page
    .getByRole('button', { name: /increase|add one|plus|\+/i })
    .first()
  if (await increment.count()) await increment.click().catch(() => {})

  const cta = page
    .getByRole('button', { name: /get tickets|register|continue|checkout/i })
    .first()
  const ctaLink = page.getByRole('link', { name: /get tickets|register|checkout/i }).first()
  if (await cta.count()) await cta.click()
  else if (await ctaLink.count()) await ctaLink.click()
  else throw new Error('No "Get tickets" CTA found on the event detail page')
}

/** Reload the confirmation page until the webhook has issued tickets. */
async function waitForWebhookConfirmation(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        // A confirmed order renders the scannable ticket QR (a visible SVG)
        // and/or the "confirmed" heading. "Tickets being prepared" means the
        // webhook has not landed yet, so reload and re-check.
        const confirmed = await page
          .getByText(/order confirmed|your tickets|you're in|on the way/i)
          .count()
        const preparing = await page.getByText(/being prepared|preparing your tickets/i).count()
        if (confirmed && !preparing) return 'confirmed'
        await page.reload()
        return 'pending'
      },
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe('confirmed')
}

// ── suite ───────────────────────────────────────────────────────────────────

test.describe('EventLinqs buyer-journey certification', () => {
  test.skip(!CONFIG.baseUrl, 'Set CERT_BASE_URL to run the certification suite.')
  test.describe.configure({ mode: 'serial' })

  test('browse: /events lists events that link to detail pages', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const cards = page.locator('a[href^="/events/"]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('event detail: paid event shows a ticket panel and a buy CTA', async ({ page }) => {
    test.skip(!CONFIG.paidEventSlug, 'Set CERT_PAID_EVENT_SLUG.')
    await page.goto(`/events/${CONFIG.paidEventSlug}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /get tickets|register/i }).first()
        .or(page.getByRole('link', { name: /get tickets|register/i }).first()),
    ).toBeVisible()
  })

  test('happy path (free): register issues a confirmed order', async ({ page }) => {
    test.skip(!CONFIG.freeEventSlug, 'Set CERT_FREE_EVENT_SLUG.')
    await page.goto(`/events/${CONFIG.freeEventSlug}`)
    await addOneTicketAndProceed(page)
    await fillBuyerDetails(page)
    await page.getByRole('button', { name: /register|get tickets|confirm/i }).first().click()
    await page.waitForURL(/\/orders\/.+\/confirmation/, { timeout: 60_000 })
    await waitForWebhookConfirmation(page)
    await expect(page.getByText(/EL-[A-Z0-9]/i).first()).toBeVisible() // order number
  })

  test('happy path (paid): card 4242 -> webhook-confirmed order + issued ticket', async ({ page }) => {
    test.skip(!CONFIG.paidEventSlug, 'Set CERT_PAID_EVENT_SLUG.')
    await page.goto(`/events/${CONFIG.paidEventSlug}`)
    await addOneTicketAndProceed(page)

    await page.waitForURL(/\/checkout\/.+/, { timeout: 60_000 })
    // The 10-minute hold countdown is part of the checkout contract.
    await expect(page.getByText(/expire|hold|minutes? left|time left/i).first()).toBeVisible()

    await fillBuyerDetails(page)
    await page.getByRole('button', { name: /continue to payment|pay|continue/i }).first().click()

    await fillStripeCard(page, CARD_SUCCESS)
    await page.getByRole('button', { name: /^pay\b|pay aud|pay now/i }).first().click()

    await page.waitForURL(/\/orders\/.+\/confirmation/, { timeout: 90_000 })
    await waitForWebhookConfirmation(page)
    // Issued ticket renders a visible (non-decorative) QR SVG.
    await expect(page.locator('svg:not([aria-hidden="true"])').first()).toBeVisible()
  })

  test('failure drill: declined card 4000...0002 surfaces an error and lets the buyer retry', async ({ page }) => {
    test.skip(!CONFIG.paidEventSlug, 'Set CERT_PAID_EVENT_SLUG.')
    await page.goto(`/events/${CONFIG.paidEventSlug}`)
    await addOneTicketAndProceed(page)
    await page.waitForURL(/\/checkout\/.+/, { timeout: 60_000 })
    await fillBuyerDetails(page)
    await page.getByRole('button', { name: /continue to payment|pay|continue/i }).first().click()

    await fillStripeCard(page, CARD_DECLINE)
    const payButton = page.getByRole('button', { name: /^pay\b|pay aud|pay now/i }).first()
    await payButton.click()

    // The decline is surfaced to the buyer and they stay on checkout (no order).
    await expect(page.getByText(/declined|card was declined|payment failed/i).first()).toBeVisible()
    expect(page.url()).toContain('/checkout/')
    await expect(payButton).toBeEnabled() // retry is possible
  })

  test('failure drill: double-submit protection disables the submit while pending', async ({ page }) => {
    test.skip(!CONFIG.paidEventSlug, 'Set CERT_PAID_EVENT_SLUG.')
    await page.goto(`/events/${CONFIG.paidEventSlug}`)
    await addOneTicketAndProceed(page)
    await page.waitForURL(/\/checkout\/.+/, { timeout: 60_000 })
    await fillBuyerDetails(page)
    const submit = page.getByRole('button', { name: /continue to payment|pay|continue/i }).first()
    await submit.click()
    // The button must disable immediately so a second click cannot create a
    // second order; the payment idempotency key is the server-side backstop.
    await expect(submit).toBeDisabled()
  })

  test('failure drill: an expired reservation cannot be paid', async ({ page }) => {
    test.skip(
      !CONFIG.expiredReservationId,
      'Set CERT_EXPIRED_RESERVATION_ID to a reservation past its 10-minute TTL.',
    )
    const res = await page.goto(`/checkout/${CONFIG.expiredReservationId}`)
    // Either a redirect to the browse page with the expiry error, or the
    // in-page "reservation has expired" state. Both are acceptable; a payable
    // checkout form is not.
    const redirected = page.url().includes('reservation_expired') || /\/events(\?|$)/.test(page.url())
    const expiredState = await page.getByText(/reservation has expired|hold .* has ended/i).count()
    expect(redirected || expiredState > 0).toBeTruthy()
    expect(res?.status() ?? 200).toBeLessThan(500)
  })
})
