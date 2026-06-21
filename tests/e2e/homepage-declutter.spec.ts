// Homepage declutter verification at 1440/768/375.
// Always screenshots the homepage. When HOMEPAGE_CLEANED=1 (run against the
// cleaned local build) it also asserts the two placeholder rails are gone, the
// real sections remain, and axe-core reports zero violations.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const cleaned = process.env.HOMEPAGE_CLEANED === '1'
const phase = cleaned ? 'after' : 'before'

test.describe(`homepage (${phase})`, () => {
  test('renders and screenshots', async ({ page }, info) => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBeLessThan(400)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: info.outputPath(`home-${phase}-${info.project.name}.png`), fullPage: true })
  })

  test('cleaned: placeholders gone, real sections kept, axe clean', async ({ page }, info) => {
    test.skip(!cleaned, 'after-only assertions')
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    // Removed placeholder rails are gone.
    await expect(page.getByText('Community Calendar', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Verified organisers', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Placeholder content for founder', { exact: false })).toHaveCount(0)

    // Real functional sections remain (For Organisers split + its eyebrow).
    await expect(page.getByRole('heading', { name: /Sell tickets/i })).toBeVisible()
    await expect(page.getByText('For event organisers', { exact: false })).toBeVisible()

    // axe-core: zero violations on the cleaned homepage.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    if (results.violations.length > 0) {
      console.log('axe violations:', JSON.stringify(results.violations.map(v => ({ id: v.id, nodes: v.nodes.length })), null, 2))
    }
    expect(results.violations).toEqual([])
    await page.screenshot({ path: info.outputPath(`home-after-axe-${info.project.name}.png`), fullPage: true })
  })
})
