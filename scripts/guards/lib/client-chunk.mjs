/**
 * WHICH MODULES LAND IN THE CLIENT CHUNK BEHIND A SET OF SERVER-RENDERED ROOTS.
 *
 * ============================================================================
 * WHY THIS IS A SHARED MODULE AND NOT A SECOND COPY OF THE SAME TWENTY LINES
 * ============================================================================
 *
 * `no-loadable-in-the-root-shell.mjs` needed this traversal for one root,
 * `src/app/layout`. `no-loadable-in-platform-chrome.mjs` needs exactly the same
 * traversal for the site header and the site footer, which are not under the
 * layout but are on effectively every route anyway. Two copies of a graph walk
 * is how two gates end up disagreeing about what a client chunk is, so the walk
 * lives here once.
 *
 * The root-shell guard still carries its own inline copy today. That is not an
 * oversight: it belongs to another lane's slice and is inside an active merge,
 * so it is left alone rather than refactored underneath its owner. This module
 * is written so that adopting it there is a deletion, not a rewrite.
 *
 * ============================================================================
 * WHAT A CLIENT CHUNK IS HERE
 * ============================================================================
 *
 * A root may be a Server Component. Its CLIENT chunk begins at every
 * `'use client'` module the root reaches through VALUE imports, and contains
 * everything those modules value-import in turn. Type-only imports are erased
 * by tsc and are not edges. A `'use server'` module is a network boundary, not
 * a bundle edge, so descent stops there.
 *
 * A module reached only through a dynamic `await import()` is deliberately
 * OUTSIDE the closure, because that is the whole point of writing one.
 */

/**
 * @param graph  the value-import graph from `lib/import-graph.mjs`
 * @param roots  extensionless graph ids, e.g. 'src/components/layout/site-header'
 * @returns      `entries` (the 'use client' boundaries) and `shell` (the closure)
 */
export function clientChunkOf(graph, roots) {
  const entries = new Set()
  const seen = new Set()

  const descend = mod => {
    if (seen.has(mod)) return
    seen.add(mod)
    if (graph.isServerAction.has(mod)) return
    if (graph.isClient.has(mod)) entries.add(mod)
    for (const next of graph.valueImports.get(mod) ?? []) descend(next)
  }
  for (const root of roots) descend(root)

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
