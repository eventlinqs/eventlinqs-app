/**
 * GUARD: THE WEEKEND SURFACE IS ONE DECISION, TAKEN ONCE, IN ONE PLACE.
 *
 * ============================================================================
 * WHY THIS GUARD EXISTS
 * ============================================================================
 *
 * `/this-weekend` (close-out AQ3) is the only page on this platform whose entire
 * contents expire on a schedule. Every Sunday night it empties itself, and on a
 * thin catalogue it is empty for most of the week. AQ3 rules on exactly that:
 *
 *     "if a surface cannot be filled with real events it is not published,
 *      because an empty city page is worse than no city page"
 *
 * So the page has to leave the sitemap and go noindex on its own, and come back
 * on its own, and those two movements have to be the SAME movement. A sitemap
 * that advertises a URL whose page says noindex is not a cosmetic inconsistency:
 * it is verbatim one of the five exclusion reasons Google Search Console
 * reported against this platform on 6 September 2026 ("duplicate, Google chose
 * different canonical than user"), and answering those reports is what
 * close-out C19 and SEO3 were raised to do.
 *
 * THE MECHANISM THAT MAKES IT IMPOSSIBLE is that the page and the sitemap ask
 * ONE function, `loadWeekendSurface`, which is one cache entry behind the same
 * fetcher `/events?preset=weekend` uses. Three surfaces, one query, one count.
 * Nothing about that arrangement is visible to lint, to the compiler or to a
 * test of either half on its own: the page would typecheck perfectly while
 * counting something else, and the sitemap would typecheck perfectly while
 * publishing the URL unconditionally. This guard is what notices.
 *
 * ============================================================================
 * WHAT IT CHECKS
 * ============================================================================
 *
 *   CLAUSE 1. The module still EXISTS and still EXPORTS the four names the page
 *             and the sitemap are sent to. Without this, a rename would make
 *             every other clause unsatisfiable while this guard reported a pass
 *             on a tree with no weekend surface in it at all. That is the lesson
 *             written into sitemap-resolves after the venue block published
 *             nothing for its whole life.
 *
 *   CLAUSE 2. The PAGE decides its robots directive from the surface's own total
 *             through `discoveryIndexingFor`, the one resolver every conditional
 *             page uses. A page that hardcoded `index: true` would be offering
 *             an empty page to Google every Monday.
 *
 *   CLAUSE 3. The SITEMAP publishes the URL only inside an `isDiscoveryIndexable`
 *             gate, and gets its number from the same `loadWeekendSurface`. An
 *             unconditional `entries.push` here is the defect in its purest
 *             form and is a one-line edit away at all times.
 *
 *   CLAUSE 4. Neither the page nor the sitemap writes the PATH as a literal.
 *             They import the constant. Two string literals that must match are
 *             two chances to publish one URL and canonicalise another, and the
 *             mismatch would be invisible: both files would still compile, the
 *             sitemap would still publish something, and the page would still
 *             render.
 *
 *   CLAUSE 5. The route is classified `conditional` in INDEXING_POLICY.
 *             `always` is the plausible wrong answer - it is a real page with its
 *             own copy, which is what `always` means everywhere else - and it
 *             would publish an empty weekend every week without anything else in
 *             this file noticing.
 *
 *   CLAUSE 6. A DATE PRESET NARROWS THE LISTING WINDOW AND NEVER REPLACES IT.
 *             Both public fetchers used to carry
 *             `if (presetWindow) { bounds } else { listing window }`, so the
 *             founder's ruling of 16 August 2026 ("discovery shows an event
 *             until it has ACTUALLY ENDED") was skipped the moment a reader
 *             chose a preset. The homepage weekend rail dropped finished events
 *             and its own View-all did not. The consolidated call is
 *             unconditional, and this clause fails if it is ever put back behind
 *             a condition, or if a second file starts deciding the combination.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT CHECK, so the silence is not read as coverage
 * ============================================================================
 *
 * It cannot tell whether the NUMBER is right. Whether `loadWeekendSurface`
 * actually returns the events that are on this weekend is a question about a
 * database, and it is answered by driving the page against real rows
 * (scripts/verify/weekend-surface-drive.mjs) rather than by reading source.
 *
 * It does not judge the OTHER conditional families. They have their own
 * coverage in tests/unit/seo/discovery-indexability.test.ts, which generates the
 * real sitemap against a fixture catalogue and counts what comes back.
 *
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run standalone:
 *   node scripts/guards/weekend-surface-one-decision.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[weekend-surface-one-decision]'
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** The module the page and the sitemap import: the READ, plus a re-export. */
export const MODULE = 'src/lib/events/weekend-surface.ts'

/**
 * The leaf beside it, holding the route, the day split and the description.
 *
 * TWO FILES, AND THE SPLIT IS NOT TIDINESS. The read reaches `next/cache`, so a
 * module holding it cannot be loaded by a script outside a Next build. The
 * fixture seeder for this surface verifies its rows by asking `groupWeekendByDay`
 * what it makes of them, and its first run died on `Cannot find module
 * next/cache`. Same split, and the same reason, as discovery-counts.ts and
 * discovery-matchers.ts.
 */
export const LEAF = 'src/lib/events/weekend-days.ts'

/** The two surfaces that ask it, and must ask it the same way. */
export const PAGE = 'src/app/this-weekend/page.tsx'
export const SITEMAP = 'src/app/sitemap.ts'

/** The one module allowed to combine a date preset with the listing window. */
export const FETCHERS = 'src/lib/events/fetchers.ts'

/** The indexing policy, which must class the route conditional. */
export const POLICY = 'src/lib/seo/indexing-policy.ts'

/** Clause 1: what the READ module must keep offering. */
export const REQUIRED_EXPORTS = ['loadWeekendSurface']

/** Clause 1: what the LEAF must keep offering, functions then constants. */
export const REQUIRED_LEAF_EXPORTS = ['groupWeekendByDay', 'describeWeekend', 'weekendSurfaceWindow']
export const REQUIRED_LEAF_CONSTANTS = ['WEEKEND_SURFACE_PATH', 'WEEKEND_SURFACE_LIMIT']

/**
 * Clause 1: the read module must RE-EXPORT the leaf, so one import inside the
 * product gets the identity, the split and the read together. Without it the
 * page could take the route constant from one file and the read from another,
 * and nothing would say the two were about the same surface.
 */
export const REEXPORT = /export\s+\*\s+from\s+['"]\.\/weekend-days['"]/

/** The route itself. Written here only so clause 4 and clause 5 can name it. */
export const ROUTE = '/this-weekend'

/**
 * Clause 1, pure: the names a source no longer offers.
 *
 * @param {string} source the file text
 * @param {string[]} functions export names declared with `function`
 * @param {string[]} constants export names declared with `const`
 */
export function missingExports(source, functions, constants = []) {
  const gone = functions.filter(
    name => !new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).test(source),
  )
  for (const name of constants) {
    if (!new RegExp(`export\\s+const\\s+${name}\\b`).test(source)) gone.push(name)
  }
  return gone
}

/**
 * Clause 6, pure: every line of `fetchers.ts` that calls the listing predicate,
 * with a verdict on whether it is guarded by a condition.
 *
 * A guarded call is the defect restaged: the rule applies to the unfiltered
 * catalogue and is skipped for every preset.
 */
export function conditionalListingCalls(source) {
  const out = []
  source.split(/\r?\n/).forEach((line, i) => {
    if (!line.includes('listingWindowOrPredicate(')) return
    // The import and the declaration are not calls that apply the rule.
    if (/^\s*(import|export function|\*|\/\/)/.test(line)) return
    if (/\bif\s*\(|\belse\b|\?\s|&&|\|\|/.test(line)) out.push({ line: i + 1, text: line.trim() })
  })
  return out
}

/**
 * Source with its comments removed, so clause 4 judges CODE.
 *
 * The first run of this guard failed on its own subject: the page's header
 * explains the surface and names the route inside backticks, and a literal-path
 * check that reads prose is a check that fires on a correct file. A guard that
 * fires on the right answer teaches people to switch it off.
 */
export function stripComments(source) {
  // `.` excludes a line break, so the line-comment pattern needs no character
  // class for it. The `[^:]` in front keeps `https://` out of the match.
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/g, '$1')
}

/** Every .ts/.tsx file under src/, repo-relative with forward slashes. */
export function sourceFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    out.push(relative(ROOT, full).replace(/\\/g, '/'))
  }
  return out
}

const invokedDirectly =
  process.argv[1] && /weekend-surface-one-decision\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const failures = []
  const read = rel => {
    try {
      return readFileSync(join(ROOT, rel), 'utf8')
    } catch (error) {
      // NAMED, never swallowed. "absent" and "unreadable" are different facts and
      // the second is a machine problem rather than a code one.
      failures.push(
        `${rel} could not be read: ${error instanceof Error ? error.message : String(error)}. ` +
          `Every clause below is about that file, so this is a failure rather than a pass with ` +
          `nothing to check.`,
      )
      return null
    }
  }

  /* ------------------------------------------------------------- CLAUSE 1 */
  const moduleSource = read(MODULE)
  if (moduleSource) {
    const gone = missingExports(moduleSource, REQUIRED_EXPORTS)
    if (gone.length > 0) {
      failures.push(
        `${MODULE} no longer exports ${gone.join(', ')}. The page, the sitemap and this guard are all ` +
          `sent here for the weekend surface, so a rename leaves every other clause checking for an ` +
          `import that cannot exist while this guard reports a pass on a tree with no weekend surface ` +
          `in it. Restore the name, or update REQUIRED_EXPORTS in this guard in the same commit.`,
      )
    }
    if (!REEXPORT.test(moduleSource)) {
      failures.push(
        `${MODULE} no longer re-exports ${LEAF}. The page takes the route constant and the read from ` +
          `ONE specifier on purpose; split them and the two halves of one surface become two imports ` +
          `with nothing holding them together.`,
      )
    }
  }
  const leafSource = read(LEAF)
  if (leafSource) {
    const gone = missingExports(leafSource, REQUIRED_LEAF_EXPORTS, REQUIRED_LEAF_CONSTANTS)
    if (gone.length > 0) {
      failures.push(
        `${LEAF} no longer exports ${gone.join(', ')}. This is the half a script can load outside a Next ` +
          `build, which is how the fixture seeder verifies its rows through the SHIPPED grouping rather ` +
          `than a second copy of it. A rename here breaks that silently.`,
      )
    }
  }

  /* ------------------------------------------------------------- CLAUSE 2 */
  const pageSource = read(PAGE)
  if (pageSource) {
    if (!/from\s+['"]@\/lib\/events\/weekend-surface['"]/.test(pageSource)) {
      failures.push(
        `${PAGE} does not import from ${MODULE}. The page must read the weekend from the one module the ` +
          `sitemap reads it from, or the two are free to answer differently about whether this URL is ` +
          `worth offering to a search engine.`,
      )
    }
    if (!/discoveryIndexingFor\(\s*total\s*,\s*WEEKEND_SURFACE_PATH\s*\)/.test(pageSource)) {
      failures.push(
        `${PAGE} does not decide its robots directive with ` +
          `discoveryIndexingFor(total, WEEKEND_SURFACE_PATH). This page empties itself every Sunday ` +
          `night, so a fixed directive offers Google an empty page every Monday. That is AQ3's own ` +
          `reversal condition and it is the reason the route is classed conditional.`,
      )
    }
  }

  /* ------------------------------------------------------------- CLAUSE 3 */
  const sitemapSource = read(SITEMAP)
  if (sitemapSource) {
    if (!/from\s+['"]@\/lib\/events\/weekend-surface['"]/.test(sitemapSource)) {
      failures.push(
        `${SITEMAP} does not import from ${MODULE}, so its weekend decision comes from somewhere other ` +
          `than the page's. One query, one count, or the two disagree.`,
      )
    }
    const gate =
      /isDiscoveryIndexable\(\s*weekendSurface\.total\s*,\s*threshold\s*\)\s*\)\s*\{[\s\S]{0,400}?WEEKEND_SURFACE_PATH/
    if (!gate.test(sitemapSource)) {
      failures.push(
        `${SITEMAP} publishes ${ROUTE} without an isDiscoveryIndexable(weekendSurface.total, threshold) ` +
          `gate immediately around it. An unconditional entry advertises a page that says noindex about ` +
          `itself, which is exactly the contradiction Search Console reported back on 6 September 2026.`,
      )
    }
  }

  /* ------------------------------------------------------------- CLAUSE 4 */
  for (const [rel, source] of [
    [PAGE, pageSource],
    [SITEMAP, sitemapSource],
  ]) {
    if (!source) continue
    if (new RegExp(`['"\`]${ROUTE}['"\`]`).test(stripComments(source))) {
      failures.push(
        `${rel} writes the path "${ROUTE}" as a literal. Import WEEKEND_SURFACE_PATH instead. Two ` +
          `literals that must match are two chances to publish one URL and canonicalise another, and ` +
          `nothing about that mismatch would fail to compile or fail to render.`,
      )
    }
  }

  /* ------------------------------------------------------------- CLAUSE 5 */
  const policySource = read(POLICY)
  if (policySource) {
    const entry = new RegExp(`route:\\s*'${ROUTE}',\\s*klass:\\s*'([a-z]+)'`).exec(policySource)
    if (!entry) {
      failures.push(
        `${POLICY} carries no entry for ${ROUTE}. Every page route under src/app carries exactly one ` +
          `class; an unclassified one is a page nobody has decided about.`,
      )
    } else if (entry[1] !== 'conditional') {
      failures.push(
        `${POLICY} classes ${ROUTE} as '${entry[1]}' and it must be 'conditional'. It is a real page with ` +
          `its own copy, which is what 'always' means everywhere else on this platform, and it is also ` +
          `the one page guaranteed to be empty on a schedule. 'always' would publish an empty weekend ` +
          `every week and nothing else in this guard would notice.`,
      )
    }
  }

  /* ------------------------------------------------------------- CLAUSE 6 */
  const fetchersSource = read(FETCHERS)
  if (fetchersSource) {
    for (const hit of conditionalListingCalls(fetchersSource)) {
      failures.push(
        `${FETCHERS}:${hit.line} applies the listing window behind a condition: "${hit.text}". A date ` +
          `preset NARROWS the listing window and never replaces it. Written as a condition, the founder's ` +
          `ruling of 16 August 2026 is skipped the moment a reader picks a preset, and /events?preset=weekend ` +
          `lists gigs that finished yesterday while the homepage rail above the same link does not.`,
      )
    }
  }

  /* A SECOND FILE DECIDING THE COMBINATION is the same defect wearing a new path. */
  const files = sourceFiles()
  let combiners = 0
  for (const rel of files) {
    if (rel === FETCHERS) continue
    const source = readFileSync(join(ROOT, rel), 'utf8')
    if (!source.includes('presetWindow(')) continue
    if (!source.includes('listingWindowOrPredicate(')) continue
    combiners += 1
    failures.push(
      `${rel} calls BOTH presetWindow and listingWindowOrPredicate. How a date preset combines with the ` +
        `listing window is one decision and it lives in applyDateWindow in ${FETCHERS}. A second copy is ` +
        `a second answer to "does a finished event still count as on this weekend".`,
    )
  }

  declareWork('weekend-surface-one-decision', {
    did: {
      'source file read': files.length,
      'clause checked': 6,
    },
    found: {
      'weekend-surface fault': failures.length,
      'second preset-and-listing combiner': combiners,
    },
    zeroIsFine: {
      'weekend-surface fault':
        'the page, the sitemap and the filter all read one function, which is the point of the guard',
      'second preset-and-listing combiner':
        'applyDateWindow is the only place the two rules meet',
    },
  })

  if (failures.length > 0) {
    console.error(`\n${TAG} FAIL - ${failures.length} problem(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  } else {
    console.log(
      `${TAG} PASS - ${ROUTE} is classed conditional, ${PAGE} and ${SITEMAP} both read ` +
        `${MODULE} and neither writes the path as a literal, and the listing window is applied ` +
        `unconditionally in ${FETCHERS}.`,
    )
  }
}
