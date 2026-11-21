import { test, expect, runTag, type Journey } from './lib/journey'

/**
 * C2. THE PURCHASE, on our own unlisted test event (made by journey B's test organiser; never a real organiser's night,
 * so no real organiser is told of a test order and no figure of theirs moves). Production takes live card payments, so a
 * card is never entered here: the FREE tier goes through to a completed order (as a guest, and signed in), its
 * confirmation page, My tickets and the QR ticket; the PAID tier goes as far as the checkout's Continue to payment with the
 * same all in total the event page showed, and stops before any payment is started. The whole paid order in Stripe's TEST mode runs on a TEST wired build (purchase-e2e.yml).
 * The ticket email is read in our own hello@ inbox after the run (it lands at hello+qa-...@eventlinqs.com).
 *
 * JOURNEY_QA_EVENT_SLUG   the test event's address (the sweep passes the one B kept)
 */
const slug = process.env.JOURNEY_QA_EVENT_SLUG ?? ''
const BUYER = 'hello+qa-buyer@eventlinqs.com'
const buyerPw = process.env.JOURNEY_BUYER_PASSWORD ?? ''

async function chooseOne(journey: Journey, tier: string) {
  const { page } = journey
  await journey.step(`open the test event and choose one ${tier}`, async () => {
    await journey.open(`/events/${slug}`)
    await expect(page.locator('h1').first()).toBeVisible()
    const inc = page.getByRole('button', { name: `Increase ${tier} quantity` })
    await inc.scrollIntoViewIfNeeded()
    await inc.click()
  })
}

test.describe('C2 checkout', () => {
  test.skip(!slug, 'no test event address given')

  test('a guest registers a free ticket to completion @sweep', async ({ journey, page }) => {
    const guest = `hello+${runTag()}@eventlinqs.com`
    await chooseOne(journey, 'QA free')
    await journey.step('Register 1 ticket', async () => {
      await page.getByRole('button', { name: 'Register 1 ticket' }).click()
      await expect(page).toHaveURL(/\/checkout\//, { timeout: 30_000 })
    })
    await journey.step('the guest form, Register for free', async () => {
      await page.fill('#buyer-name', 'EventLinqs QA Guest')
      await page.fill('#buyer-email', guest)
      for (const f of ['#att-0-first', '#att-0-last']) {
        const el = page.locator(f)
        if (await el.isVisible().catch(() => false)) await el.fill(f.endsWith('first') ? 'QA' : 'Guest')
      }
      const attEmail = page.locator('#att-0-email')
      if (await attEmail.isVisible().catch(() => false)) await attEmail.fill(guest)
      await expect(page.locator('#organiser-marketing-consent')).not.toBeChecked()
      await page.getByRole('button', { name: 'Register for free' }).click()
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation/, { timeout: 60_000 })
      await expect(page.getByRole('heading', { name: "You're going" })).toBeVisible()
    })
  })

  test('a signed in buyer registers, sees My tickets and opens the QR ticket @sweep', async ({ journey, page }) => {
    test.skip(!buyerPw, 'no QA password in this environment')
    await journey.step('sign in as the test buyer', async () => {
      await journey.open(`/login?redirect=/events/${slug}`)
      await page.fill('#email', BUYER)
      await page.fill('#password', buyerPw)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
    })
    await chooseOne(journey, 'QA free')
    await journey.step('Register 1 ticket goes straight to the confirmation', async () => {
      await page.getByRole('button', { name: 'Register 1 ticket' }).click()
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation/, { timeout: 60_000 })
      await expect(page.getByRole('heading', { name: "You're going" })).toBeVisible()
    })
    let ticketHref = ''
    await journey.step('My tickets shows it', async () => {
      await journey.open('/tickets')
      await expect(page.locator('main')).toContainText('EventLinqs QA journey')
      ticketHref = (await page.locator('main a[href^="/t/"]').first().getAttribute('href').catch(() => null)) ?? ''
    })
    await journey.step('the QR ticket opens', async () => {
      if (!ticketHref) {
        await page.locator('main a').filter({ hasText: /EventLinqs QA journey|view ticket|ticket/i }).first().click()
        ticketHref = page.url()
      } else {
        await journey.open(ticketHref)
      }
      await expect(page.getByRole('img', { name: /Entry QR code for ticket/ }).first()).toBeVisible({ timeout: 20_000 })
    })
  })

  test('the paid tier reaches Continue to payment with the same all in total @sweep', async ({ journey, page }) => {
    await chooseOne(journey, 'QA paid')
    let shown = ''
    await journey.step('Checkout shows the all in total', async () => {
      const go = page.getByRole('button', { name: /^Checkout · \$/ })
      shown = ((await go.textContent()) ?? '').replace(/^Checkout · /, '').trim()
      expect(shown, 'no total on the checkout button').toMatch(/^\$\d+\.\d{2}$/)
      await go.click()
      await expect(page).toHaveURL(/\/checkout\//, { timeout: 30_000 })
    })
    await journey.step('the checkout page carries the same total', async () => {
      await page.fill('#buyer-name', 'EventLinqs QA Guest')
      await page.fill('#buyer-email', `hello+${runTag()}@eventlinqs.com`)
      const pay = page.getByRole('button', { name: /^Continue to payment - AUD / })
      await expect(pay).toBeVisible()
      const total = ((await pay.textContent()) ?? '').replace(/^Continue to payment - AUD /, '').trim()
      expect(`$${total}`, 'the checkout total differs from the event page total').toBe(shown)
    })
  })
})
