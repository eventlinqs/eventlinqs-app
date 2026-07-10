import { test, expect } from '@playwright/test'

/**
 * Mobile admin nav drawer proof: closed then open, at 390. Skipped on desktop
 * (the drawer only exists below lg).
 */
test('mobile drawer closed and open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile viewport only')

  await page.goto('/admin', { waitUntil: 'networkidle' })
  expect(page.url(), 'session expired - rerun the setup project').not.toContain('/admin/login')

  await page.screenshot({ path: 'tests/admin-proof/output/mobile/drawer-closed.png' })

  await page.getByRole('button', { name: /open admin menu/i }).click()
  await expect(page.getByRole('dialog', { name: /admin menu/i })).toBeVisible()
  await page.screenshot({ path: 'tests/admin-proof/output/mobile/drawer-open.png' })

  // And it closes on Escape.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /admin menu/i })).toBeHidden()
})
