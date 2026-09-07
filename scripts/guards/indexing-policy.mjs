/**
 * THE INDEXING POLICY HOLDS, OR THE BUILD FAILS (close-out C19.6, 8 September 2026).
 *
 * Google Search Console reported five exclusion reasons against this platform on
 * 6 September 2026. Two of them were self-inflicted and neither was visible to
 * any check in the tree:
 *
 *   - the root layout declared `alternates: { canonical: '/' }`, and Next merges
 *     metadata field by field, so 57 routes published the HOMEPAGE as their own
 *     canonical. Seven were indexable AND in the sitemap.
 *   - 545 of the 550 URLs in the production sitemap were templated discovery
 *     pages holding no events, which Google collapses as duplicates.
 *
 * src/lib/seo/indexing-policy.ts is now the one place that says what may be
 * indexed. This guard fails the build when the tree stops agreeing with it.
 * It judges the OUTCOME each page declares, not the spelling: a route is
 * "noindex" whether it reaches that through the shared noIndexMetadata() helper
 * or through a literal `index: false` in its own file or in a layout above it.
 * A guard that insisted on one spelling would have produced a 61-file rewrite
 * for no change in behaviour, and behaviour is the thing at risk.
 *
 * WHAT IT CHECKS
 *
 *   1. COMPLETENESS, BOTH DIRECTIONS. Every page route under src/app carries a
 *      class in INDEXING_POLICY, and every classified route still exists. A new
 *      page cannot ship unclassified, and a deleted page cannot rot in the list.
 *   2. NEVER ROUTES ARE NOINDEX. The metadata chain of the page (its own file,
 *      then every layout.tsx from its directory up to src/app) must resolve to
 *      `index: false`. A page whose body is only a redirect is exempt and says
 *      so: a 3xx has no document and therefore no head to put a tag in.
 *   3. INDEXABLE PAGES DECLARE THEIR OWN CANONICAL. Every ALWAYS and CONDITIONAL
 *      page declares `alternates` in its own file (directly, or through
 *      discoveryIndexing(), which carries one). This is the check that would
 *      have caught /help/[slug].
 *   4. THE ROOT LAYOUT DECLARES NO CANONICAL. The defect above, specifically.
 *   5. CONDITIONAL ROUTES APPLY THE THRESHOLD, and the sitemap applies it too:
 *      every conditional page calls discoveryIndexing(), and src/app/sitemap.ts
 *      gates with isDiscoveryIndexable() for each conditional family it
 *      publishes. A page that goes noindex while the sitemap still advertises it
 *      is the contradiction Search Console reports back.
 *   6. THE SITEMAP NEVER NAMES A NEVER ROUTE. Checked against the literal paths
 *      the sitemap source writes.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: whether the RUNNING pages emit
 * what they declare. That is driven, not parsed, by
 * scripts/verify/indexing-drive.mjs, which the pre-push gate runs against the
 * local production build and which can be pointed at production by hand.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/indexing-policy.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const APP = join(ROOT, 'src', 'app')

/**
 * COMMENTS ARE NOT DECLARATIONS, AND THIS GUARD LEARNED THAT ON ITS FIRST RUN.
 *
 * The root-layout check fired against src/app/layout.tsx on the very comment
 * that explains why the canonical was REMOVED from it. Every check below reads
 * the stripped text, so prose about a declaration can never be mistaken for one.
 * `//` preceded by a colon is left alone so the scheme in an https:// literal
 * does not swallow the rest of its line.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/g, '$1')
const readCode = (file) => stripComments(readFileSync(file, 'utf8'))
const TAG = '[indexing-policy]'
const POLICY_FILE = join(ROOT, 'src', 'lib', 'seo', 'indexing-policy.ts')
const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

/* ------------------------------------------- 0. the routes that exist on disk */

/** route -> page file. Route groups stripped, dynamic segments kept as written. */
const pages = new Map()
const walk = (dir, segs) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.') || entry.name.startsWith('@')) continue
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      walk(join(dir, entry.name), isGroup ? segs : [...segs, entry.name])
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      const route = '/' + segs.join('/')
      pages.set(route === '/' ? '/' : route, join(dir, entry.name))
    }
  }
}
walk(APP, [])

/* --------------------------------------------- 1. the policy, read from source */

const policySrc = readCode(POLICY_FILE)
const classified = new Map()
for (const m of policySrc.matchAll(/route: '([^']+)', klass: '(always|conditional|alias|never)'/g)) {
  if (classified.has(m[1])) fail(`${m[1]} is classified twice in src/lib/seo/indexing-policy.ts`)
  classified.set(m[1], m[2])
}
if (classified.size === 0) fail('src/lib/seo/indexing-policy.ts declares no routes; the policy has been emptied')

const thresholdMatch = /export const DISCOVERY_INDEXING_THRESHOLD = (\d+)/.exec(policySrc)
if (!thresholdMatch) fail('DISCOVERY_INDEXING_THRESHOLD is no longer a single named constant in the policy')

for (const route of pages.keys()) {
  if (!classified.has(route)) {
    fail(
      `${route} exists under src/app and is not classified in src/lib/seo/indexing-policy.ts.\n` +
        '        Add it as always, conditional, alias or never with a reason. An unclassified\n' +
        '        page inherits whatever the layout above it says, which is how 57 routes came to\n' +
        '        publish the homepage as their own canonical.',
    )
  }
}
for (const route of classified.keys()) {
  if (!pages.has(route)) {
    fail(`${route} is classified in the policy and no longer exists under src/app; remove the entry`)
  }
}

/* ---------------------------------- 2 and 3. what each page's own chain declares */

/** The page file, then every layout.tsx from its directory up to src/app. */
function metadataChain(file) {
  const chain = [file]
  let dir = dirname(file)
  for (;;) {
    const layout = join(dir, 'layout.tsx')
    if (existsSync(layout)) chain.push(layout)
    if (dir === APP) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return chain
}

const NOINDEX = /index:\s*false|noIndexMetadata\s*\(/
const CANONICAL = /alternates:\s*\{|discoveryIndexing\s*\(|aliasMetadata\s*\(/
/**
 * A page whose default export ONLY redirects. It never renders a document, so
 * there is no head to carry a robots tag or a canonical, and requiring one would
 * be requiring something impossible.
 *
 * THE "NO JSX" CLAUSE IS NOT COSMETIC. Without it this test matched twenty
 * dashboard pages that render a full screen and merely call `redirect('/login')`
 * as their authentication guard, and exempted every one of them from the noindex
 * check. Their outcome happened to be correct, because the (dashboard) layout
 * declares noindex above them, but an exemption that wide would have hidden the
 * next page that had no such layout. Measured on the guard's first run,
 * 8 September 2026: 23 pages matched, 3 of them were actually redirect stubs.
 */
const REDIRECT_ONLY = (src) =>
  /\b(permanentRedirect|redirect)\s*\(/.test(src) &&
  !/export\s+(const\s+metadata|async\s+function\s+generateMetadata)/.test(src) &&
  !/<[A-Za-z]/.test(src)

let neverChecked = 0
let canonicalChecked = 0
let redirectOnly = 0

for (const [route, klass] of classified) {
  const file = pages.get(route)
  if (!file) continue
  const own = readCode(file)

  if (REDIRECT_ONLY(own)) {
    redirectOnly++
    continue
  }

  if (klass === 'never') {
    neverChecked++
    const hit = metadataChain(file).find((f) => NOINDEX.test(readCode(f)))
    if (!hit) {
      fail(
        `${route} is classified never and nothing in its metadata chain declares noindex.\n` +
          `        Chain: ${metadataChain(file).map((f) => f.replace(ROOT + sep, '')).join(' -> ')}\n` +
          '        Add ...noIndexMetadata() from src/lib/seo/indexing-policy to its metadata, or to a\n' +
          '        layout above it. Without it the page inherits the root layout, which says index.',
      )
    }
  }

  if (klass === 'always' || klass === 'conditional') {
    canonicalChecked++
    if (!CANONICAL.test(own)) {
      fail(
        `${route} is indexable and declares no canonical of its own (${file.replace(ROOT + sep, '')}).\n` +
          '        An indexable page must name itself, or it inherits whatever the layout above it\n' +
          '        says. Seven /help/[slug] pages were published in the sitemap telling Google the\n' +
          '        canonical version of each was the homepage, for exactly this reason.',
      )
    }
  }

  if (klass === 'conditional' && !/discoveryIndexing\s*\(/.test(own)) {
    fail(
      `${route} is a templated discovery page and does not call discoveryIndexing().\n` +
        '        Without it the page stays indexable while empty, which is what Google collapsed.',
    )
  }

  if (klass === 'alias' && !/aliasMetadata\s*\(|alternates:\s*\{/.test(own)) {
    fail(`${route} is an alias and names no canonical target`)
  }
}

/* ---------------------------------------------- 4. the root layout, specifically */

const rootLayout = readCode(join(APP, 'layout.tsx'))
if (/alternates:\s*\{/.test(rootLayout)) {
  fail(
    'src/app/layout.tsx declares `alternates` again.\n' +
      '        Next merges metadata field by field, so a canonical here becomes the canonical of\n' +
      '        EVERY page that does not declare its own. That is the defect close-out C19 exists\n' +
      '        to fix; it published the homepage as the canonical of 57 routes.',
  )
}

/* ---------------------------------- 5 and 6. the sitemap agrees with the policy */

const sitemapSrc = readCode(join(APP, 'sitemap.ts'))
if (!/isDiscoveryIndexable\s*\(/.test(sitemapSrc)) {
  fail(
    'src/app/sitemap.ts no longer calls isDiscoveryIndexable().\n' +
      '        The sitemap must publish a templated discovery URL only while that URL is\n' +
      '        indexable, or it advertises noindex pages to Google.',
  )
}

/**
 * Every conditional family the sitemap publishes must be gated. Derived from the
 * policy's own conditional routes rather than written here, so a family added to
 * the policy is checked the day it is added.
 */
const SITEMAP_PATH_OF = {
  '/community/[community]': '/community/${community.slug}',
  '/community/[community]/[city]': '/community/${community.slug}/${city.slug}',
  '/city/[slug]': '/city/${city.slug}',
  '/city/[slug]/[suburb]': '/city/${city.slug}/${facing}',
  '/categories/[slug]': '/categories/${category.slug}',
  '/events/browse/[city]': '/events/browse/${c.slug}',
  '/faith/[faith]': '/faith/${faith.slug}',
}
let gatedFamilies = 0
for (const [route, klass] of classified) {
  if (klass !== 'conditional') continue
  const literal = SITEMAP_PATH_OF[route]
  if (!literal) {
    fail(
      `${route} is conditional and this guard does not know how src/app/sitemap.ts writes it.\n` +
        '        Add it to SITEMAP_PATH_OF in this file so the gate below can be checked, or\n' +
        '        state here why the sitemap does not publish it.',
    )
    continue
  }
  const idx = sitemapSrc.indexOf(literal)
  if (idx === -1) {
    // Not published at all is a legitimate state; the sitemap is allowed to hold
    // fewer families than the policy classifies. Nothing to gate.
    continue
  }
  gatedFamilies++
  // The gate must appear in the same loop, before the push. Read backwards from
  // the URL to the loop head and require the guard clause in between.
  /*
   * THE GATE MUST BE IN THE SAME LOOP BODY AS THE URL, and a fixed character
   * window is not good enough to say so. Drilled on 8 September 2026: with the
   * community gate deleted, a +-1200 character window still found the NEIGHBOURING
   * family's gate and the guard passed on a violating tree.
   *
   * So the window runs from the `for (` that opens the loop the URL sits in to
   * the next `for (` after it, which is the next family. The gate can then sit
   * either side of the URL literal (`/categories/[slug]` writes its path in a
   * `const path =` line above the gate; `/city/[slug]` writes it in the entry
   * below) without one family's gate ever standing in for another's.
   */
  const start = sitemapSrc.lastIndexOf('for (', idx)
  const nextFor = sitemapSrc.indexOf('for (', idx)
  const window = sitemapSrc.slice(start === -1 ? 0 : start, nextFor === -1 ? sitemapSrc.length : nextFor)
  if (!/isDiscoveryIndexable\s*\(/.test(window)) {
    fail(
      `src/app/sitemap.ts publishes ${route} without an isDiscoveryIndexable() gate above it.\n` +
        '        An empty templated page in the sitemap is the duplicate Google reported.',
    )
  }
}

const neverRoutes = [...classified].filter(([, k]) => k === 'never').map(([r]) => r)
for (const route of neverRoutes) {
  // Only static NEVER routes can be written as a literal; a dynamic one cannot
  // appear in the sitemap without its segment, and the segment would show here.
  if (route.includes('[')) continue
  if (new RegExp(`\\\$\\{baseUrl\\}${route.replace(/[/\-]/g, (c) => '\\' + c)}[\`'"/]`).test(sitemapSrc)) {
    fail(`src/app/sitemap.ts publishes ${route}, which is classified never (authenticated, transactional or developer-only)`)
  }
}

/* ------------------------------------------------------------------- report */

const counts = { always: 0, conditional: 0, alias: 0, never: 0 }
for (const k of classified.values()) counts[k]++
console.log(
  `${TAG} ${pages.size} page route(s) on disk, ${classified.size} classified ` +
    `(${counts.always} always, ${counts.conditional} conditional, ${counts.alias} alias, ${counts.never} never)`,
)
console.log(
  `${TAG} noindex verified on ${neverChecked} never route(s); own canonical verified on ${canonicalChecked} indexable page(s); ` +
    `${redirectOnly} redirect-only page(s) exempt (a 3xx has no head)`,
)
console.log(`${TAG} threshold DISCOVERY_INDEXING_THRESHOLD=${thresholdMatch ? thresholdMatch[1] : '?'}; ${gatedFamilies} conditional family(ies) gated in the sitemap`)

declareWork('indexing-policy', {
  did: {
    'route classified': classified.size,
    'never route judged': neverChecked,
    'indexable page judged': canonicalChecked,
    'sitemap family gated': gatedFamilies,
  },
  found: { 'indexing fault': faults.length },
})

if (faults.length) {
  console.error(`${TAG} ${faults.length} fault(s). The policy is src/lib/seo/indexing-policy.ts.`)
  process.exit(1)
}
console.log(`${TAG} PASS`)
