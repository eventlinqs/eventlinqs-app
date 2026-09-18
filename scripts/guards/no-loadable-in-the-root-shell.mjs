/**
 * GUARD: nothing in the ROOT LAYOUT'S CLIENT SHELL may import `next/dynamic`.
 *
 * ============================================================================
 * WHY THIS EXISTS, WITH THE MEASUREMENT THAT PRODUCED IT
 * ============================================================================
 *
 * On 18 September 2026 six client components were moved out of
 * `src/app/layout.tsx` into `components/analytics/measurement-stack.tsx` and
 * fetched after hydration, to get 3938 bytes gzip of measurement and
 * attribution code off the first load of every route. The boundary that did
 * the fetching was written the obvious way:
 *
 *     const MeasurementStack = dynamic(() => import('./measurement-stack'), { ssr: false })
 *
 * It worked. It also left 1099 bytes gzip behind on EVERY route, which the
 * initial-bundle ratchet then reported 116 separate times, and the first
 * reading of that residual blamed `RegisterAppWorker`. `git log` says that
 * reading was wrong: `register-app-worker.tsx` landed at 6bf6bc66, well before
 * the marks in `perf-budget.json` were written at 8c2bd2da, so its bytes had
 * been inside the mark all along.
 *
 * The residual was `next/dynamic` ITSELF. Nothing in the root shell had ever
 * imported it. The four other lazy wrappers on the platform
 * (`seat-selector-lazy`, `venue-map-lazy`, `m5-events-map-lazy`, and the
 * events page's map) are all route-level, so the routes that want the loadable
 * runtime pay for it. The first `dynamic()` call in the shell moved that
 * runtime into the first load of all 141 routes, in order to defer one tree
 * that a bare `import()` defers just as well:
 *
 *     WITH next/dynamic   13 shared chunks   161851 bytes gzip
 *     WITH import()       12 shared chunks   160425 bytes gzip
 *
 * 1426 bytes gzip and one entire chunk, on every route, for a deferral helper
 * whose preload handle, `loading` slot and SSR switch the shell uses none of.
 *
 * ============================================================================
 * AND WHY IT IS A GATE RATHER THAN A COMMENT
 * ============================================================================
 *
 * Because `dynamic()` is the documented, idiomatic, correct-looking way to do
 * exactly what the shell wants, and the next person to defer something out of
 * the root layout will reach for it for good reasons. The cost is invisible at
 * the call site: the diff reads as a pure saving, the chunk really does split,
 * and the only symptom is a four-figure number appearing on 116 unrelated
 * routes at once. The bundle ratchet does catch it, but it catches it as 116
 * identical faults on routes like `/press` and `/offline` with no clue as to
 * the cause. This says the cause.
 *
 * Registered in `run-guards.mjs`, so it blocks on `prebuild`, beside
 * `no-client-redis-import.mjs` and `no-client-sentry-import.mjs`, with which it
 * shares `lib/import-graph.mjs`.
 *
 * ============================================================================
 * WHAT THE SHELL IS, AND WHAT THIS CANNOT SEE
 * ============================================================================
 *
 * The shell is every `'use client'` module reachable from `src/app/layout.tsx`
 * by value imports, plus everything those reach in turn. That closure is what
 * lands in the layout's client chunk, and the layout's client chunk is in the
 * first load of every route by definition. A module reached ONLY through a
 * dynamic `await import()` is deliberately outside it, which is the whole
 * point: `measurement-stack.tsx` may use whatever it likes.
 *
 * It reads `import ... from 'next/dynamic'` as source text, because a bare
 * specifier resolves to nothing inside `src/` and so is not an edge in the
 * shared graph. It therefore cannot see a `require('next/dynamic')` or an
 * aliased re-export, neither of which exists in this tree and both of which
 * would fail typecheck or lint first.
 */
import { existsSync, readFileSync } from 'node:fs'
import { buildImportGraph } from './lib/import-graph.mjs'
import { importsBareSpecifier } from './lib/bare-import.mjs'

const ROOT = 'src/app/layout'
const BANNED = 'next/dynamic'

const graph = buildImportGraph()

/**
 * The layout is a Server Component. Its CLIENT chunk begins at every
 * `'use client'` module it reaches, and contains everything those modules
 * value-import in turn.
 */
function rootClientShell() {
  const entries = new Set()
  const seen = new Set()
  const descend = mod => {
    if (seen.has(mod)) return
    seen.add(mod)
    if (graph.isServerAction.has(mod)) return
    if (graph.isClient.has(mod)) entries.add(mod)
    for (const next of graph.valueImports.get(mod) ?? []) descend(next)
  }
  descend(ROOT)

  const shell = new Set()
  const stack = [...entries]
  while (stack.length > 0) {
    const mod = stack.pop()
    if (shell.has(mod) || graph.isServerAction.has(mod)) continue
    shell.add(mod)
    for (const next of graph.valueImports.get(mod) ?? []) stack.push(next)
  }
  return { entries, shell }
}

/**
 * Graph ids are extensionless, so the file behind one has to be found. This
 * ASKS which extension exists rather than reading and catching the failure:
 * `no-silent-catch.mjs` is right that a swallowed filesystem read is an
 * incident nobody hears about, and it failed the build on the first version of
 * this function, which had exactly that. There is nothing to catch here now.
 */
const sourceOf = mod => {
  for (const ext of ['.tsx', '.ts']) if (existsSync(mod + ext)) return readFileSync(mod + ext, 'utf8')
  // A graph id always came from a real file on disk (`walk()` only collects
  // .ts/.tsx, and a directory import is keyed `/index`), so reaching here means
  // the graph and the filesystem disagree, which is worth saying rather than
  // treating as "no violation".
  throw new Error(`${mod} is in the import graph but neither ${mod}.tsx nor ${mod}.ts is on disk`)
}

const importsBanned = mod => importsBareSpecifier(sourceOf(mod), BANNED)

const { entries, shell } = rootClientShell()
const violations = [...shell].filter(importsBanned).sort()

console.log(
  `no-loadable-in-the-root-shell: ${graph.files.length} modules read, ${graph.edgeCount} value imports, ` +
    `${entries.size} client entry point(s) under ${ROOT}, ${shell.size} module(s) in its client chunk`,
)
for (const entry of [...entries].sort()) console.log(`  entry: ${entry}`)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} module(s) in the root client shell import '${BANNED}':`)
  for (const mod of violations) console.error(`  ${mod}`)
  console.error(
    `\n'${BANNED}' costs 1426 bytes gzip in the shared shell, which is the first load of EVERY\n` +
      `route, and the shell uses none of what it buys. Defer with a bare dynamic import instead:\n` +
      `\n` +
      `    const [Thing, setThing] = useState(null)\n` +
      `    useEffect(() => { void import('./thing').then(m => setThing(() => m.default)) }, [])\n` +
      `    return Thing ? <Thing /> : null\n` +
      `\n` +
      `src/components/analytics/measurement-boot.tsx is the worked example and carries the\n` +
      `before-and-after measurement. Route-level lazy wrappers are unaffected: they are not in\n` +
      `this shell and they pay for the runtime on the routes that use them.`,
  )
  process.exit(1)
}

console.log(`  0 of them import '${BANNED}'. PASS`)
