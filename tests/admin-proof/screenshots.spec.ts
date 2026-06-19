import { test, expect } from '@playwright/test'
import { ADMIN_SURFACES } from './surfaces'

/**
 * Full-page screenshot of every admin surface, populated with real data, at
 * the running project's viewport (desktop 1440 / mobile 390). Output lands in
 * tests/admin-proof/output/<project>/<surface>.png.
 */
for (const surface of ADMIN_SURFACES) {
  test(`screenshot: ${surface.name}`, async ({ page }, testInfo) => {
    await page.goto(surface.path, { waitUntil: 'networkidle' })
    // Confirm we are not bounced to the login (session must be live).
    expect(page.url(), 'session expired - rerun the setup project').not.toContain('/admin/login')
    await expect(page.getByRole('heading', { name: surface.ready }).first()).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `tests/admin-proof/output/${testInfo.project.name}/${surface.name}.png`,
      fullPage: true,
    })
  })
}
