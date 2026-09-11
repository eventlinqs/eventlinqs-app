// axe-core scan for the [SHARED] header + footer surface.
// Scans the homepage (which mounts both) at desktop and mobile and
// asserts zero violations, then scopes a second pass to header + footer.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
/*
 * TABLET AND LAPTOP ADDED 10 September 2026 (close-out UX6). The header's
 * desktop and mobile chrome now swap at lg (1024) rather than md (768), because
 * below 1024 the desktop row laid its account controls out past the right edge
 * of the screen. A scan that only reads 390 and 1440 never sees the widths where
 * that swap happens, and the swap is exactly where an aria-hidden or focus-order
 * mistake would land.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

const browser = await chromium.launch()
let failed = false
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(800)

    // Full page (header + body + footer).
    const full = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    // Scoped: header + footer only (the surface under change).
    const scoped = await new AxeBuilder({ page })
      .include('header')
      .include('footer[aria-label="Site footer"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const report = v => v.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.length }))
    console.log(`[${vp.name}] full violations: ${full.violations.length}`, report(full.violations))
    console.log(`[${vp.name}] header+footer violations: ${scoped.violations.length}`, report(scoped.violations))
    if (full.violations.length || scoped.violations.length) failed = true
    await ctx.close()
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
