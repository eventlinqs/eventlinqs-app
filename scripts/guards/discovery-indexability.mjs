/**
 * GUARD: THE DISCOVERY LAYER STAYS VISIBLE, AND STAYS HONEST ABOUT IT.
 *
 * Close-out SEO3 names the invariant in one sentence: "no page carrying noindex
 * may appear in the sitemap; no page meeting the substance threshold may carry
 * noindex; and no category may exist only as a query string."
 *
 * WHY IT IS A SECOND GUARD AND NOT A CLAUSE OF indexing-policy.mjs. That guard
 * judges CLASSIFICATION: is every route classified, does a NEVER route reach
 * noindex, does an indexable page name a canonical, does the sitemap gate each
 * family at all. It deliberately stops at "a gate exists". This one judges
 * AGREEMENT: that the gate on the page and the gate in the sitemap are asking
 * the same question of the same numbers, and that a category is a page rather
 * than a filter. Those are the three ways the audit of 13 September 2026 found
 * the layer failing while every existing check was green.
 *
 * ============================================================================
 * THE THREE CLAUSES
 * ============================================================================
 *
 * CLAUSE 1. THE PAGE AND THE SITEMAP COUNT THE SAME THING.
 *   Every conditional family decides its robots directive from a count function
 *   (countCity, countCommunity, countCategory, countOrganiser ...). The sitemap
 *   decides whether to publish the same family from a count function too. If the
 *   two are not the SAME function, the page can say noindex while the sitemap
 *   advertises the URL, which is precisely the exclusion Search Console reports
 *   back, and indexing-policy.mjs cannot see it: it only asks whether a gate is
 *   present, and a gate counting the wrong dimension is present.
 *
 * CLAUSE 2. NOTHING OVERRIDES THE THRESHOLD, AND NOTHING RE-SPELLS IT.
 *   A conditional page that also spreads noIndexMetadata(), or hardcodes
 *   `index: false`, is noindex forever however full it gets. A page that reaches
 *   for DISCOVERY_INDEXING_THRESHOLD itself, or calls the PURE discoveryIndexing
 *   / isDiscoveryIndexable rather than the resolver, is judging itself against
 *   the number compiled into the build while the sitemap uses the number the
 *   owner set, and the two then disagree in public. Both are "a page meeting the
 *   substance threshold carries noindex" wearing different clothes.
 *
 * CLAUSE 3. A CATEGORY IS A PAGE.
 *   Every slug in `public.event_categories` resolves to a real page with its own
 *   canonical, its own title and its own written editorial, and nothing on the
 *   platform navigates to a category through `/events?category=`, which
 *   canonicalises to `/events` and can therefore never rank for the term the
 *   link names. Checked in both directions against the LIVE taxonomy, so a row
 *   added to the database fails the build until somebody writes its copy, and an
 *   editorial entry for a row that no longer exists fails it too.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: whether the RUNNING pages emit
 * what they declare, and whether the RUNNING sitemap publishes what this says it
 * will. That is driven, not parsed, by scripts/verify/indexing-drive.mjs.
 *
 * Run: node scripts/guards/discovery-indexability.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const APP = join(ROOT, 'src', 'app')
const SITEMAP = join(APP, 'sitemap.ts')
const EDITORIAL = 'src/lib/categories/category-editorial.ts'
const CATEGORY_ROUTE = 'src/app/categories/[slug]/page.tsx'
const POLICY = 'src/lib/seo/indexing-policy.ts'
const THRESHOLD_MODULE = 'src/lib/seo/discovery-threshold.ts'

const failures = []
const fail = m => failures.push(m)

/**
 * Source with comments removed. COMMENTS ARE NOT DECLARATIONS, and every clause
 * below reads the stripped text for the same reason indexing-policy.mjs does:
 * its own root-layout check fired on the comment explaining why the canonical
 * had been removed. `//` preceded by a colon is left alone so the scheme in an
 * https:// literal does not swallow the rest of its line.
 */
function readCode(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/* ======================================================================== */
/* CLAUSE 1. The page and the sitemap count the same thing.                  */
/* ======================================================================== */

/**
 * The conditional families, and the page file that decides each one.
 *
 * DERIVED FROM THE POLICY, NEVER TYPED. The list of conditional routes is read
 * out of src/lib/seo/indexing-policy.ts, so a family added there is checked here
 * without anybody remembering to add it, and a family removed there stops being
 * checked without a stale entry rotting in this file.
 */
function conditionalRoutes() {
  const src = readFileSync(join(ROOT, POLICY), 'utf8')
  const out = []
  for (const m of src.matchAll(/\{\s*route:\s*'([^']+)'\s*,\s*klass:\s*'conditional'/g)) {
    out.push(m[1])
  }
  return out
}

/** The page file for a route as written under src/app. */
function pageFile(route) {
  const rel = route === '/' ? '' : route.slice(1)
  for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
    const f = join(APP, ...(rel ? rel.split('/') : []), `page.${ext}`)
    if (existsSync(f)) return f
  }
  return null
}

/** Every `countSomething(` identifier named in a chunk of source. */
function countsIn(code) {
  return new Set([...code.matchAll(/\b(count[A-Z]\w*)\s*\(/g)].map(m => m[1]))
}

/**
 * Every sitemap loop body that publishes a route family.
 *
 * The window runs from the `for (` that opens the loop the URL literal sits in
 * to the next `for (` after it, which is the same windowing indexing-policy.mjs
 * settled on after a fixed character window was drilled and found the
 * NEIGHBOURING family's gate. A family may be published by more than one loop
 * (`/categories/[slug]` is published by the legacy hero block and by the live
 * taxonomy block), so every occurrence is returned rather than the first.
 */
function sitemapWindows(sitemapSrc, route) {
  /*
   * THE URL TEMPLATE IS MATCHED WHOLE, NOT BY PREFIX, and that is not a detail.
   * A prefix match on `${baseUrl}/city/` also matches `${baseUrl}/city/${city.slug}/${facing}`,
   * so the city family was being judged against the SUBURB loop's gate, and
   * `/community/[community]` against the intersection loop's. Drilled on the
   * real sitemap on 14 September 2026: two false failures, both of them the
   * guard reading one family's gate as another's, which is exactly the mistake
   * indexing-policy.mjs's own window comment records making with a fixed
   * character span.
   *
   * So every `${baseUrl}...` template in the sitemap is normalised by replacing
   * each interpolation with [], and compared with the route normalised the same
   * way. `/city/[]` and `/city/[]/[]` are then different families, which they
   * are.
   */
  const want = route.replace(/\[[^\]]+\]/g, '[]').replace(/\/$/, '')
  const windows = []
  /*
   * BOTH SHAPES. Most blocks write the whole URL inline as `${baseUrl}/x/${y}`.
   * The legacy hero-category block writes `const path = \`/categories/${slug}\``
   * first and then `${baseUrl}${path}`, which normalises to [] and would match
   * nothing, so that loop would be silently unchecked. A bare path template
   * beginning with / is read too.
   */
  const templates = [
    ...sitemapSrc.matchAll(/`\$\{baseUrl\}([^`]*)`/g),
    ...sitemapSrc.matchAll(/`(\/[^`]*)`/g),
  ]
  for (const m of templates) {
    const got = m[1].replace(/\$\{[^}]*\}/g, '[]').replace(/\/$/, '')
    if (got !== want) continue
    const idx = m.index
    const start = sitemapSrc.lastIndexOf('for (', idx)
    const nextFor = sitemapSrc.indexOf('for (', idx)
    windows.push(
      sitemapSrc.slice(start === -1 ? 0 : start, nextFor === -1 ? sitemapSrc.length : nextFor),
    )
  }
  return windows
}

const sitemapSrc = readCode(SITEMAP)
const routes = conditionalRoutes()
console.log(`discovery-indexability: ${routes.length} conditional route famil(ies) read from ${POLICY}`)

let agreed = 0
for (const route of routes) {
  const file = pageFile(route)
  if (!file) {
    fail(`${route} is classified conditional and has no page file under src/app`)
    continue
  }
  const pageCounts = countsIn(readCode(file))
  const windows = sitemapWindows(sitemapSrc, route)
  if (windows.length === 0) continue // not published at all is a legitimate state

  if (pageCounts.size === 0) {
    fail(
      `${route} is published in the sitemap but its page names no count function.\n` +
        '        The sitemap then decides whether to publish a page the page itself never judged.',
    )
    continue
  }

  for (const window of windows) {
    const windowCounts = countsIn(window)
    const stray = [...windowCounts].filter(c => !pageCounts.has(c))
    if (windowCounts.size === 0) {
      fail(`src/app/sitemap.ts publishes ${route} from a loop that names no count function`)
      continue
    }
    if (stray.length > 0) {
      fail(
        `src/app/sitemap.ts judges ${route} with ${stray.join(', ')}, which its page never calls.\n` +
          `        The page judges itself with ${[...pageCounts].join(', ')}.\n` +
          '        Two different counts means the page can say noindex while the sitemap\n' +
          '        advertises the URL, which is the exclusion Search Console reports back.',
      )
      continue
    }
    agreed++
  }
}
console.log(`  ${agreed} page/sitemap gate pair(s) count the same dimension`)

/* ======================================================================== */
/* CLAUSE 2. Nothing overrides the threshold, and nothing re-spells it.      */
/* ======================================================================== */

for (const route of routes) {
  const file = pageFile(route)
  if (!file) continue
  const code = readCode(file)
  const rel = file.replace(ROOT + sep, '').split(sep).join('/')

  if (/noIndexMetadata\s*\(/.test(code) || /index:\s*false/.test(code)) {
    fail(
      `${route} is a templated discovery page and hardcodes noindex (${rel}).\n` +
        '        It would then stay out of the index however full it gets, which is the\n' +
        '        unconditional noindex close-out SEO3 exists to remove.',
    )
  }
  if (/\bDISCOVERY_INDEXING_THRESHOLD\b/.test(code)) {
    fail(
      `${route} reaches for DISCOVERY_INDEXING_THRESHOLD itself (${rel}).\n` +
        "        That is the BUILD's number. The sitemap uses the owner's, read from\n" +
        '        seo_settings without a deploy, so the two would disagree in public.',
    )
  }
  if (/\b(discoveryIndexing|isDiscoveryIndexable|organiserIndexing|isOrganiserProfileIndexable)\s*\(/.test(code)) {
    fail(
      `${route} calls a PURE indexing predicate rather than the resolver (${rel}).\n` +
        '        The pure ones take the threshold as an argument, and the only argument a\n' +
        '        page file can supply is the compiled constant. Call discoveryIndexingFor()\n' +
        '        or organiserIndexingFor().',
    )
  }
}

/**
 * THE NUMBER IS WRITTEN DOWN ONCE. Anything outside the policy module and the
 * resolver that names the constant is a second spelling of it, and a second
 * spelling is how a page and a sitemap come to disagree.
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}
const ALLOWED_TO_SPELL_THE_THRESHOLD = new Set([POLICY, THRESHOLD_MODULE])
let spellings = 0
for (const file of walk(join(ROOT, 'src'))) {
  const rel = file.replace(ROOT + sep, '').split(sep).join('/')
  if (ALLOWED_TO_SPELL_THE_THRESHOLD.has(rel)) continue
  if (/\bDISCOVERY_INDEXING_THRESHOLD\b/.test(readCode(file))) {
    spellings++
    fail(
      `${rel} names DISCOVERY_INDEXING_THRESHOLD.\n` +
        `        The number lives in ${POLICY} and is resolved through ${THRESHOLD_MODULE}.\n` +
        '        A second spelling is a second answer.',
    )
  }
}
console.log(
  `  threshold spelled in ${ALLOWED_TO_SPELL_THE_THRESHOLD.size} permitted module(s), ${spellings} elsewhere`,
)

/* ======================================================================== */
/* CLAUSE 3. A category is a page, not a query string.                       */
/* ======================================================================== */

/**
 * FILES ALLOWED TO SPELL `/events?category=`, WITH THE REASON ON RECORD.
 *
 * Printed on every run, and an entry that no longer matches anything is itself a
 * failure, so this cannot rot into an unexamined list.
 */
const QUERY_STRING_ALLOWLIST = [
  {
    file: 'src/components/features/organisers/community-strip.tsx',
    reason:
      'LANE B TERRITORY, raised as a BORDER in REVIEW-QUEUE-C.md on 14 September 2026 and not crossed. /organisers is the organiser marketing landing; lane C may not edit it. The tile should point at /categories/comedy, which now exists. DELETE THIS ENTRY when lane B fixes the link.',
  },
]

const CATEGORY_QUERY = /\/events\?category=/
const offenders = []
for (const file of walk(join(ROOT, 'src'))) {
  const rel = file.replace(ROOT + sep, '').split(sep).join('/')
  if (!CATEGORY_QUERY.test(readCode(file))) continue
  offenders.push(rel)
}

console.log('')
console.log(`  query-string allowlist: ${QUERY_STRING_ALLOWLIST.length} entr(ies)`)
for (const entry of QUERY_STRING_ALLOWLIST) {
  const live = offenders.includes(entry.file)
  console.log(`    ${live ? 'live   ' : 'STALE  '} ${entry.file}`)
  if (!live) {
    fail(
      `the query-string allowlist holds ${entry.file}, which no longer spells /events?category=.\n` +
        '        Delete the entry. An allowlist nobody prunes is an allowlist nobody reads.',
    )
  }
}
for (const rel of offenders) {
  if (QUERY_STRING_ALLOWLIST.some(e => e.file === rel)) continue
  fail(
    `${rel} navigates to a category through /events?category=.\n` +
      '        That URL canonicalises to /events, so the link spends its equity on a page\n' +
      '        that can never rank for the term it names. Link to /categories/<slug>.',
  )
}

/** The route must resolve categories from the taxonomy, never from a literal. */
const routeSrc = readCode(join(ROOT, CATEGORY_ROUTE))
if (!/getPublishableCategor(y|ies)\s*\(/.test(routeSrc)) {
  fail(
    `${CATEGORY_ROUTE} does not read the taxonomy through getPublishableCategory().\n` +
      '        Close-out SEO3 step 4 requires the list of categories to come from the\n' +
      '        database and never from a literal list.',
  )
}
if (/permanentRedirect\s*\(\s*[`'"]\/events\?category=/.test(routeSrc)) {
  fail(
    `${CATEGORY_ROUTE} still forwards a real category to /events?category=.\n` +
      '        That forward is what left the platform with no page able to rank for a head\n' +
      '        category query (close-out SEO3).',
  )
}

/* ------------------------------- clause 3, against the LIVE taxonomy ----- */

/*
 * CREDENTIALS, and the same narrow distinction curated-categories-exist.mjs
 * draws. CI's typecheck build uses PLACEHOLDER Supabase values on purpose and
 * has no database behind it; reporting that as drift would be false. A build
 * that deploys always carries real values, because the public-env guard refuses
 * to start otherwise, so nothing that ships can reach the skip.
 */
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
const hasRealProject = typeof url === 'string' && REAL_PROJECT.test(url.trim())

/** The slugs the editorial file writes for, parsed from the one file. */
function editorialSlugs() {
  const src = readFileSync(join(ROOT, EDITORIAL), 'utf8')
  return [...src.matchAll(/^\s{4}slug:\s*'([^']+)'/gm)].map(m => m[1])
}
const written = editorialSlugs()
console.log('')
console.log(`  ${written.length} category editorial entr(ies) in ${EDITORIAL}`)

if (url && !hasRealProject) {
  console.log('')
  console.log('  SKIP (taxonomy half only): NEXT_PUBLIC_SUPABASE_URL is not a real project')
  console.log(`        URL (${url.length} characters), so there is no taxonomy to compare against.`)
  console.log('        This is the CI typecheck build, which uses placeholders by design.')
} else if (!url || !key) {
  fail(
    'no Supabase URL or key in the environment, so the category editorial could not be\n' +
      '        checked against the live taxonomy. This guard FAILS rather than skipping: a\n' +
      '        build that cannot look cannot know whether a category is about to ship with\n' +
      '        no page, and "could not look" reported as a pass is the shape this\n' +
      '        repository has spent a week removing.',
  )
} else {
  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('event_categories').select('slug')
  if (error) {
    fail(`could not read event_categories: ${error.message}`)
  } else {
    const live = new Set((data ?? []).map(r => r.slug))
    console.log(`  ${live.size} row(s) in event_categories`)
    const unwritten = [...live].filter(s => !written.includes(s)).sort()
    const orphaned = written.filter(s => !live.has(s)).sort()
    for (const slug of unwritten) {
      fail(
        `the category "${slug}" exists in event_categories and has no editorial in ${EDITORIAL}.\n` +
          '        It would have to derive its copy from its own name, which is the generic\n' +
          '        template Law 1 refuses and the duplicate Google collapses. Write the copy.',
      )
    }
    for (const slug of orphaned) {
      fail(
        `${EDITORIAL} writes for "${slug}", which is not a row in event_categories.\n` +
          '        /categories/' + slug + ' would 404 while the sitemap advertised it.',
      )
    }
    if (unwritten.length === 0 && orphaned.length === 0) {
      console.log(`  every live category has written editorial, and every entry has a live row`)
    }
  }
}

/* ======================================================================== */

console.log('')
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} discovery-indexability violation(s).`)
  console.error('')
  for (const f of failures) console.error(`  - ${f}`)
  console.error('')
  console.error('  Authority: CLAUDE.md (the indexing policy), src/lib/seo/indexing-policy.ts,')
  console.error('             close-out SEO3.')
  // process.exitCode, never process.exit: this guard does network work, and
  // exiting while a socket closes aborts Node on Windows (nodejs/node#56645).
  process.exitCode = 1
} else {
  console.log('PASS: the discovery layer is indexable, the sitemap agrees with it, and every')
  console.log('      category is a page.')
}
