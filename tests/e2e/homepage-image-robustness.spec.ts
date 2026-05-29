// Image-robustness P0 verification at 1440/768/375.
// Before this fix, one event with a disallowed cover host 500'd the homepage.
// Now the homepage and that event's page must render with no 500, and the
// homepage must be axe-clean.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('image robustness', () => {
  test('homepage renders with no 500 and is axe-clean', async ({ page }, info) => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: info.outputPath(`home-${info.project.name}.png`), fullPage: true })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    if (results.violations.length > 0) {
      console.log('axe violations:', JSON.stringify(results.violations.map(v => ({ id: v.id, nodes: v.nodes.length })), null, 2))
    }
    expect(results.violations).toEqual([])
  })

  test('the previously-broken event page renders with no 500', async ({ page }) => {
    const res = await page.goto('/events/test-dance-event-wxvv6j', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
