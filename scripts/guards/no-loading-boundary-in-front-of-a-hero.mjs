/**
 * A HERO MAY NOT STAND BEHIND A LOADING BOUNDARY.
 *
 * ============================================================================
 * THE MEASUREMENT THAT PRODUCED THIS RULE, 20 September 2026, close-out C8
 * ============================================================================
 *
 * A route-level `loading.tsx` wraps its segment's page in Suspense, and React
 * streams a suspended tree in a fixed order: the shell first, then the RSC
 * FLIGHT PAYLOAD for the whole tree, then the resumed HTML. So the page's own
 * markup lands AFTER the flight payload rather than before it, and the element
 * the page most needs the browser to see early - the hero - lands with it.
 *
 * Read off the served bytes of this tree's production build, warm, byte offset
 * of the first `<img>` in the document:
 *
 *     /                              18,599   no boundary
 *     /events                        34,437   no boundary
 *     /events/browse/melbourne       20,215   no boundary
 *     /events/cat-indie-...         102,160   BEHIND A BOUNDARY
 *     /events/arena-...             102,034   BEHIND A BOUNDARY
 *     /events/artist-layer-...      101,973   BEHIND A BOUNDARY
 *
 * The same document proves the mechanism rather than leaving it as a story:
 * on the homepage the first `self.__next_f.push` is at byte 510,262, AFTER the
 * markup; on an event page it is at byte 15,559, BEFORE it. One route family
 * was wrong and it was the family with the boundary.
 *
 * WHAT IT COST, in the terms the gate uses. Lighthouse mobile, median of five,
 * on `/events/cat-indie-sounds-live-at-the-enmore-sydney`:
 *
 *     with the boundary      perf 0.80   element render delay 603ms
 *     without it             perf 0.84   element render delay 153ms
 *
 * The image was never slow: resource load delay was 12ms, because the hint is
 * in the head. The ELEMENT did not exist yet. Nothing can paint an element the
 * document has not reached, and no amount of preloading changes that.
 *
 * ============================================================================
 * WHY THE RULE IS "NOT AT ALL" RATHER THAN "PRELOAD IT FROM ABOVE"
 * ============================================================================
 *
 * This guard REPLACES `hero-preload-above-the-loading-boundary`, which asked
 * the weaker question: given a hero behind a boundary, is its preload at least
 * requested from a layout above it? That fix was real and is kept in the tree
 * (the hint moved from byte 85,041 into the head at byte 241, and resource load
 * delay fell from a 331ms median to 12ms), but it bought back only ONE of the
 * two terms. The element was still at byte 102,160 and still could not paint.
 *
 * So the rule is now the stronger one, and it subsumes the old one: a hero does
 * not stand behind a boundary, therefore no hero needs rescuing from behind
 * one. The old guard's remaining live trap is kept below as clause 2.
 *
 * ============================================================================
 * WHAT THIS DOES NOT SAY
 * ============================================================================
 *
 * It does not ban `loading.tsx`. Six of them are in this tree and all six are
 * correct: they sit on dashboard and checkout routes, which carry no hero, are
 * behind auth, and are not measured by the performance gate. A boundary in
 * front of slow, heroless content is the feature working as designed. The rule
 * is only about the element that owns the Largest Contentful Paint.
 *
 * Nor does it decide what replaces the skeleton for in-app navigation. That is
 * a design question and it is answered where the decision was made:
 * docs/perf/EVENT-ROUTE-LOADING-BOUNDARY-2026-09-20.md.
 *
 * ============================================================================
 * CLAUSES
 * ============================================================================
 *
 * CLAUSE 1. No hero-bearing page may sit at or below the segment of a
 * `loading.tsx`. Every part of the subject is DERIVED: the boundaries from the
 * tree, the pages behind one from the segment, and hero-bearing from
 * `deriveHeroFiles` plus the value-import graph, so a page that reaches a hero
 * through three templates still counts. There is no list of paths here, because
 * a guard that names its own subject is only right about the files somebody
 * remembered (`scripts/guards/lib/hero-files.mjs` carries that incident).
 *
 * CLAUSE 2. The server module that resolves the hero preload must not import
 * from `react-dom`. Carried over from the guard this replaces, because it is
 * still a live trap and cost real time once: in a server component that
 * specifier resolves to the `react-server` build, where `preload()` has no
 * dispatcher and silently does nothing at all.
 *
 * CLAUSE 3, the anti-false-pass. The PASSING state of clause 1 is a ZERO, which
 * is exactly the shape a broken derivation produces. So a zero is only accepted
 * when the machinery that would have found a fault is demonstrably still
 * working: boundaries must be found, and at least one PAGE must still be
 * recognised as hero-bearing. The hero LIST is not re-checked here because
 * `deriveHeroFiles` throws on a short list by its own floor, and a clause that
 * cannot be reached is a clause that cannot be drilled; the body says so where
 * the check would have been.
 *
 * Exit 1 with every fault named, or exit 0 with what it judged. Drilled red and
 * green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { deriveHeroFiles } from './lib/hero-files.mjs'
import { buildImportGraph, pathToTarget } from './lib/import-graph.mjs'
import { declareWork } from '../lib/work-report.mjs'

/** The server module that resolves an event's hero preload, if the tree still has one. */
const RESOLVER = 'src/lib/images/hero-preload.tsx'

const norm = (p) => p.split(sep).join('/')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(norm(full))
  }
  return out
}

/**
 * Every `page.tsx` that renders inside the Suspense boundary a `loading.tsx`
 * creates: its own segment's page, and every page below that segment.
 */
export function pagesBehind(loadingFile, pages) {
  const segment = loadingFile.slice(0, -'/loading.tsx'.length)
  return pages.filter((p) => p === segment + '/page.tsx' || p.startsWith(segment + '/'))
}

export function judge(root = 'src') {
  const faults = []
  const files = walk(join(root, 'app'))
  const loadings = files.filter((f) => f.endsWith('/loading.tsx'))
  const pages = files.filter((f) => f.endsWith('/page.tsx'))
  const heroFiles = deriveHeroFiles(root)
  const heroSet = new Set(heroFiles)
  const graph = buildImportGraph()

  const isHeroBearing = (page) => heroSet.has(page) || heroFiles.some((hero) => pathToTarget(graph, page, hero))

  // Counted over ALL pages, not only those behind a boundary, because clause 3
  // needs to know the detector still detects when clause 1 finds nothing.
  const heroPages = pages.filter(isHeroBearing)
  const heroPageSet = new Set(heroPages)

  // CLAUSE 1. The rule itself.
  for (const loading of loadings) {
    for (const page of pagesBehind(loading, pages)) {
      if (!heroPageSet.has(page)) continue
      faults.push(
        page +
          ' renders a hero and sits behind ' +
          loading +
          '. A loading boundary makes React stream the flight payload BEFORE the resumed markup, which put this ' +
          "route's hero <img> at byte 102,160 of a 205,226 byte document against 18,599 on a route with no " +
          'boundary, and cost 450ms of LCP element render delay (measured, 20 September 2026). Delete the ' +
          'boundary, or move the hero above it.',
      )
    }
  }

  // CLAUSE 2. The server-side resolver must not reach for react-dom's preload.
  if (existsSync(RESOLVER) && /from ['"]react-dom['"]/.test(readFileSync(RESOLVER, 'utf8'))) {
    faults.push(
      RESOLVER +
        ' imports from react-dom. In a server component that resolves to the react-server build, where ' +
        'preload() has no dispatcher and silently does nothing. The call belongs in a client component.',
    )
  }

  /*
   * CLAUSE 3. A zero is the passing state here, so blindness must be excluded.
   *
   * `heroFiles` is NOT re-checked for zero, and that is deliberate rather than
   * an omission: `deriveHeroFiles` throws on a short list by its own floor
   * (IMPLAUSIBLY_FEW), so it can never hand this guard an empty array to
   * misread. A first version of this clause did check it, and the drill written
   * to prove the check fired reported 0 of 1 - the guard was exiting on the
   * upstream throw and never reaching the line. An unreachable clause with a
   * drill that cannot fire it is the exact shape this repository calls a clause
   * nobody can test, so it was removed rather than left looking careful.
   */
  if (loadings.length === 0) {
    faults.push(
      'no loading.tsx found under src/app: the derivation of boundaries has gone blind, so clause 1 could not ' +
        'have failed. There were 6 on 20 September 2026 (dashboard and checkout).',
    )
  }
  if (heroPages.length === 0) {
    faults.push(
      'no page anywhere was recognised as hero-bearing: the import graph reached no hero file from any page, so ' +
        'clause 1 could not have failed. deriveHeroFiles throws if the hero list itself goes short, so a zero ' +
        'here means the PAGE side of the join broke.',
    )
  }

  return {
    faults,
    loadings: loadings.length,
    pages: pages.length,
    heroFiles: heroFiles.length,
    heroPages: heroPages.length,
  }
}

const invokedDirectly =
  process.argv[1] && /no-loading-boundary-in-front-of-a-hero\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const r = judge()
  /*
   * exitOnZero is OFF because this caller exits itself immediately below, and a
   * zero here is the PASSING state rather than a sign of no work. Clause 3 is
   * what stands in for exitOnZero on this guard, and it is stricter: it checks
   * that the machinery which would have found a fault is still alive.
   */
  declareWork('no-loading-boundary-in-front-of-a-hero', {
    did: {
      'loading boundary read': r.loadings,
      'page judged': r.pages,
      'hero file derived': r.heroFiles,
      'hero-bearing page recognised': r.heroPages,
    },
    found: { 'hero standing behind a loading boundary': r.faults.length },
    zeroIsFine: {
      'hero standing behind a loading boundary':
        'no hero-bearing page sits behind a loading boundary, which is the rule; clause 3 proves the derivation ' +
        'that would have found one is still working',
    },
    exitOnZero: false,
  })
  if (r.faults.length) {
    console.error('FAIL no-loading-boundary-in-front-of-a-hero: ' + r.faults.length + ' fault(s)')
    for (const f of r.faults) console.error('  ' + f)
    process.exit(1)
  }
}
