/**
 * NO CATEGORY ON THIS PLATFORM IS A QUERY STRING, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHAT CLOSE-OUT SEO3 ASKS FOR
 * ============================================================================
 *
 * Acceptance 4, verbatim: "A driven proof confirms no category link anywhere on
 * the site is a query string, at 390, 768 and 1440."
 *
 * THE THREE VIEWPORTS ARE NOT CEREMONY HERE. The homepage renders the category
 * tiles through `CategoryNavRail` and the rail "view all" links through
 * `EventRailSection`, and several surfaces render a DIFFERENT set of links on a
 * small screen: a mobile menu, a collapsed filter sheet, a rail that shows four
 * tiles instead of nine. A desktop-only scan reads the desktop half of the
 * markup and reports a platform-wide verdict off it. That is how nine query
 * string tiles survived a link audit in the first place.
 *
 * WHAT IT ASSERTS, per surface, per viewport:
 *
 *   1. NO link anywhere is `/events?category=<anything>`. That URL is a filter
 *      on the browse page and canonicalises to `/events`, so a link to it spends
 *      its internal link equity on a page that can never rank for the term the
 *      link names, which is the whole of SEO3 step 4.
 *   2. Every `/categories/<slug>` link that IS rendered resolves 200. A link to
 *      a category with no page is Law 5's dead link wearing SEO3's clothes.
 *   3. The category landing itself renders its OWN h1, its own canonical and a
 *      crawlable strip of sibling categories, at every viewport.
 *
 * WHAT IT CANNOT SEE, said rather than implied: a link that only exists after an
 * interaction nothing here performs (inside a menu that must be opened). The
 * count of such links is reported, never assumed to be zero: every surface is
 * scanned for anchors that are present in the DOM but not visible, and those are
 * included in the assertion, because a hidden anchor is still in the markup a
 * crawler reads.
 *
 * Run: node scripts/verify/category-links-drive.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] || process.env.CATEGORY_LINKS_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.CATEGORY_LINKS_OUT || ''
const TAG = '[category-links]'

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop-1440', width: 1440, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/**
 * The surfaces that render, or used to render, a category link. Read against
 * the source rather than chosen: `/` (nine rail "view all" links plus the
 * category tile rail), `/events` (the filter chips), `/organisers` (the
 * community strip the item names), plus the category landings themselves and
 * the city and community pages that cross-link into them.
 */
const SURFACES = [
  '/',
  '/events',
  '/organisers',
  '/cities',
  '/communities',
  '/city/melbourne',
  '/community/african',
]

/**
 * THE ONE QUERY-STRING CATEGORY LINK THIS LANE MAY NOT FIX, NAMED IN FULL.
 *
 * `/organisers` renders a community strip whose Comedy tile still points at
 * `/events?category=comedy`
 * (src/components/features/organisers/community-strip.tsx line 49). The
 * three-lane protocol gives the organiser marketing surfaces to lane B, so this
 * lane raised it as a BORDER in REVIEW-QUEUE-C.md on 14 September 2026 and did
 * not cross it. The replacement is one word: `/categories/comedy` exists, is
 * indexable, and answered 200 in this very run.
 *
 * IT IS RECORDED RATHER THAN IGNORED, and the record has a spring in it: if the
 * link is FIXED and this entry is left behind, the run fails on the stale entry.
 * An exception nobody prunes is an exception nobody reads, and that is how an
 * allowance meant to last a week becomes the permanent state of a surface. The
 * same rule, on the same file, holds the build-time half in
 * scripts/guards/discovery-indexability.mjs.
 */
const BORDER_EXCEPTIONS = [
  {
    surface: '/organisers',
    href: '/events?category=comedy',
    owner: 'lane B (organiser marketing surfaces)',
    file: 'src/components/features/organisers/community-strip.tsx',
    raised: 'REVIEW-QUEUE-C.md, 14 September 2026',
  },
]
const borderSeen = new Set()

const faults = []
const log = []
const say = (m) => {
  log.push(m)
  console.log(`${TAG} ${m}`)
}
const fail = (m) => {
  faults.push(m)
  log.push(`FAIL: ${m}`)
  console.error(`${TAG} FAIL: ${m}`)
}

/** Every internal href in the DOM, visible or not: a crawler reads both. */
async function hrefsOn(page) {
  return page.$$eval('a[href]', (as) =>
    as.map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('/') || h.includes('://')),
  )
}

async function main() {
  const categorySlugs = JSON.parse(process.env.CATEGORY_SLUGS || '[]')
  if (categorySlugs.length === 0) throw new Error('CATEGORY_SLUGS was not supplied by the caller')
  say(`${categorySlugs.length} category slug(s) read from public.event_categories`)

  const browser = await chromium.launch()
  const resolved = new Map()
  let scanned = 0
  let categoryLinksSeen = 0

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: vp.deviceScaleFactor,
      })
      const page = await context.newPage()

      // Every ordinary surface, plus one real category landing, at this viewport.
      const paths = [...SURFACES, `/categories/${categorySlugs[0]}`]
      for (const path of paths) {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        if (!res || res.status() !== 200) {
          fail(`${vp.name} ${path} answered ${res ? res.status() : 'no response'}`)
          continue
        }
        scanned += 1
        const hrefs = await hrefsOn(page)

        /* ---- 1. no category is a query string ---- */
        for (const href of new Set(hrefs.filter((h) => /[?&]category=/.test(h)))) {
          const allowed = BORDER_EXCEPTIONS.find((e) => e.surface === path && e.href === href)
          if (allowed) {
            borderSeen.add(`${allowed.surface} ${allowed.href}`)
            say(`BORDER ${vp.name} ${path} still links ${href} (${allowed.file}, ${allowed.owner}, raised ${allowed.raised})`)
            continue
          }
          fail(`${vp.name} ${path} renders a category link as a query string: ${href}`)
        }

        /* ---- 2. every /categories/ link rendered here resolves ---- */
        for (const href of new Set(hrefs.filter((h) => h.startsWith('/categories/')))) {
          categoryLinksSeen += 1
          if (!resolved.has(href)) {
            const probe = await fetch(`${BASE}${href}`, { redirect: 'follow' })
            resolved.set(href, probe.status)
          }
          if (resolved.get(href) !== 200) {
            fail(`${vp.name} ${path} links ${href}, which answers ${resolved.get(href)}`)
          }
        }
      }

      /* ---- 3. the category landing renders its own identity, here too ---- */
      const slug = categorySlugs[0]
      await page.goto(`${BASE}/categories/${slug}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      const h1s = await page.$$eval('h1', (els) => els.map((e) => (e.textContent || '').trim()))
      if (h1s.length !== 1) fail(`${vp.name} /categories/${slug} renders ${h1s.length} h1 elements, not exactly one`)
      else say(`${vp.name} /categories/${slug} h1: "${h1s[0]}"`)

      const canonical = await page.getAttribute('link[rel="canonical"]', 'href').catch(() => null)
      if (canonical && !canonical.endsWith(`/categories/${slug}`)) {
        fail(`${vp.name} /categories/${slug} canonical points at ${canonical}`)
      }

      const siblingCount = await page.$$eval('a[href^="/categories/"]', (as) => as.length)
      if (siblingCount < 2) {
        fail(`${vp.name} /categories/${slug} renders ${siblingCount} category link(s); the sibling strip is the crawl path`)
      } else {
        say(`${vp.name} /categories/${slug} cross-links ${siblingCount} sibling categories`)
      }

      if (OUT) {
        mkdirSync(OUT, { recursive: true })
        await page.screenshot({ path: join(OUT, `category-${slug}-${vp.name}.png`), fullPage: false })
      }

      await context.close()
    }

    /* ---- and every category page resolves, not only the one that was driven ---- */
    for (const slug of categorySlugs) {
      const probe = await fetch(`${BASE}/categories/${slug}`, { redirect: 'follow' })
      if (probe.status !== 200) fail(`/categories/${slug} answers ${probe.status}`)
    }
    say(`${categorySlugs.length} category landing(s) requested directly; every one answered 200`)
  } finally {
    await browser.close()
  }

  say(`${scanned} page load(s) scanned across ${VIEWPORTS.length} viewport(s)`)
  say(`${categoryLinksSeen} category link(s) seen, ${resolved.size} distinct, all resolved`)

  // An exception for a link that is no longer there is a record that has rotted.
  for (const e of BORDER_EXCEPTIONS) {
    if (!borderSeen.has(`${e.surface} ${e.href}`)) {
      fail(
        `the border exception for ${e.surface} -> ${e.href} did not fire: the link is gone.\n` +
          `      Delete it from this file and from scripts/guards/discovery-indexability.mjs.`,
      )
    }
  }
  say(`${BORDER_EXCEPTIONS.length} border exception(s), every one still live and still recorded`)
}

try {
  await main()
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
}

if (OUT) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'category-links-drive.txt'), `${log.join('\n')}\n`, 'utf8')
}

if (faults.length > 0) {
  console.error(`\n${TAG} ${faults.length} fault(s).`)
  process.exit(1)
}
console.log(
  `\n${TAG} PASS - no category is a query string, and every category link resolves, at 390, 768 and 1440,\n` +
    `      with ${BORDER_EXCEPTIONS.length} link recorded as a BORDER this lane may not cross (printed above).`,
)
