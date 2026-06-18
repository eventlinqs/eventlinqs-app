// Rhythm-variant proof: axe + visual captures + rail-control resize stability.
//
// Usage: node scripts/variant-proof.mjs <BASE> <label>
//   e.g. node scripts/variant-proof.mjs https://...rhythm-b....vercel.app b
//
// Writes to docs/benchmark/rail-controls/variants/<label>/ :
//   home-1440.png        fold at 1440 (rail rhythm + new controls)
//   home-1440-rails.png  mid-page band (multiple rails, gap + role treatment)
//   home-390.png         fold at 390 (mobile rhythm + reachable arrows)
//   controls-1440/1180/980.png   the SAME rail header at three desktop widths,
//                                 proving the arrows stay put (no jump/vanish/
//                                 layout shift) on window resize
//   axe-desktop.json / axe-mobile.json   axe-core results (audit profile)
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const LABEL = process.argv[3] || 'x'
if (!BASE) { console.error('need BASE url'); process.exit(2) }
const OUT = `docs/benchmark/rail-controls/variants/${LABEL}`
mkdirSync(OUT, { recursive: true })
const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const b = await chromium.launch({ args: ['--no-sandbox'] })
const summary = { base: BASE, label: LABEL, axe: {}, captures: [] }

// ---- Visual captures (real UA so layout is the live visitor layout) ----
async function shoot(width, height, name, scrollToSel) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: width <= 420 ? 3 : 1.5, userAgent: REAL_UA })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(900)
  if (scrollToSel) {
    try {
      await page.locator(scrollToSel).first().scrollIntoViewIfNeeded({ timeout: 5000 })
      await page.waitForTimeout(600)
    } catch {}
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width, height } })
  summary.captures.push(name)
  await ctx.close()
}

// Fold + mobile fold
await shoot(1440, 900, 'home-1440')
await shoot(390, 844, 'home-390')
// Mid-page band: scroll the scenes rail into view so role treatment + gaps show
await shoot(1440, 900, 'home-1440-rails', 'section[aria-label="Browse by scene"]')

// Rail-control resize stability: scroll the same rail (This week) to the top of
// the viewport at three desktop widths; the arrows must stay top-right, same
// size, no jump or disappearance.
for (const w of [1440, 1180, 980]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 1.5, userAgent: REAL_UA })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(800)
  try {
    const sel = 'section[aria-label="This week"]'
    await page.locator(sel).first().scrollIntoViewIfNeeded({ timeout: 5000 })
    await page.waitForTimeout(500)
  } catch {}
  await page.screenshot({ path: `${OUT}/controls-${w}.png`, clip: { x: 0, y: 0, width: w, height: 420 } })
  summary.captures.push(`controls-${w}`)
  await ctx.close()
}

// ---- axe (audit profile: el-audit cookie disables motion + hover wash) ----
for (const [vp, width, height] of [['desktop', 1440, 900], ['mobile', 412, 823]]) {
  const ctx = await b.newContext({ viewport: { width, height } })
  await ctx.addCookies([{ name: 'el-audit', value: '1', domain: new URL(BASE).hostname, path: '/' }])
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(800)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const v = results.violations
  summary.axe[vp] = { violations: v.length, ids: v.map(x => `${x.id}(${x.impact})`) }
  writeFileSync(`${OUT}/axe-${vp}.json`, JSON.stringify({ url: BASE, viewport: vp, violations: v }, null, 2))
  console.log(`axe ${LABEL} ${vp}: ${v.length} violation(s)${v.length ? ' -> ' + v.map(x => x.id).join(', ') : ''}`)
  await ctx.close()
}

await b.close()
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
console.log(`\n[${LABEL}] captures: ${summary.captures.join(', ')}`)
console.log(`[${LABEL}] axe desktop=${summary.axe.desktop?.violations} mobile=${summary.axe.mobile?.violations}`)
console.log('wrote ' + OUT)
