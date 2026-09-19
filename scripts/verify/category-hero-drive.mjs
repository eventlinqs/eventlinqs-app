/**
 * DRIVEN PROOF: EVERY CATEGORY LANDING ANSWERS 200 AND ITS HERO IS A RASTER.
 *
 * ============================================================================
 * WHAT THIS EXISTS TO CATCH, found by scripts/link-integrity-crawl.mjs on
 * 19 September 2026.
 * ============================================================================
 *
 *     500  /categories/technology  (linked from: /categories/music)
 *     [HeroMedia] image must be a raster URL (got SVG):
 *     /images/event-fallback-hero.svg
 *
 * `getCategoryPhoto` answers "no photograph" with the branded fallback, whose
 * `src` is an SVG. The page passed it into the hero; a non-empty string wins the
 * hero's `??` chain, so its own bundled last resort never ran.
 *
 * THE STATUS ALONE IS NOT THE PROOF, and that is the whole design of this file.
 * `assertRaster` is wrapped in `process.env.NODE_ENV !== 'production'`, so the
 * 500 is a DEVELOPMENT symptom. In production the same page renders, with an SVG
 * as its hero: no error, and an LCP element that cannot be the LCP
 * (docs/MEDIA-ARCHITECTURE.md 5.1). So every route is judged on the src the hero
 * actually rendered, which is true on both builds.
 *
 * THE SLUGS ARE ENUMERATED FROM src/lib/categories/category-editorial.ts rather
 * than typed here, so a category added tomorrow is driven without anybody
 * remembering to add it.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/category-hero-drive.mjs --out C:/dev/EVIDENCE/HERO-SVG [--label red]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/HERO-SVG'
let label = 'green'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--label') label = args[++i]
}
out = join(out, `drive-${label}`)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')

/** Enumerated from source, never typed here. */
const EDITORIAL = readFileSync('src/lib/categories/category-editorial.ts', 'utf8')
const SLUGS = [...EDITORIAL.matchAll(/^ {4}slug: '([a-z-]+)',$/gm)].map(m => m[1])
if (SLUGS.length < 10) {
  console.error(`[category-hero-drive] BROKEN DRIVE: only ${SLUGS.length} slug(s) enumerated from the editorial table.`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]
/** The one route the defect was found on; photographed at every width. */
const PHOTOGRAPH = 'technology'

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const RASTER = /\.(jpg|jpeg|png|avif|webp)(\?|$)/i

const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-AU',
      isMobile: vp.width < 768,
      hasTouch: vp.width < 1024,
    })
    const page = await ctx.newPage()

    for (const slug of SLUGS) {
      const response = await page.goto(`${BASE}/categories/${slug}`, {
        waitUntil: 'domcontentloaded',
        timeout: 180000,
      })
      const status = response?.status() ?? 0
      check(`${vp.label}.${slug}.status`, status === 200, `/categories/${slug} answered ${status}`)
      if (status !== 200) continue

      /*
       * THE HERO'S OWN IMAGE, read out of the optimiser's query string where it
       * is present. next/image rewrites the src, so the raw attribute is
       * /_next/image?url=<the real path>.
       */
      const hero = await page.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="category-hero-heading"]')
        const img = section?.querySelector('img')
        if (!img) return null
        const raw = img.getAttribute('src') ?? ''
        const m = /[?&]url=([^&]+)/.exec(raw)
        return m ? decodeURIComponent(m[1]) : raw
      })
      check(
        `${vp.label}.${slug}.hero`,
        Boolean(hero) && RASTER.test(hero) && !/\.svg/i.test(hero),
        hero ? `the hero renders ${hero}` : 'the hero rendered NO image at all',
      )

      if (slug === PHOTOGRAPH) {
        await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
        await page.screenshot({ path: join(out, `${slug}-${vp.label}.png`), fullPage: false })
      }
    }

    await page.goto(`${BASE}/categories/${PHOTOGRAPH}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check(
      `${vp.label}.axe`,
      serious.length === 0,
      `${axe.violations.length} violation(s), ${serious.length} serious or critical`,
    )

    await ctx.close()
  }
} finally {
  await browser.close().catch(() => {})
}

writeFileSync(join(out, 'drive.json'), `${JSON.stringify({ base: BASE, label, slugs: SLUGS, checks, failures }, null, 2)}\n`)
const passed = checks.filter(c => c.ok).length
console.log(`\n[category-hero-drive] ${passed} of ${checks.length} checks passed across ${SLUGS.length} categories`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
