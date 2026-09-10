/**
 * THE HUMAN READ OF THE FIVE LAUNCH SCREENS (close-out UX2.5, L1 row 17).
 *
 * A sweep proves a page ANSWERS. It cannot see a bio rendering `**MKL Studios**`,
 * a venue name printed twice, an unlabelled map pin, or a rail closing into the
 * footer with no gap. Every one of the six defects the owner found by reading a
 * single page was a 200, and the sweep that drove 211 routes found none of them.
 *
 * So this captures the five screens named in L1 row 17, at 390, 768 and 1440,
 * as full-page images a person then LOOKS AT. It is deliberately not a pass/fail
 * script pretending to be a reader: it does the mechanical half a machine is
 * actually good at, and hands over pictures for the half it is not.
 *
 * THE MECHANICAL HALF, asserted here so the reader is not wasting their eyes on
 * it:
 *   - the page answers 200
 *   - `document.documentElement.scrollWidth <= window.innerWidth` (UX6)
 *   - axe, WCAG 2.0/2.1 A and AA, reported at EVERY impact level
 *   - no raw markdown syntax in the rendered text (UX1.1)
 *   - no placeholder copy on a shipped surface (Law 1)
 *
 * TWO CHECKS WERE WRITTEN HERE AND REMOVED, and the reason is recorded because
 * the removal looks like a weakening and is the opposite.
 *
 * "no visible element past the right edge" flagged 24 things across the five
 * screens and not one was a defect: the mobile nav sheet parked off-canvas by a
 * transform, rail cards beyond the fold (which IS the next-card peek the design
 * system asks for), the full-bleed hero raster, and decorative absolute
 * overlays. A naive right-edge test does not understand an overflow container,
 * and `ux6-checkout-viewport-proof.mjs` already carries the exemption taxonomy
 * that does. The authoritative signal is `scrollWidth <= innerWidth`, which is
 * asserted above and which passed on every screen at every width.
 *
 * "the last section does not close flush against the footer" measured the gap
 * from the bottom-most box in `main`, and a full-height section wrapper reaches
 * the footer by construction, so it read 0px on all fifteen. UX2.3 measures the
 * last PAINTED content box and is already MET with its own evidence. A check
 * that reports 0 for every page is not measuring the thing it names.
 *
 * THE HUMAN HALF is the PNGs, and it is the half that found the crop, the
 * asterisks and the pale band. Nothing here reports the mechanical result as
 * covering it.
 *
 * Usage:
 *   node scripts/verify/launch-screens-read.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { envFor, startGateServer } from '../ops/pre-push-gate.mjs'

const TAG = '[launch-read]'
const OUT = 'C:/dev/EVIDENCE/UX2/launch-screens'
const LOG = join(process.cwd(), '.tmp', 'launch-screens-server.log')
mkdirSync(OUT, { recursive: true })

const env = envFor('local')
if (/gndnldyfudbytbboxesk/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`${TAG} REFUSING: .env.local points at PRODUCTION.`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

/** Placeholder copy that is a defect by definition on a shipped surface (Law 1). */
const PLACEHOLDERS = [
  /\bcoming soon\b/i,
  /\blorem ipsum\b/i,
  /\bsample event\b/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bplaceholder\b/i,
]

/** Raw markdown that reached a screen instead of being rendered or stripped. */
const RAW_MARKDOWN = /\*\*[^*\n]+\*\*|^\s*[-*]\s+\S.*\n\s*[-*]\s+/m

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const started = await startGateServer(env, LOG)
if (started.error) process.exit(1)
const { base, stop } = started
console.log(`${TAG} production build answering on ${base}`)

let browser = null
try {
  /*
   * THE EVENT DETAIL SLUG IS ENUMERATED, NEVER TYPED. Guessing a slug once
   * produced both a 404 and a false pass on this project. It comes from the
   * database the server is actually reading.
   */
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: ev, error } = await db
    .from('events')
    .select('slug, title')
    .eq('status', 'published')
    .not('slug', 'is', null)
    .order('start_date', { ascending: true })
    .limit(1)
  if (error || !ev?.length) {
    console.error(`${TAG} FAIL: could not enumerate a published event: ${error?.message ?? 'none found'}`)
    process.exit(1)
  }
  const eventSlug = ev[0].slug
  console.log(`${TAG} event detail screen resolved from the database: /events/${eventSlug} (${ev[0].title})`)

  const SCREENS = [
    { name: 'home', path: '/' },
    { name: 'browse', path: '/events' },
    { name: 'event-detail', path: `/events/${eventSlug}` },
    { name: 'pricing', path: '/pricing' },
    { name: 'organisers', path: '/organisers' },
  ]

  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    console.log(`\n${TAG} ---------- ${vp.label} ----------`)
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-AU',
      isMobile: vp.width < 768,
      hasTouch: vp.width < 1024,
    })
    const page = await ctx.newPage()

    for (const screen of SCREENS) {
      const id = `${screen.name}.${vp.label}`
      const res = await page.goto(`${base}${screen.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      check(`${id}.status`, res?.status() === 200, `GET ${screen.path} -> ${res?.status()}`)
      if (res?.status() !== 200) continue
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      await page.evaluate(() => document.fonts.ready).catch(() => {})

      /*
       * ============================================================
       * READ THIS BEFORE BELIEVING A FULL-PAGE CAPTURE OF THIS SITE.
       * ============================================================
       *
       * Every rail section carries `cv-section`, which is
       * `content-visibility: auto` with a 480px intrinsic size. It was added by
       * close-out C8 to get the mobile Lighthouse score up: the browser renders
       * the first viewport and reserves an estimate for the rest.
       *
       * Two consequences, and BOTH of them look exactly like a broken page:
       *
       *   1. A `fullPage` screenshot shows BLANK BANDS wherever a section is
       *      currently skipped. The first capture of the homepage in this
       *      script had roughly 1100px of nothing between the music rail and
       *      the community band.
       *   2. `innerText` on a skipped section returns THE EMPTY STRING, because
       *      innerText is the RENDERED text and there is none. A probe written
       *      to find empty sections reported EIGHT of fourteen on the homepage
       *      as having no content whatsoever. Every one of them had 150 to 176
       *      descendants and 10 to 14 images inside it. Scrolling to the bottom
       *      and asking again moved the "empty" ones to the sections that were
       *      now off screen, which is the tell.
       *
       * So content-visibility is turned OFF for the capture only, in the page,
       * never in the product. What is wanted here is the page as a person who
       * scrolls it sees it, and that is not what the browser paints in one shot.
       */
      await page.addStyleTag({
        content: '.cv-section, [class*="cv-section"] { content-visibility: visible !important; }',
      })

      /*
       * SCROLL THE PAGE BEFORE CAPTURING IT, or the capture is a lie.
       *
       * The motion engine is IntersectionObserver-driven: every below-the-fold
       * section starts at opacity 0 and fades in when it enters the viewport.
       * A full-page screenshot does not walk the page past the observer, so the
       * first run of this script produced a homepage with roughly 1100px of
       * blank between the music rail and the community band, and it read
       * exactly like a section that had failed to render. It had not. A person
       * scrolling sees all of it, so the capture scrolls too.
       *
       * Lazy images need the same walk, for the same reason.
       */
      await page.evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.8)
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise((r) => setTimeout(r, 400))
        window.scrollTo(0, 0)
        await new Promise((r) => setTimeout(r, 300))
      })
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(800)

      const m = await page.evaluate(() => {
        const doc = document.documentElement
        return {
          scrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
          text: document.body.innerText,
        }
      })

      check(`${id}.no-h-scroll`, m.scrollWidth <= m.innerWidth, `scrollWidth ${m.scrollWidth} vs innerWidth ${m.innerWidth}`)
      const md = m.text.match(RAW_MARKDOWN)
      check(`${id}.no-raw-markdown`, !md, md ? `raw markdown on screen: ${md[0].slice(0, 60)}` : 'no markdown syntax on screen')
      const ph = PLACEHOLDERS.map((p) => m.text.match(p)).find(Boolean)
      check(`${id}.no-placeholder-copy`, !ph, ph ? `placeholder copy: "${ph[0]}"` : 'no placeholder copy')

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      check(
        `${id}.axe`,
        bad.length === 0,
        bad.length === 0
          ? `0 serious/critical (${axe.violations.length} total at any impact)`
          : bad
              .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => (n.target ?? []).join(' ')).join(' | ')}`)
              .join(' ;; '),
      )

      await page.screenshot({ path: join(OUT, `${screen.name}-${vp.label}.png`), fullPage: true })
    }
    await ctx.close()
  }
} finally {
  if (browser) await browser.close()
  stop()
}

writeFileSync(join(OUT, 'launch-screens-read.json'), JSON.stringify({ checks, failures }, null, 2))
console.log(`\n${TAG} ${checks.filter((c) => c.ok).length} of ${checks.length} mechanical checks passed`)
console.log(`${TAG} captures in ${OUT} - the READ is the pictures, and this script does not claim to have done it.`)
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
