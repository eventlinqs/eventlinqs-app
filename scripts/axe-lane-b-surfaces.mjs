// axe-core WCAG 2.0/2.1 A/AA scan on the lane B surfaces no other scan lists.
//
// scripts/axe-marketing-scan.mjs covers /about, /careers, /press, /legal/* and
// /pricing. scripts/organiser-axe.mjs covers /organisers. Neither covers the two
// surfaces built by FT1 and GA1 v3, and the Definition of Done asks for zero
// serious or critical violations on every surface rather than on the ones that
// happen to be in an older list.
//
// Usage: node scripts/axe-lane-b-surfaces.mjs [BASE]   (or BASE=... / BASE_URL=...)
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const BASE = (process.argv[2] || process.env.BASE || process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '')

const PAGES = [
  // FT1, the free public forecast tool: the empty form and a result state,
  // because the result is where the numbers, the table and the call to action
  // appear and none of them exist on the form.
  ['forecast-form', '/forecast'],
  ['forecast-result', '/forecast?capacity=100&price=5000&costs=100000&days=10&fee=absorb'],
  // GA1 v3, the privacy rights entry point a person reaches with no account and
  // no token. It carries two forms and is the surface the law is about.
  ['marketing-preferences', '/marketing/preferences'],
]

const VIEWPORTS = [
  ['mobile', { width: 390, height: 844 }],
  ['tablet', { width: 768, height: 1024 }],
  ['desktop', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })
let totalSerious = 0
let notLoaded = 0
try {
  for (const [name, path] of PAGES) {
    for (const [vpName, vp] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
      const status = res ? res.status() : 0
      if (status !== 200) {
        // A page that did not load is not evidence that it is accessible, which
        // is the same mistake scripts/affordance-scan.mjs was making until today.
        notLoaded += 1
        console.log(`GONE [${name} ${vpName}] ${path} answered ${status}, so nothing was scanned`)
        await context.close()
        continue
      }
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      totalSerious += serious.length
      console.log(`[${name} ${vpName}] violations=${violations.length} serious/critical=${serious.length}`)
      for (const v of serious) console.log(`       - ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`\nTOTAL serious/critical across the lane B surfaces: ${totalSerious}`)
if (notLoaded) console.log(`${notLoaded} page/viewport pair(s) did not load and were not scanned.`)
process.exit(totalSerious === 0 && notLoaded === 0 ? 0 : 1)
