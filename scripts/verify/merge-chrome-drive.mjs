/**
 * THE MERGED FOOTER, DRIVEN. 390, 768 and 1440, on a hero-bearing route and a
 * no-hero route.
 *
 * WHY A DRIVE FOR A MERGE. On 14 September 2026 the merge of the push lane into
 * lane/b-growth conflicted in src/components/layout/site-footer.tsx, and the
 * conflict was in the IMPORT BLOCK: lane A had added the one social-profile
 * list the footer, the contact page and the Organization block all read, and
 * lane B had added the signup source the footer's "Sell tickets" link carries.
 * An import-block conflict resolved by keeping both lines is the shape of edit
 * that looks finished in a diff and is not driven by anybody, and the footer is
 * SHARED CHROME: it renders under every page of the platform, so a footer that
 * throws is every page that throws.
 *
 * The Design system law asks for exactly this: "A chrome change is made once,
 * in the shared component, and verified on a hero-bearing and a no-hero route."
 *
 * WHAT IT DRIVES.
 *
 *   1. The footer landmark exists on both routes at all three widths.
 *   2. Every profile in SOCIAL_PROFILES is a VISIBLE link in the footer, with
 *      the accessible name the component gives it. The expected set is read out
 *      of the module rather than typed here, so a profile added to the one list
 *      and lost by the footer fails this drive.
 *   3. The footer's "Sell tickets" link carries src=footer, which is lane B's
 *      half of the same conflict and the half a rendered page can lose without
 *      breaking: the link still works, the attribution is simply gone.
 *   4. The two routes publish the SAME footer link set, which is what "shared
 *      chrome, one source" means when it is stated as something observable.
 *   5. Nothing overflows sideways at any width.
 *
 * IT WRITES NOTHING. No database row, no configuration, no cache to invalidate.
 *
 * Usage (no loader flags and no SERVER_LOG: it imports no src module and reads
 * no inbox; the expected profile set is parsed out of the file as text):
 *   BASE=http://localhost:3100 node scripts/verify/merge-chrome-drive.mjs \
 *     --out C:/dev/EVIDENCE/MERGE-CHROME
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const BASE = process.env.BASE ?? 'http://localhost:3100'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) { console.error('FAIL: --out <directory> is required'); process.exit(1) }
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/*
 * THE EXPECTED SET IS ENUMERATED FROM SOURCE, never typed. Parsed as text
 * rather than imported because the module is TypeScript behind the @/ alias and
 * importing it would make this drive need two loader flags to prove a footer.
 */
function expectedProfiles() {
  const text = readFileSync(join(ROOT, 'src', 'lib', 'brand', 'social-profiles.ts'), 'utf8')
  const body = text.slice(text.indexOf('export const SOCIAL_PROFILES'))
  /*
   * THE LITERAL STARTS AT THE `[` AFTER THE `=`, not at the first `[` in the
   * declaration. The first version cut at the first `]` it found and that `]`
   * belongs to the TYPE, `readonly SocialProfile[]`, so it parsed an empty set
   * and the drive silently ran no social checks at all and still said 22 of 28
   * passed. A parser that finds nothing must not look like a subject with
   * nothing to check, so the count is asserted below before anything is driven.
   */
  const literal = body.slice(body.indexOf('[', body.indexOf('=')))
  const list = literal.slice(0, literal.indexOf(']'))
  const rows = [...list.matchAll(/label:\s*'([^']+)'[^}]*href:\s*'([^']+)'/g)]
  return rows.map(m => ({ label: m[1], href: m[2] }))
}
function expectedSellTicketsHref() {
  const text = readFileSync(join(ROOT, 'src', 'lib', 'organisers', 'signup-source.ts'), 'utf8')
  const path = /ORGANISER_SIGNUP_PATH\s*=\s*'([^']+)'/.exec(text)[1]
  return `${path}?src=footer`
}

const PROFILES = expectedProfiles()
const SELL = expectedSellTicketsHref()
if (PROFILES.length === 0) {
  console.error('FAIL: no social profiles were parsed out of src/lib/brand/social-profiles.ts, so this drive has no subject')
  process.exit(1)
}
console.log(`subject: ${PROFILES.length} social profile(s) read from source, sell-tickets href ${SELL}`)

const VIEWPORTS = [
  { label: 'mobile-390',   viewport: { width: 390,  height: 844  }, isMobile: true,  hasTouch: true,  deviceScaleFactor: 2 },
  { label: 'tablet-768',   viewport: { width: 768,  height: 1024 }, isMobile: false, hasTouch: true,  deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/*
 * ONE ROUTE WITH A HERO AND ONE WITHOUT, and which is which is MEASURED on the
 * page rather than asserted from the route name. A drive that labels a route
 * "no-hero" and is wrong has verified the law's easy half twice.
 */
const ROUTES = ['/', '/events']

async function footerLinks(page) {
  return page.$$eval('footer[aria-label="Site footer"] a[href]', as =>
    as.map(a => ({ href: a.getAttribute('href'), name: a.getAttribute('aria-label') || (a.textContent || '').trim() })),
  )
}

const browser = await chromium.launch()
const heroSeen = {}
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext(vp)
    const page = await ctx.newPage()
    const perRoute = {}

    for (const route of ROUTES) {
      const res = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120000 })
      check(`${vp.label}${route}-answers-200`, res?.status() === 200, `status ${res?.status()}`)

      const footer = page.locator('footer[aria-label="Site footer"]')
      await footer.waitFor({ state: 'attached', timeout: 45000 }).catch(() => {})
      const footerCount = await footer.count()
      check(`${vp.label}${route}-footer-landmark-exists`, footerCount === 1,
        `${footerCount} footer landmark(s)`)

      heroSeen[route] = (heroSeen[route] ?? 0) + (await page.locator('.hero-marketing').count())

      await footer.scrollIntoViewIfNeeded().catch(() => {})
      const links = await footerLinks(page)
      perRoute[route] = links

      for (const p of PROFILES) {
        const link = page.locator(`footer[aria-label="Site footer"] a[href="${p.href}"]:visible`)
        const n = await link.count()
        const named = n ? await link.first().getAttribute('aria-label') : null
        check(`${vp.label}${route}-social-${p.label.toLowerCase()}-is-a-visible-named-link`,
          n >= 1 && named === `EventLinqs on ${p.label}`,
          `${n} visible link(s), accessible name ${JSON.stringify(named)}`)
      }

      /*
       * THE FOOTER PUBLISHES BOTH LAYOUTS AT EVERY WIDTH and hides one in CSS:
       * the mobile accordions and the desktop link grid are both in the DOM, so
       * every footer link is there TWICE and the first version of this check
       * failed on "2 links" while the page was perfectly correct. What matters
       * is what a finger and a crawler can reach, so the visible count is the
       * subject, and the DOM count is used for the assertion that actually
       * catches the lost half: that NO route into signup from the footer is
       * missing its source.
       */
      const sellVisible = await page.locator(
        `footer[aria-label="Site footer"] a[href="${SELL}"]:visible`).count()
      check(`${vp.label}${route}-sell-tickets-is-reachable-once`, sellVisible === 1,
        `${sellVisible} visible link(s) with href ${SELL}`)

      const base = SELL.split('?')[0]
      const unsourced = links.filter(l => l.href === base)
      check(`${vp.label}${route}-no-footer-signup-link-lost-its-source`, unsourced.length === 0,
        unsourced.length === 0
          ? `every footer link into ${base} carries a source`
          : `${unsourced.length} footer link(s) point at bare ${base}`)

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`${vp.label}${route}-no-sideways-overflow`, overflow <= 1, `${overflow}px past the viewport`)

      const shot = join(out, `footer-${vp.label}-${route === '/' ? 'home' : 'events'}.png`)
      await footer.screenshot({ path: shot }).catch(() => page.screenshot({ path: shot }))
    }

    const a = perRoute['/'].map(l => l.href).join('|')
    const b = perRoute['/events'].map(l => l.href).join('|')
    check(`${vp.label}-both-routes-publish-the-same-footer`, a === b,
      a === b ? `${perRoute['/'].length} links, identical on both routes`
              : `home ${perRoute['/'].length} links, events ${perRoute['/events'].length} links, and they differ`)

    await ctx.close()
  }

  check('one-route-has-a-hero-and-one-does-not',
    (heroSeen['/'] > 0) !== (heroSeen['/events'] > 0),
    `/ saw ${heroSeen['/']} hero element(s) across three widths, /events saw ${heroSeen['/events']}`)
} finally {
  await browser.close()
}

writeFileSync(join(out, 'checks.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), checks }, null, 2))
const passed = checks.filter(c => c.ok).length
console.log(`\n${passed} of ${checks.length} checks passed`)
if (failures.length) { console.error('\nFAILURES:'); for (const f of failures) console.error(`  ${f}`); process.exit(1) }
console.log('MERGE CHROME DRIVE: GREEN')
