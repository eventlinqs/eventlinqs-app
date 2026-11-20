import { test, expect, runTag } from './lib/journey'

/**
 * D2. THE NEWSLETTER, as a visitor signs up on a city guide: a fresh address on our own domain (it lands in hello@), the
 * form's own answer, then (after the run, from the inbox) the confirmation link and the one click unsubscribe. The sign
 * up limit is five a ten minutes per address and three a day per email, so it runs at 390 only.
 */
const CITY = process.env.JOURNEY_NEWSLETTER_CITY ?? 'melbourne'

test.describe('D2 newsletter', () => {
  test('sign up for the weekly guide on a city page @sweep @monitor', async ({ journey, page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'one sign up a run (the newsletter limit)')
    const address = `hello+${runTag()}@eventlinqs.com`
    await journey.step(`open /city/${CITY}`, async () => {
      await journey.open(`/city/${CITY}`)
      const box = page.locator('#city-newsletter-email')
      await box.scrollIntoViewIfNeeded()
      await expect(box).toBeVisible()
    })
    await journey.step('subscribe', async () => {
      await page.fill('#city-newsletter-email', address)
      const answered = page.waitForResponse((r) => r.url().includes('/api/newsletter/subscribe'), { timeout: 30_000 })
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
      const res = await answered
      expect(res.status(), `the subscribe endpoint answered ${res.status()}: ${(await res.text().catch(() => '')).slice(0, 200)}`).toBeLessThan(400)
      await expect(page.getByText('Check your inbox. We have sent you a link to confirm your weekly guide.')).toBeVisible()
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
    })
  })
})
