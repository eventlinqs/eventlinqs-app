import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { ADMIN_SURFACES } from './surfaces'

/**
 * axe-core accessibility scan of every admin surface. Fails on any serious or
 * critical WCAG 2 A/AA violation and prints the per-surface counts so the run
 * reports real numbers.
 */
for (const surface of ADMIN_SURFACES) {
  test(`axe: ${surface.name}`, async ({ page }, testInfo) => {
    await page.goto(surface.path, { waitUntil: 'networkidle' })
    expect(page.url(), 'session expired - rerun the setup project').not.toContain('/admin/login')

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const seriousOrCritical = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')

    console.log(
      `[axe ${testInfo.project.name}] ${surface.name}: ${seriousOrCritical.length} serious/critical, ${results.violations.length} total`,
    )
    expect(
      seriousOrCritical,
      seriousOrCritical.map(v => `${v.id} (${v.impact})`).join(', '),
    ).toHaveLength(0)
  })
}
