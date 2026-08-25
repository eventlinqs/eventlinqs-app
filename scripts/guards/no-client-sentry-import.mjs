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
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const SEP = String.fromCharCode(92)
const SENTRY_MODULE = 'src/lib/observability/sentry'
const EXT = ['.ts', '.tsx', '.mjs', '.js']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

const norm = (p) => p.replaceAll(SEP, '/')

/** Resolve a specifier to a repo-relative module id, or null if it leaves src/. */
function resolveSpec(fromFile, spec) {
  let base
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.')) base = norm(resolve(dirname(fromFile), spec)).split('/el-moat/').pop()
  else return null
  for (const e of EXT) {
    try {
      if (statSync(base + e).isFile()) return base
    } catch {
      // Not this extension. The loop tries the next one; a specifier that
      // matches none is reported as unresolved by returning null below, which
      // is why this catch does not need to say anything.
    }
  }
  try {
    for (const e of EXT) if (statSync(join(base, 'index' + e)).isFile()) return base + '/index'
  } catch {
    // Same: a directory with no index is simply not a module in src/.
  }
  return null
}

const files = walk('src')
const valueImports = new Map()
const isClient = new Set()
const isServerAction = new Set()

for (const file of files) {
  const rel = norm(file).replace(/\.(tsx?)$/, '')
  const src = readFileSync(file, 'utf8')
  if (/^\s*['"]use client['"]/m.test(src)) isClient.add(rel)
  // A 'use server' module is a BUNDLE BOUNDARY, not an edge. Importing it from a
  // client component gets a network proxy, not the module's bytes, so following
  // through it would report a client bundle that does not exist. Getting this
  // wrong is not hypothetical: without it this guard reported 41 violations, 39
  // of which were server actions.
  if (/^\s*['"]use server['"]/m.test(src)) isServerAction.add(rel)
  const edges = []
  const re = /import\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src)) !== null) {
    // `import type { X }` and `import { type X }` are both erased by tsc.
    const clause = m[2] ?? ''
    if (m[1]) continue
    if (/^\s*\{\s*(type\s+[^,}]+,?\s*)+\}\s*$/.test(clause)) continue
    const target = resolveSpec(file, m[3])
    if (target) edges.push(target)
  }
  valueImports.set(rel, edges)
}

// Which modules reach the Sentry module through value imports?
const reaches = new Map()
function reachesSentry(mod, seen = new Set()) {
  if (mod === SENTRY_MODULE) return [mod]
  if (reaches.has(mod)) return reaches.get(mod)
  if (seen.has(mod)) return null
  if (isServerAction.has(mod)) return null
  seen.add(mod)
  for (const next of valueImports.get(mod) ?? []) {
    const path = reachesSentry(next, seen)
    if (path) {
      const full = [mod, ...path]
      reaches.set(mod, full)
      return full
    }
  }
  return null
}

const violations = []
for (const mod of isClient) {
  const path = reachesSentry(mod)
  if (path) violations.push(path)
}

console.log(`no-client-sentry-import: ${files.length} modules read, ${isClient.size} client components, ${isServerAction.size} 'use server' boundaries`)
console.log(`  target: ${SENTRY_MODULE} (statically imports @sentry/nextjs)`)
console.log(`  the Sentry-free seam for client code: src/lib/observability/client-error-report`)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} client component(s) reach the Sentry SDK:`)
  for (const path of violations) console.error(`  ${path.join('\n    -> ')}`)
  console.error('\nUse reportClientError from @/lib/observability/client-error-report instead.')
  process.exit(1)
}

console.log('  0 client components reach it. PASS')
