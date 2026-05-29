// Tickets spine E2E (option-2 verification, run at 1440/768/375 via
// playwright.tickets.config.ts). Consumes the fixture seeded by
// scripts/seed-ticket-fixture.mjs.
//
//   node --env-file=.env.local scripts/seed-ticket-fixture.mjs
//   npx playwright test --config playwright.tickets.config.ts
//   node --env-file=.env.local scripts/seed-ticket-fixture.mjs clean
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

// Path relative to the project root (Playwright runs with cwd = repo root).
const FIXTURE = 'tests/e2e/.ticket-fixture.json'
const fx = existsSync(FIXTURE)
  ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      email: string; password: string; orderNumber: string; code: string; secret: string
      eventSlug?: string; notOnSale?: boolean
    })
  : null

test.describe('tickets spine', () => {
  test.skip(!fx, 'No ticket fixture. Run scripts/seed-ticket-fixture.mjs first.')

  test('bearer /t/[code] renders the ticket and a scannable QR', async ({ page }, info) => {
    await page.goto(`/t/${fx!.code}?k=${encodeURIComponent(fx!.secret)}`)
    await expect(page.getByText('EventLinqs ticket')).toBeVisible()
    await expect(page.getByText(fx!.code)).toBeVisible()
    // The QR is a server-rendered SVG with a viewBox, injected into the
    // ticket card. Exclude hidden icon-sprite SVGs (width/height 0,
    // aria-hidden) that also exist in the document.
    await expect(page.locator('svg:not([aria-hidden="true"])').first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`bearer-${info.project.name}.png`), fullPage: true })
  })

  test('/t/[code] with a wrong secret returns a clean 404', async ({ page }) => {
    const res = await page.goto(`/t/${fx!.code}?k=wrong-secret`)
    expect(res?.status()).toBe(404)
  })

  test('/tickets lists the buyer issued ticket linking to its bearer page', async ({ page }, info) => {
    await page.goto('/login?redirect=%2Ftickets')
    await page.fill('#email', fx!.email)
    await page.fill('#password', fx!.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/tickets', { timeout: 45_000 })

    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
    // The ticket row shows its code and links to the bearer page.
    await expect(page.getByText(fx!.code)).toBeVisible()
    const link = page.locator(`a[href^="/t/${fx!.code}"]`)
    await expect(link).toHaveCount(1)
    await page.screenshot({ path: info.outputPath(`tickets-${info.project.name}.png`), fullPage: true })
  })

  test('event detail shows the not-on-sale state for a paid event whose organiser cannot sell', async ({ page }, info) => {
    test.skip(!fx!.notOnSale || !fx!.eventSlug, 'No unsellable paid event in the fixture.')
    await page.goto(`/events/${fx!.eventSlug}`)
    await expect(page.getByText('Tickets not yet on sale')).toBeVisible()
    // No selection or checkout control is offered for an unsellable event.
    await expect(
      page.getByRole('button', { name: /Select tickets to continue|Checkout|Register/ }),
    ).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`not-on-sale-${info.project.name}.png`), fullPage: true })
  })
})
