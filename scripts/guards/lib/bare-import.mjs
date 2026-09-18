/**
 * DOES THIS SOURCE FILE IMPORT A BARE SPECIFIER?
 *
 * ============================================================================
 * WHY THIS IS A MODULE OF ITS OWN RATHER THAN A REGEX AT THE CALL SITE
 * ============================================================================
 *
 * `lib/import-graph.mjs` deliberately resolves only modules inside `src/`: a
 * bare specifier like `next/dynamic` or `@upstash/redis` is not a node in that
 * graph, because the graph exists to answer "can a client component REACH this
 * file". A guard that cares about the package itself has to read source text,
 * and reading source text with a hand-rolled regex is how the last three
 * guards in this directory each went quietly blind.
 *
 * It went blind here too, and the drill is the only reason anybody knows. The
 * first version of `no-loadable-in-the-root-shell.mjs` carried:
 *
 *     new RegExp(`import[^'"]*from\s*['"]${BANNED}['"]`)
 *
 * In a TEMPLATE LITERAL `\s` is not a recognised escape, so JavaScript drops
 * the backslash and the pattern compiled to `from s*`, which requires a
 * literal letter s after the word `from`. It matched nothing, ever. The guard
 * ran against the real defect file, printed its module counts, and reported
 * `0 of them import 'next/dynamic'. PASS` with the banned import three lines
 * from the top of a file it had just read.
 *
 * That is the failure mode `chunk-attribution.mjs` has a heading about and the
 * one `lib/import-graph.mjs` was extracted to fix: a gate that has gone blind
 * while still reading confidently. So the matcher lives here, on its own,
 * where `tests/unit/perf/root-shell-has-no-loadable.test.ts` can hold every
 * shape it must catch and every shape it must not.
 *
 * ============================================================================
 * WHAT COUNTS
 * ============================================================================
 *
 *   import x from 'spec'        import { a } from "spec"        a value import
 *   import 'spec'                                               a side effect
 *   import x from
 *     'spec'                                                    across lines
 *
 * ============================================================================
 * WHAT DELIBERATELY DOES NOT
 * ============================================================================
 *
 *   import type { T } from 'spec'    erased by tsc, so it ships nothing
 *   'spec/deeper'                    a different module, matched exactly
 *   import('spec')                   a DYNAMIC import, which is the fix for
 *                                    this class of problem rather than an
 *                                    instance of it, exactly as the value
 *                                    graph treats it
 *   require('spec')                  not used anywhere in src/, and it would
 *                                    fail lint before it reached a guard
 */

/** Escape the characters a specifier may legally contain that a regex reads. */
const escapeForRegex = spec => spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * True when `source` imports `specifier` in a way that survives compilation.
 *
 * `[\s\S]*?` rather than `[^'"]*` is lazy and crosses newlines, so a clause
 * broken over lines is still one import, and the laziness stops the match
 * running past the first quote into an unrelated later import.
 */
export function importsBareSpecifier(source, specifier) {
  const spec = escapeForRegex(specifier)
  const valueImport = new RegExp(
    `import(?!\\s+type\\b)[\\s\\S]*?from\\s*['"]${spec}['"]`,
  )
  const sideEffectImport = new RegExp(`import\\s*['"]${spec}['"]`)
  return valueImport.test(source) || sideEffectImport.test(source)
}
