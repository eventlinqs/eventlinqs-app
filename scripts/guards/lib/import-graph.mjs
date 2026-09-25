/**
 * THE VALUE-IMPORT GRAPH OF src/, BUILT ONCE.
 *
 * ============================================================================
 * WHY THIS IS A MODULE OF ITS OWN
 * ============================================================================
 *
 * Two guards need the same question answered: "can a client component reach
 * this server-only module by following imports that actually survive
 * compilation?" `no-client-sentry-import.mjs` asks it about the Sentry SDK and
 * `no-client-redis-import.mjs` asks it about the Redis client. One graph, one
 * set of rules about what an edge is, imported twice, so the two can never
 * disagree about what "reaches" means.
 *
 * ============================================================================
 * AND WHY EXTRACTING IT FIXED A BUG THAT WAS ALREADY LIVE
 * ============================================================================
 *
 * The resolver this replaces read:
 *
 *     base = norm(resolve(dirname(fromFile), spec)).split('/el-moat/').pop()
 *
 * `resolve()` returns an ABSOLUTE path, and that `split` was there to cut it
 * back to a repo-relative one. It only does so in a checkout whose directory is
 * literally named `el-moat`. In any other worktree the separator is absent,
 * `split` returns a single-element array, and `pop()` hands back the ABSOLUTE
 * path unchanged: `C:/dev/EventLinqs/eventlinqs-app/src/lib/...`.
 *
 * The graph is keyed by repo-relative ids (`src/lib/...`), so every one of
 * those absolute ids matched no key, and every RELATIVE import in the tree was
 * silently dropped from the graph. `@/`-prefixed imports still resolved, so the
 * guard still reported a confident `0 client components reach it. PASS` while
 * following only part of the graph. Measured in this worktree on 18 September
 * 2026: 1117 modules read, and `./connect-currency` from
 * `src/lib/payments/sale-status.ts` resolving to an absolute path that is in no
 * map.
 *
 * That is the exact failure mode `chunk-attribution.mjs` has a whole heading
 * about: a gate that has gone blind while still reading confidently. The
 * resolution below is `relative(cwd, abs)`, which is correct in every
 * directory, and the guards report their edge counts so a future blindness of
 * this kind shows up as a number that collapsed.
 *
 * ============================================================================
 * WHAT COUNTS AS AN EDGE, AND WHAT DELIBERATELY DOES NOT
 * ============================================================================
 *
 *   `import type { X } from`  and  `import { type X } from`  are ERASED by
 *   tsc, so they ship nothing and are not edges. Reading them as edges would
 *   report bundles that do not exist.
 *
 *   A `'use server'` module is a BUNDLE BOUNDARY, not an edge. Importing one
 *   from a client component yields a network proxy, not the module's bytes, so
 *   a traversal must STOP there. Getting this wrong is not hypothetical: the
 *   Sentry guard reported 41 violations before it stopped, 39 of which were
 *   server actions.
 *
 *   A dynamic `await import()` is NOT followed, on purpose. It is the fix for
 *   this class of problem rather than an instance of it: `sentry-client-boot.ts`
 *   and `components/analytics/measurement-boot.tsx` both load code that way
 *   deliberately, precisely so it leaves the first load.
 *
 * Only modules inside `src/` are resolved. A bare specifier (`@upstash/redis`)
 * is not followed; the guards name a module in `src/` as their target and that
 * module is where the bare import lives.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const SEP = String.fromCharCode(92)
const EXT = ['.ts', '.tsx', '.mjs', '.js']

export const norm = (p) => p.replaceAll(SEP, '/')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

/** Resolve a specifier to a repo-relative module id, or null if it leaves src/. */
export function resolveSpec(fromFile, spec, root = process.cwd()) {
  let base
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.')) base = norm(relative(root, resolve(dirname(fromFile), spec)))
  else return null
  for (const e of EXT) {
    try {
      if (statSync(base + e).isFile()) return base
    } catch {
      // Not this extension. The loop tries the next one; a specifier matching
      // none returns null below, which is why this catch says nothing.
    }
  }
  try {
    for (const e of EXT) if (statSync(join(base, 'index' + e)).isFile()) return base + '/index'
  } catch {
    // Same: a directory with no index is simply not a module in src/.
  }
  return null
}

/**
 * Read every module under `src/` and return the value-import graph plus the
 * two classifications a traversal needs.
 */
export function buildImportGraph(root = process.cwd()) {
  const files = walk('src')
  const valueImports = new Map()
  const isClient = new Set()
  const isServerAction = new Set()
  let edgeCount = 0

  for (const file of files) {
    const rel = norm(file).replace(/\.(tsx?)$/, '')
    const src = readFileSync(file, 'utf8')
    if (/^\s*['"]use client['"]/m.test(src)) isClient.add(rel)
    if (/^\s*['"]use server['"]/m.test(src)) isServerAction.add(rel)
    const edges = []
    const re = /import\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g
    let m
    while ((m = re.exec(src)) !== null) {
      const clause = m[2] ?? ''
      if (m[1]) continue
      if (/^\s*\{\s*(type\s+[^,}]+,?\s*)+\}\s*$/.test(clause)) continue
      const target = resolveSpec(file, m[3], root)
      if (target) edges.push(target)
    }
    edgeCount += edges.length
    valueImports.set(rel, edges)
  }

  return { files, valueImports, isClient, isServerAction, edgeCount }
}

/**
 * The first value-import path from `mod` to `target`, or null. Stops at
 * `'use server'` boundaries for the reason in the header.
 */
export function pathToTarget(graph, mod, target, memo = new Map(), seen = new Set()) {
  if (mod === target) return [mod]
  if (memo.has(mod)) return memo.get(mod)
  if (seen.has(mod)) return null
  if (graph.isServerAction.has(mod)) return null
  seen.add(mod)
  for (const next of graph.valueImports.get(mod) ?? []) {
    const path = pathToTarget(graph, next, target, memo, seen)
    if (path) {
      const full = [mod, ...path]
      memo.set(mod, full)
      return full
    }
  }
  return null
}
