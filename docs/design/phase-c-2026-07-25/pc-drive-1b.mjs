/** C1 before evidence from the pre-change build that demonstrably rendered
 *  the cross-promotion grid (the morning audit's build). */
import { chromium } from 'playwright'

const OLD = 'https://eventlinqs-o33gby2gt-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/design/phase-c-2026-07-25'
const EVENT_PATH = '/events/winter-warmers-geelong-comedy-gala-vkmxcg'

const browser = await chromium.launch()
for (const [w, h, vp] of [[1440, 900, '1440'], [390, 844, '390']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const p = await ctx.newPage()
  await p.goto(`${OLD}${EVENT_PATH}`, { waitUntil: 'load', timeout: 90000 })
  await p.waitForTimeout(3500)
  const body = await p.textContent('body')
  console.log(vp, 'also-like:', /also like/i.test(body ?? ''))
  await p.screenshot({ path: `${OUT}/c1-before-grid-${vp}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
