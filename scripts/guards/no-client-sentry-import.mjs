/**
 * GUARD: no client component may reach the Sentry SDK through a value import.
 *
 * WHY THIS EXISTS. src/lib/observability/client-error-report.ts carries a long
 * comment explaining that the four client error boundaries used to import
 * captureException from src/lib/observability/sentry.ts, which statically
 * imports @sentry/nextjs, and that two of those boundaries are platform-wide,
 * so that one import put the whole SDK in the client bundle of EVERY route.
 * The seam was built to break that edge.
 *
 * Nothing stopped it being rebuilt. The silent-catch sweep of 25 August 2026
 * added a report call to 135 catch blocks, and one of them landed in
 * src/lib/launch/bill-ref.ts, which THE BILL imports for `encodeBillRef` from a
 * client component. That single line would have restored the edge the seam
 * exists to prevent, and nothing in the build would have said so: the bundle
 * would simply have been bigger.
 *
 * So the rule is now a gate rather than a comment. A client component that
 * needs to report an error imports `reportClientError`, which knows nothing
 * about Sentry.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: it follows relative and
 * `@/` imports inside src/ only, and it reads `import type` as erased, which is
 * what TypeScript does. A dynamic `await import()` of the Sentry module from a
 * client component would not be caught here, and is not the shape that has ever
 * gone wrong: sentry-client-boot.ts loads the SDK that way ON PURPOSE.
 *
 * THE GRAPH MOVED OUT ON 18 SEPTEMBER 2026, AND IT WAS NOT A TIDY-UP. This file
 * carried its own resolver, and that resolver cut an absolute path back to a
 * repo-relative one with `.split('/el-moat/').pop()`, which only works in a
 * checkout whose directory is named `el-moat`. In every other worktree it
 * returned the absolute path unchanged, no absolute id matched a key in the
 * graph, and so EVERY RELATIVE IMPORT IN THE TREE WAS SILENTLY DROPPED while
 * this guard went on printing `0 client components reach it. PASS`. Measured in
 * the lane A worktree that day: 438 of 3241 value imports, 13.5 per cent of the
 * graph, invisible. `scripts/guards/lib/import-graph.mjs` now owns the
 * resolution, resolves with `relative(cwd, abs)` so it is correct in any
 * directory, and this guard prints its edge count so the same blindness would
 * show up next time as a number that collapsed.
 */
import { buildImportGraph, pathToTarget } from './lib/import-graph.mjs'

const SENTRY_MODULE = 'src/lib/observability/sentry'

const graph = buildImportGraph()
const { files, isClient, isServerAction, edgeCount } = graph

const violations = []
for (const mod of isClient) {
  const path = pathToTarget(graph, mod, SENTRY_MODULE, new Map())
  if (path) violations.push(path)
}

console.log(
  `no-client-sentry-import: ${files.length} modules read, ${edgeCount} value imports, ` +
    `${isClient.size} client components, ${isServerAction.size} 'use server' boundaries`,
)
console.log(`  target: ${SENTRY_MODULE} (statically imports @sentry/nextjs)`)
console.log(`  the Sentry-free seam for client code: src/lib/observability/client-error-report`)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} client component(s) reach the Sentry SDK:`)
  for (const path of violations) console.error(`  ${path.join('\n    -> ')}`)
  console.error('\nUse reportClientError from @/lib/observability/client-error-report instead.')
  process.exit(1)
}

console.log('  0 client components reach it. PASS')
