// Proxy queue-gate regression: a published event still renders after the
// proxy.ts select dropped the non-existent queue_open_at column. Run at
// 1440/768/375 via playwright.event-render.config.ts.
import { test, expect } from '@playwright/test'

const PUBLISHED_SLUG = 'africultures-festival-sydney-2027'

test.describe('event detail renders after proxy queue-gate fix', () => {
  test('published event page renders (proxy does not error or mis-redirect)', async ({ page }, info) => {
    const res = await page.goto(`/events/${PUBLISHED_SLUG}`)
    expect(res?.status()).toBe(200)
    // Not redirected into the queue room (non-high-demand event).
    expect(page.url()).toContain(`/events/${PUBLISHED_SLUG}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`event-${info.project.name}.png`), fullPage: true })
  })

  test('create-event route resolves (auth gate redirects signed-out users to login)', async ({ page }) => {
    await page.goto('/dashboard/events/create')
    await page.waitForURL(/\/login/, { timeout: 30_000 })
    expect(page.url()).toContain('/login')
  })
})
