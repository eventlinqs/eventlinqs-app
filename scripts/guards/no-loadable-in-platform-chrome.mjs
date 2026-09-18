/**
 * GUARD: NOTHING IN THE SITE HEADER OR SITE FOOTER MAY IMPORT `next/dynamic`.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY THE GUARD BESIDE IT WAS NOT ENOUGH
 * ============================================================================
 *
 * On 18 September 2026 lane A measured what `next/dynamic` costs when its
 * loadable runtime lands in a chunk every route loads, gate build against gate
 * build on this tree:
 *
 *     WITH next/dynamic   13 shared chunks   161851 bytes gzip
 *     WITH import()       12 shared chunks   160545 bytes gzip
 *
 * 1306 bytes gzip and one entire chunk, for a preload handle, a `loading` slot
 * and an SSR switch that the caller in question used none of. That produced
 * `no-loadable-in-the-root-shell.mjs`, which polices the client closure behind
 * `src/app/layout`.
 *
 * ONE DAY EARLIER, LANE C HAD MADE THE SAME MISTAKE IN A PLACE THAT GUARD
 * CANNOT SEE, AND THE GUARD PASSED ON IT. `header-search-trigger.tsx` and
 * `location-picker.tsx` both deferred their panels with `dynamic()`. Both sit
 * behind `SiteHeader`. `SiteHeader` is NOT in the root layout - it is imported
 * by 22 route files directly, plus the page templates the remaining routes use
 * - so the root-shell closure never reaches it, the guard reported PASS, and
 * the runtime was being pulled into the header's shared chunk the whole time.
 *
 * The comment in each of those two files asserted, wrongly, that the header
 * rendered in the root layout. So the guard's blind spot and the code's own
 * justification were the same false belief, and neither could correct the
 * other. A gate that is scoped by a claim in a comment is scoped by nothing.
 *
 * ============================================================================
 * WHY THE ROOTS ARE THE HEADER AND THE FOOTER RATHER THAN "EVERY ROUTE"
 * ============================================================================
 *
 * The honest general rule is "no `next/dynamic` in any chunk shared by many
 * routes", and that rule cannot be evaluated without a build, which this guard
 * does not have and `prebuild` cannot afford. The header and the footer are the
 * two client subtrees that are on effectively every page BY CONSTRUCTION, so
 * they are checkable from the import graph alone and they are where the cost
 * actually lands. `initial-bundle-budget.mjs` remains the backstop that sees
 * real bytes; this says the cause, which is the thing a 116-route byte
 * regression never says for itself.
 *
 * ROUTE-LEVEL LAZY WRAPPERS ARE DELIBERATELY UNAFFECTED. `seat-selector-lazy`,
 * `venue-map-lazy` and `m5-events-map-lazy` are reached from single routes, so
 * the routes that want the loadable runtime are the routes that pay for it.
 * None of them is behind the header or the footer and none is flagged here.
 *
 * ============================================================================
 * WHAT THIS CANNOT SEE
 * ============================================================================
 *
 * It reads `import ... from 'next/dynamic'` as SOURCE TEXT through the shared
 * `lib/bare-import.mjs` matcher, because a bare specifier resolves to nothing
 * inside `src/` and so is not an edge in the value graph. That matcher is
 * shared, and shared on purpose: the first hand-rolled version of the one in
 * the root-shell guard put a backslash-s inside a template literal, compiled to
 * `from s*`, and reported a confident PASS against a file whose third line was
 * the banned import. `tests/unit/perf/root-shell-has-no-loadable.test.ts` holds
 * that matcher shape by shape.
 *
 * It also cannot see a route that renders its own bespoke header, or a third
 * piece of platform-wide chrome added later without being added to ROOTS
 * below. Clause 2 exists for exactly that: every root must be a real file, so a
 * root that is renamed away fails loudly instead of silently checking nothing.
 *
 * Registered in `run-guards.mjs`, so it blocks on `prebuild`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { buildImportGraph } from './lib/import-graph.mjs'
import { importsBareSpecifier } from './lib/bare-import.mjs'
import { clientChunkOf } from './lib/client-chunk.mjs'

const ROOTS = ['src/components/layout/site-header', 'src/components/layout/site-footer']
const BANNED = 'next/dynamic'

/**
 * Graph ids are extensionless, so the file behind one has to be found. This
 * ASKS which extension exists rather than reading and catching the failure: a
 * swallowed filesystem read is an incident nobody hears about, and
 * `no-silent-catch.mjs` fails the build on one.
 */
const sourceOf = mod => {
  for (const ext of ['.tsx', '.ts']) if (existsSync(mod + ext)) return readFileSync(mod + ext, 'utf8')
  throw new Error(`${mod} is in the import graph but neither ${mod}.tsx nor ${mod}.ts is on disk`)
}

/**
 * CLAUSE 2, FIRST: A ROOT THAT IS NOT ON DISK. A guard whose roots have been
 * renamed away walks an empty closure and passes everything. This is checked
 * before the graph is read so the message names the cause rather than a
 * traversal that found nothing.
 */
const missingRoots = ROOTS.filter(root => !existsSync(`${root}.tsx`) && !existsSync(`${root}.ts`))
if (missingRoots.length > 0) {
  console.error(`FAIL: ${missingRoots.length} root(s) named by this guard are not on disk:`)
  for (const root of missingRoots) console.error(`  ${root}`)
  console.error(
    `\nPlatform chrome was renamed or moved and this guard was not updated with it.\n` +
      `Point ROOTS at the new file(s). A guard with no reachable root checks nothing\n` +
      `and reports PASS, which is worse than no guard at all.`,
  )
  process.exit(1)
}

const graph = buildImportGraph()
const { entries, shell } = clientChunkOf(graph, ROOTS)

/**
 * CLAUSE 2, SECOND: A ROOT THAT REACHES NO CLIENT MODULE AT ALL. The header
 * has been an interactive surface since before this guard existed, so an empty
 * closure means the graph stopped seeing it, not that the chrome went static.
 */
if (entries.size === 0) {
  console.error(`FAIL: the client closure behind ${ROOTS.join(' and ')} is EMPTY.`)
  console.error(
    `\nThe site header carries a search trigger, an account dropdown and a city picker,\n` +
      `so a closure with no 'use client' entry point means this guard has stopped reading\n` +
      `the tree it is pointed at, not that the chrome became static.`,
  )
  process.exit(1)
}

const violations = [...shell].filter(mod => importsBareSpecifier(sourceOf(mod), BANNED)).sort()

console.log(
  `no-loadable-in-platform-chrome: ${graph.files.length} modules read, ${graph.edgeCount} value imports, ` +
    `${entries.size} client entry point(s) behind the header and footer, ${shell.size} module(s) in their client chunk`,
)
for (const entry of [...entries].sort()) console.log(`  entry: ${entry}`)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} module(s) in the platform chrome import '${BANNED}':`)
  for (const mod of violations) console.error(`  ${mod}`)
  console.error(
    `\n'${BANNED}' drags the loadable runtime into the chunk shared by the header and the\n` +
      `footer, which is the first load of effectively every route: 1306 bytes gzip and one\n` +
      `whole extra chunk, measured gate build against gate build. Nothing here uses the\n` +
      `preload handle, the 'loading' slot or the SSR switch that buys.\n` +
      `\n` +
      `Defer with the shared hook instead, which splits the chunk identically:\n` +
      `\n` +
      `    const Panel = useDeferredComponent(armed, () =>\n` +
      `      import('./panel').then(m => m.Panel),\n` +
      `    )\n` +
      `    return Panel ? <Panel /> : null\n` +
      `\n` +
      `src/components/ui/use-deferred-component.tsx is the hook and carries the\n` +
      `measurement. src/components/layout/header-search-trigger.tsx is the worked example.\n` +
      `Route-level lazy wrappers are unaffected: they are not behind this chrome, and they\n` +
      `pay for the runtime on the routes that actually use them.`,
  )
  process.exit(1)
}

console.log(`  0 of them import '${BANNED}'. PASS`)
