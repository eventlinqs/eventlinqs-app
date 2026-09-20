/**
 * A HERO BEHIND A LOADING BOUNDARY MUST BE ASKED FOR FROM ABOVE IT.
 *
 * ============================================================================
 * THE DEFECT THIS EXISTS TO STOP COMING BACK
 * ============================================================================
 *
 * `next/image` emits its `<link rel="preload" as="image">` where the element
 * RENDERS, and React can only hoist that into `<head>` while the head is still
 * open. A route-level `loading.tsx` puts the WHOLE page behind Suspense, so the
 * head closes with the SKELETON and everything the page emits afterwards lands
 * in the body, however high in the page the hero sits.
 *
 * Measured on this tree's production build, 20 September 2026, byte offset of
 * `as="image"` in the served document, per gated route:
 *
 *     /                              241   in head
 *     /events                        241   in head
 *     /events/browse/melbourne       241   in head
 *     /community/african             241   in head
 *     /organisers                    241   in head
 *     /login, /signup                241   in head
 *     /events/arena-...           85,169   IN THE BODY
 *     /events/cat-indie-...       85,041   IN THE BODY
 *     /events/artist-layer-...    84,897   IN THE BODY
 *
 * One route family was wrong and it was the one with the loading boundary. The
 * browser could not ask for the LCP image on an event page until it had parsed
 * 41 per cent of a 205 KB document, and Lighthouse charged it: a
 * `Resource load delay` MEDIAN of 331ms on cat-indie and 533ms on the arena
 * page over five runs each, against a `Resource load duration` of 6ms. After
 * the fix, 11ms and 12ms.
 *
 * ============================================================================
 * WHAT IT JUDGES, AND WHY EVERY PART OF THE SUBJECT IS DERIVED
 * ============================================================================
 *
 * Nothing here is a list of paths. A guard that names its own subject is a
 * guard that is right about the files somebody remembered, which this
 * repository has now paid for twice in one week (scripts/guards/lib/hero-files.mjs
 * carries that incident).
 *
 *   THE BOUNDARIES are every `loading.tsx` under `src/app`, read from the tree.
 *   THE PAGES behind one are every `page.tsx` at or below its segment.
 *   HERO-BEARING is decided by `deriveHeroFiles`, which derives a hero from two
 *     separately-enforced laws (the locked `.hero-marketing` scale and rendering
 *     `<HeroMedia>`), plus the value-import graph, so a page that reaches a hero
 *     through three templates still counts.
 *   ABOVE THE BOUNDARY means a `layout.tsx` in the boundary's own segment or any
 *     ancestor of it: a layout renders OUTSIDE the loading boundary that wraps
 *     its own children, which is the whole mechanism.
 *
 * CLAUSE 1. A hero-bearing page behind a loading boundary must have such a
 * layout, and that layout must render the preload.
 *
 * CLAUSE 2. The preload must not be asked for from a page that is itself behind
 * a boundary, because there it does nothing. This is not hypothetical: it was
 * attempted twice while this change was being built, once from
 * `generateMetadata` and once from the server layout through `react-dom`, and
 * both left the link at byte 85,038 of the served document.
 *
 * CLAUSE 3. The module that resolves the preload is server-only and must not
 * import from `react-dom`, because in a server component that specifier
 * resolves to the `react-server` build where `preload()` has no dispatcher and
 * silently does nothing. next/image does not use that path either; it calls
 * `preload` from a CLIENT component during the SSR render.
 *
 * CLAUSE 4, the anti-false-pass. If the derivation finds no boundaries, or no
 * hero files, or no hero-bearing page behind a boundary, this guard has gone
 * blind and says so rather than printing a confident zero. The counts on
 * 20 September 2026: 7 boundaries, 13 hero files, 1 hero-bearing page behind a
 * boundary (`src/app/events/[slug]/page.tsx`).
 *
 * CLAUSE 5. EVERY BRANCH OF THE ASKING LAYOUT DECIDES, and this clause exists
 * because the first version of this guard did not have it and the drill harness
 * caught that: clause 1 asks only whether the layout MENTIONS the preload, so a
 * layout that asks on one branch and silently returns `children` on three more
 * passed. The route's layout has four branches that render the page and one of
 * them deliberately does not preload. So a layout that asks at all must return
 * through `withHeroPreload(...)` or `withoutHeroPreload(...)` on every branch,
 * and a bare `return children` fails. The exemption is then a named function in
 * the code with its reason beside it, rather than a path in an allowlist here.
 *
 * Exit 1 with every fault named, or exit 0 with what it judged. Drilled red and
 * green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { deriveHeroFiles } from './lib/hero-files.mjs'
import { buildImportGraph, pathToTarget } from './lib/import-graph.mjs'
import { declareWork } from '../lib/work-report.mjs'

/** The server module that resolves an event's hero preload. */
const RESOLVER = 'src/lib/images/hero-preload.tsx'
/**
 * A file asks for the hero preload when it IMPORTS one of the three names that
 * can produce it.
 *
 * IT IS THE IMPORT AND NOT A FILE-WIDE GREP, and the drill harness is why. The
 * first version matched the names anywhere in the file, and the drill that
 * removed the ask from one of the layout's four branches PASSED, because the
 * other three still mentioned it. A clause that only a four-part edit can
 * falsify is a clause nobody can test, and an untestable clause is one nobody
 * finds out is broken. Keyed on the import, one edit falsifies it, and CLAUSE 5
 * is what then holds the four branches.
 */
const ASKS_FOR_THE_PRELOAD =
  /import\s*(?:type\s*)?\{[^}]*\b(?:eventHeroPreloadLink|heroPreloadLink|HeroPreloadLink)\b[^}]*\}\s*from/

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
function pagesBehind(loadingFile, pages) {
  const segment = loadingFile.slice(0, -'/loading.tsx'.length)
  return pages.filter((p) => p === segment + '/page.tsx' || p.startsWith(segment + '/'))
}

/** The layouts that render OUTSIDE a boundary: its own segment's, and every ancestor's. */
function layoutsAboveTheBoundary(loadingFile, layouts) {
  const segment = loadingFile.slice(0, -'/loading.tsx'.length)
  return layouts.filter((l) => {
    const dir = l.slice(0, -'/layout.tsx'.length)
    return segment === dir || segment.startsWith(dir + '/')
  })
}

export function judge(root = 'src') {
  const faults = []
  const files = walk(join(root, 'app'))
  const loadings = files.filter((f) => f.endsWith('/loading.tsx'))
  const pages = files.filter((f) => f.endsWith('/page.tsx'))
  const layouts = files.filter((f) => f.endsWith('/layout.tsx'))
  const heroFiles = deriveHeroFiles(root)
  const heroSet = new Set(heroFiles)
  const graph = buildImportGraph()

  const isHeroBearing = (page) =>
    heroSet.has(page) || heroFiles.some((hero) => pathToTarget(graph, page, hero))

  let behindCount = 0
  const guarded = []
  for (const loading of loadings) {
    for (const page of pagesBehind(loading, pages)) {
      if (!isHeroBearing(page)) continue
      behindCount += 1
      const above = layoutsAboveTheBoundary(loading, layouts)
      const asking = above.filter((l) => ASKS_FOR_THE_PRELOAD.test(readFileSync(l, 'utf8')))
      if (asking.length === 0) {
        faults.push(
          page + ' renders a hero and sits behind ' + loading + ', and no layout above that boundary asks for it. ' +
            'Its preload will be emitted where the hero renders, which is in the BODY. Render it from ' +
            (above[0] ?? 'a layout.tsx beside ' + loading) + '.',
        )
      } else {
        guarded.push(page + ' <- ' + asking.join(', '))
        // CLAUSE 5. A layout that asks at all must decide on every branch.
        //
        // Only the exported layout's OWN returns are judged. `withoutHeroPreload`
        // is itself a one-line `return children` and reading it as a fault would
        // make the named exemption impossible to express, which is the opposite
        // of what this clause is for. The region is taken from `export default`
        // to the end of the file rather than by naming the helper, so a second
        // helper cannot be smuggled past it either.
        for (const layout of asking) {
          const src = readFileSync(layout, 'utf8')
          const lines = src.split(/\r?\n/)
          const start = lines.findIndex((l) => /^export default\b/.test(l))
          const bare = lines
            .map((line, i) => ({ line: line.trim(), n: i + 1 }))
            .filter(({ n }) => start >= 0 && n > start)
            .filter(({ line }) => /\breturn children\b/.test(line))
          for (const { n } of bare) {
            faults.push(
              layout + ':' + n + ' returns children without deciding about the hero. ' +
                'Every branch of a layout that asks for the preload returns through withHeroPreload(...) ' +
                'or withoutHeroPreload(...), so a branch that skips the LCP image says so by name.',
            )
          }
        }
      }

      // CLAUSE 2. Asking from inside the boundary does nothing, measured twice.
      if (ASKS_FOR_THE_PRELOAD.test(readFileSync(page, 'utf8'))) {
        faults.push(
          page + ' asks for the hero preload from INSIDE the ' + loading + ' boundary, where it cannot reach the head. ' +
            'Move the call to a layout above the boundary.',
        )
      }
    }
  }

  // CLAUSE 3. The server-side resolver must not reach for react-dom's preload.
  if (/from ['"]react-dom['"]/.test(readFileSync(RESOLVER, 'utf8'))) {
    faults.push(
      RESOLVER + ' imports from react-dom. In a server component that resolves to the react-server build, where ' +
        'preload() has no dispatcher and silently does nothing. The call belongs in a client component.',
    )
  }

  // CLAUSE 4. Blindness is a failure, not a zero.
  if (loadings.length === 0) faults.push('no loading.tsx found under src/app: the derivation of boundaries has gone blind.')
  if (heroFiles.length === 0) faults.push('deriveHeroFiles returned nothing: the derivation of heroes has gone blind.')
  if (behindCount === 0) {
    faults.push(
      'no hero-bearing page was found behind any loading boundary. That was 1 on 20 September 2026 ' +
        '(src/app/events/[slug]/page.tsx); a zero means the import graph or the hero derivation stopped seeing it, ' +
        'not that the defect is gone.',
    )
  }

  return { faults, loadings: loadings.length, pages: pages.length, heroFiles: heroFiles.length, behindCount, guarded }
}

const invokedDirectly =
  process.argv[1] && /hero-preload-above-the-loading-boundary\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const r = judge()
  /*
   * exitOnZero is OFF because this caller exits itself immediately below, and a
   * zero here always arrives WITH clause 4's fault. Letting declareWork exit
   * first printed "DID NOTHING" and swallowed the sentence that says what a zero
   * actually means, which is the more useful half of the message.
   */
  declareWork('hero-preload-above-the-loading-boundary', {
    did: {
      'loading boundary read': r.loadings,
      'page judged': r.pages,
      'hero file derived': r.heroFiles,
      'hero-bearing page behind a boundary judged': r.behindCount,
    },
    found: { 'preload asked for from the wrong side of a boundary': r.faults.length },
    zeroIsFine: {
      'preload asked for from the wrong side of a boundary':
        'every hero behind a loading boundary is preloaded from above it, which is the point of the guard',
    },
    exitOnZero: false,
  })
  if (r.faults.length) {
    console.error('FAIL hero-preload-above-the-loading-boundary: ' + r.faults.length + ' fault(s)')
    for (const f of r.faults) console.error('  ' + f)
    process.exit(1)
  }
  for (const g of r.guarded) console.log('  ' + g)
}
