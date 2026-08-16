// CLIENT BARREL-IMPORT GUARD.
//
// The defect this exists to make impossible: on 2026-08-05 the event detail
// route shipped 443KB of client JavaScript, 202KB of which was the Sentry SDK
// and 141KB of that was never executed. The cause was three namespace imports:
//
//   instrumentation-client.ts      import * as Sentry from '@sentry/nextjs'
//   sentry.client.config.ts        import * as Sentry from '@sentry/nextjs'
//   src/lib/observability/sentry.ts  import * as Sentry from '@sentry/nextjs'
//
// @sentry/nextjs's client entry does `export * from '@sentry/react'`, which
// chains to @sentry/browser and then @sentry/core. @sentry/core carries
// integrations this platform never runs in a browser: Supabase, GraphQL,
// OpenAI, Anthropic, LangGraph, and the Statsig and Unleash feature-flag
// adapters. A namespace import cannot be tree-shaken, because the bundler has
// to assume any property of the namespace object might be read, so the whole
// chain is retained. Named imports give it one binding to keep.
//
// WHY A RULE AND NOT A LIST OF KNOWN-BAD PACKAGES. A denylist of "large SDKs"
// only knows the packages somebody remembered to add, so it would have caught
// @sentry/nextjs and missed the next one. The rule here is shaped as an
// allowlist instead: in client-reachable code, a namespace import of ANY
// third-party package is a defect unless it is listed in ALLOWLIST below with
// a reason. New dependencies are covered on the day they are added.
//
// WHY THE REACHABILITY WALK MATTERS. src/lib/observability/sentry.ts carries no
// 'use client' directive, so a guard that only scanned files with the directive
// would have missed it entirely. It is imported by four client error
// boundaries, two of which (src/app/error.tsx, src/app/global-error.tsx) apply
// platform-wide, so everything it pulls in lands in the browser bundle of every
// route. Reachability, not the directive, is what decides.
//
// The walk is readdirSync(withFileTypes), which has existed since Node 10 and so
// survives a runtime move untouched. It was written that way when the contract
// was Node 20, which had no globSync; the contract is Node 24 since 13 August
// 2026 and does, but there is nothing to gain by rewriting a walk that works on
// every version the platform will ever run.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/**
 * Namespace imports of third-party packages that are permitted in
 * client-reachable code, each with the reason it cannot be a named import.
 * Empty on purpose: nothing currently needs one. Adding an entry is a
 * deliberate, reviewable act, which is the point.
 */
const ALLOWLIST = [
  // { specifier: 'some-pkg', reason: 'why a named import cannot work' },
]

/** Client entry points that are in the browser bundle without a directive. */
const CLIENT_ENTRIES = ['instrumentation-client.ts', 'sentry.client.config.ts']

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

/**
 * Strip comments WITHOUT blanking string literals.
 *
 * A previous guard in this repo blanked string literals before scanning and so
 * could not see module specifiers, which are themselves string literals. It
 * reported PASS on the exact defect it was written to catch. Import specifiers
 * must stay readable here, so only comments are removed, and the remover is
 * string-aware so a // or /* inside a string cannot eat real code.
 */
export function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      if (c === '\\') {
        out += c + (next ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
      walk(full, acc)
    } else if (SOURCE_EXT.some((e) => entry.name.endsWith(e))) {
      acc.push(full)
    }
  }
  return acc
}

/** Resolve an import specifier to a repo file, or null if it is third-party. */
function resolveLocal(specifier, fromFile) {
  let base
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null

  for (const ext of ['', ...SOURCE_EXT]) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  for (const ext of SOURCE_EXT) {
    const candidate = join(base, 'index' + ext)
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * Every import/export specifier in a file, comments removed.
 *
 * DYNAMIC IMPORTS COUNT. They are how a module gets into the browser bundle just
 * as surely as a static import; they only change WHEN it loads, not WHETHER. A
 * version of this guard that walked static imports only had a hole big enough to
 * drive the whole defect through: src/lib/observability/sentry-client-boot.ts is
 * reached ONLY by `import('@/lib/observability/sentry-client-boot')`, so it sat
 * outside the client-reachable set. It appeared inside it purely by accident,
 * because instrumentation-client.ts also carries an `import type` line for one
 * of its types. Deleting that one type import made the guard report PASS with a
 * live `import * as Sentry from '@sentry/nextjs'` in the boot module. Proven by
 * removing it and watching the guard go green on a real defect.
 */
function specifiersOf(source) {
  const out = []
  const re = /(?:^|[\s;}])(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(source)) !== null) out.push(m[1])
  const bare = /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g
  while ((m = bare.exec(source)) !== null) out.push(m[1])
  // import('specifier') and await import('specifier'), including whitespace and
  // newlines between the parenthesis and the string.
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamic.exec(source)) !== null) out.push(m[1])
  return out
}

/**
 * Namespace imports (and namespace re-exports) of third-party packages.
 * `import type * as X` is skipped: types are erased and cost no bytes.
 */
function namespaceImportsOf(source) {
  const out = []
  const ns = /(?:^|[\s;}])import\s+(type\s+)?\*\s+as\s+\w+\s+from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = ns.exec(source)) !== null) {
    if (m[1]) continue
    out.push({ specifier: m[2], kind: 'import * as' })
  }
  const reexport = /(?:^|[\s;}])export\s+\*\s+from\s*['"]([^'"]+)['"]/g
  while ((m = reexport.exec(source)) !== null) {
    out.push({ specifier: m[1], kind: 'export *' })
  }
  return out
}

// ---------------------------------------------------------------------------
// Build the client-reachable set: seeds, then transitive local imports.
// ---------------------------------------------------------------------------
const cache = new Map()
function sourceOf(file) {
  if (!cache.has(file)) cache.set(file, stripComments(readFileSync(file, 'utf8')))
  return cache.get(file)
}

const seeds = []
for (const entry of CLIENT_ENTRIES) {
  const full = join(ROOT, entry)
  if (existsSync(full)) seeds.push(full)
}
for (const file of walk(SRC)) {
  const head = readFileSync(file, 'utf8').slice(0, 200)
  if (/^\s*['"]use client['"]/m.test(head)) seeds.push(file)
}

const reachable = new Set()
const queue = [...seeds]
while (queue.length) {
  const file = queue.pop()
  if (reachable.has(file)) continue
  reachable.add(file)
  for (const spec of specifiersOf(sourceOf(file))) {
    const local = resolveLocal(spec, file)
    if (local && !reachable.has(local)) queue.push(local)
  }
}

// ---------------------------------------------------------------------------
// Judge.
// ---------------------------------------------------------------------------
const allowed = new Set(ALLOWLIST.map((a) => a.specifier))
const violations = []
for (const file of [...reachable].sort()) {
  for (const { specifier, kind } of namespaceImportsOf(sourceOf(file))) {
    if (specifier.startsWith('.') || specifier.startsWith('@/')) continue
    if (allowed.has(specifier)) continue
    violations.push({ file: relative(ROOT, file).replace(/\\/g, '/'), specifier, kind })
  }
}

if (violations.length === 0) {
  console.log(
    `[client-barrel] PASS - ${reachable.size} client-reachable files, ` +
      `0 third-party namespace imports.`,
  )
  process.exit(0)
}

console.error('\n[client-barrel] FAILED.\n')
for (const v of violations) {
  console.error(`    ${v.file}`)
  console.error(`      ${v.kind} '${v.specifier}'`)
}
console.error(
  `\n    A namespace import cannot be tree-shaken: the bundler must assume any\n` +
    `    property of the namespace object might be read, so the package's whole\n` +
    `    re-export chain is retained in the browser bundle. This shipped 141KB of\n` +
    `    never-executed Sentry code on every route once already.\n\n` +
    `    Fix: import the bindings you actually use.\n` +
    `      import * as Pkg from 'pkg'   ->   import { thing } from 'pkg'\n\n` +
    `    If a namespace import is genuinely unavoidable, add it to ALLOWLIST in\n` +
    `    ${relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/')} with the reason.\n`,
)
console.error('[client-barrel] BUILD BLOCKED.\n')
process.exit(1)
