import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * M6 Phase 2 - Connect onboarding card visual regression.
 *
 * Drives the dev-only preview at /dev/connect-onboarding-preview, which
 * stacks all three card states on a single page. We screenshot the page
 * at seven viewport widths to lock the responsive behaviour.
 *
 * Outputs land in docs/visual-regression/m6-phase2/. The folder is
 * created on demand so this spec does not require the directory to be
 * pre-staged.
 *
 * Run via:
 *   npm run build && npm run start
 *   npx playwright test tests/e2e/m6-connect-onboarding-visuals.spec.ts
 */

const VIEWPORTS = [
  { width: 320, height: 720, name: '320' },
  { width: 375, height: 812, name: '375' },
  { width: 414, height: 896, name: '414' },
  { width: 768, height: 1024, name: '768' },
  { width: 1024, height: 768, name: '1024' },
  { width: 1440, height: 900, name: '1440' },
  { width: 1920, height: 1080, name: '1920' },
] as const

const OUT_DIR = path.join('docs', 'visual-regression', 'm6-phase2')

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true })
})

for (const vp of VIEWPORTS) {
  test(`connect onboarding preview at ${vp.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const res = await page.goto('/dev/connect-onboarding-preview', { waitUntil: 'networkidle' })
    expect(res?.status() ?? 0).toBeLessThan(400)

    await expect(
      page.getByRole('heading', { name: 'Connect onboarding card states' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Get paid for ticket sales' }).first()).toBeVisible()

    const file = path.join(OUT_DIR, `connect-onboarding-${vp.name}.png`)
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  })
}
