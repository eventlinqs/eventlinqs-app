/**
 * NOTHING ENTERS THE SITEMAP THAT DOES NOT RESOLVE.
 *
 * ============================================================================
 * WHY THIS GUARD EXISTS
 * ============================================================================
 *
 * A sitemap is a published promise. Every <loc> is this platform telling Google
 * in writing "this page exists, index it". Three separate ways of breaking that
 * promise were live in one file at the same time on 25 August 2026, and not one
 * of them failed a test, a type check or a gate:
 *
 *  1. A QUERY ON A COLUMN THAT DOES NOT EXIST. The venue block read
 *     `.from('venues').select('slug, updated_at')`. `public.venues` has no
 *     `slug` column and never has. Postgres answers `42703 column venues.slug
 *     does not exist`, a bare `catch {}` threw it away, and the block published
 *     nothing on every build of its life while looking exactly like a platform
 *     with no venues. TEST held 18 venues throughout.
 *
 *  2. PUBLISHING A URL THIS SAME REPOSITORY REDIRECTS. Six of the seven
 *     `/categories/<slug>` entries are 308ed to `/community/*` by next.config.
 *     Driven against production, redirects not followed: six 308s and one 200.
 *     Google's own build-a-sitemap page: "Don't include URLs that redirect or
 *     that aren't canonical."
 *     https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *     (fetched 25 August 2026)
 *
 *  3. PUBLISHING A URL SHAPE WITH NO ROUTE BEHIND IT. Nothing tied the shapes
 *     this file emits to the routes that exist, so a renamed or deleted route
 *     would go on being advertised until somebody clicked one.
 *
 * ============================================================================
 * WHAT THIS GUARD CHECKS, AND WHAT IT CANNOT
 * ============================================================================
 *
 * CHECKED, all statically, all from the repository:
 *   A. every `${baseUrl}` template in src/app/sitemap.ts maps to a real App
 *      Router route (literal segments match directories, `${...}` matches a
 *      [param] segment).
 *   B. no emitted path is a source in src/lib/seo/permanent-redirects.ts, and
 *      any template whose namespace contains redirect sources must consult
 *      `isRedirected` before pushing.
 *   C. every column named in a `.select(...)` or `.not(...)`/`.eq(...)` filter
 *      inside sitemap.ts exists on that table in the generated types
 *      (src/types/database.ts). This is the 42703 check.
 *   D. no `catch { }` in sitemap.ts swallows its error without reporting it.
 *
 * NOT CHECKED HERE, and named so the silence is not mistaken for coverage:
 *   - whether a given ROW resolves. `/events/<slug>` for a deleted event is a
 *     data question, not a source question, and only a request can answer it.
 *     That is scripts/verify/sitemap-url-sweep.mjs, run against a deployment.
 *   - whether the sitemap is STALE. Also a deployment property; the bound is
 *     `export const revalidate` in the file, and the sweep is what proves it.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const SITEMAP = 'src/app/sitemap.ts'
const REDIRECTS = 'src/lib/seo/permanent-redirects.ts'
const TYPES = 'src/types/database.ts'
const APP_DIR = join(ROOT, 'src', 'app')

const failures = []
const fail = (msg) => failures.push(msg)

function read(rel) {
  const p = join(ROOT, rel)
  if (!existsSync(p)) {
    fail(`${rel} does not exist; this guard cannot check a file that is not there`)
    return ''
  }
  return readFileSync(p, 'utf8')
}

/**
 * THE GUARD MUST READ CODE, NOT PROSE.
 *
 * The first run of this guard failed on `venues.slug` and was RIGHT about the
 * string and WRONG about the file: the only remaining mention was inside the
 * comment recording the defect. A guard that cannot tell a fixed bug's
 * post-mortem from the bug is a guard that punishes writing the post-mortem.
 *
 * So every check below reads a comment-stripped copy. String and template
 * literals are preserved verbatim, because that is where the URLs and the column
 * names live.
 */
const NEWLINE = String.fromCharCode(10)
const BACKSLASH = String.fromCharCode(92)

function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== NEWLINE) i++
      continue
    }
    if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n) {
        if (src[i] === BACKSLASH) {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

const sitemapRaw = read(SITEMAP)
const redirectRaw = read(REDIRECTS)
const typesSrc = read(TYPES)
const sitemapSrc = stripComments(sitemapRaw)
const redirectSrc = stripComments(redirectRaw)
if (!sitemapRaw || !redirectRaw || !typesSrc) {
  console.error('[sitemap-resolves] FAIL - a required file is missing.')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * The App Router route table, read off the filesystem.
 * ------------------------------------------------------------------ */

/** Every route path that has a page.tsx, with [param] segments preserved. */
function collectRoutes(dir, segments = []) {
  const out = []
  let names
  try {
    names = readdirSync(dir)
  } catch (error) {
    console.warn('[scripts/guards/sitemap-resolves:158]', error instanceof Error ? error.message : error)
    return out
  }
  if (names.includes('page.tsx') || names.includes('page.ts')) {
    out.push('/' + segments.join('/'))
  }
  for (const name of names) {
    const full = join(dir, name)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue
    // Route groups `(auth)` and private folders `_lib` add no URL segment.
    if (name.startsWith('_')) continue
    if (name.startsWith('@')) continue
    if (name.startsWith('(') && name.endsWith(')')) {
      out.push(...collectRoutes(full, segments))
      continue
    }
    out.push(...collectRoutes(full, [...segments, name]))
  }
  return out
}

const ROUTES = collectRoutes(APP_DIR).map(r => (r === '/' ? '/' : r.replace(/\/+$/, '')))

/** Does a sitemap shape (with PARAM placeholders) match a route? */
function routeExists(shape) {
  const want = shape === '/' ? [] : shape.replace(/^\//, '').split('/')
  return ROUTES.some(route => {
    const have = route === '/' ? [] : route.replace(/^\//, '').split('/')
    if (have.length !== want.length) return false
    return have.every((seg, i) => {
      const w = want[i]
      if (seg.startsWith('[') && seg.endsWith(']')) return true
      return seg === w && w !== 'PARAM'
    })
  })
}

/* ------------------------------------------------------------------ *
 * A. every emitted URL shape has a route
 * ------------------------------------------------------------------ */

/**
 * Every `${baseUrl}...` template literal in the sitemap, reduced to a path
 * shape. `${anything}` inside the path becomes PARAM.
 */
function emittedShapes(src) {
  const shapes = []
  const re = /`\$\{baseUrl\}([^`]*)`/g
  let m
  while ((m = re.exec(src)) !== null) {
    let path = m[1]
    // `${baseUrl}${path}` - the variable form used by the category loop.
    path = path.replace(/\$\{[^}]*\}/g, 'PARAM')
    if (path === '') path = '/'
    shapes.push({ raw: m[0], path })
  }
  return shapes
}

/**
 * The category loop builds its path into a local `const path` and pushes
 * `${baseUrl}${path}`, which reduces to bare PARAM above. Resolve those from the
 * local declaration so the shape is real rather than opaque.
 */
function localPathShapes(src) {
  const out = []
  const re = /const\s+path\s*=\s*`([^`]*)`/g
  let m
  while ((m = re.exec(src)) !== null) {
    out.push(m[1].replace(/\$\{[^}]*\}/g, 'PARAM'))
  }
  return out
}

const localShapes = localPathShapes(sitemapSrc)
const shapes = []
for (const s of emittedShapes(sitemapSrc)) {
  if (s.path === 'PARAM') {
    if (localShapes.length === 0) {
      fail(`${SITEMAP} emits \`\${baseUrl}\${...}\` with no resolvable local path; this guard cannot see what it publishes`)
      continue
    }
    for (const l of localShapes) shapes.push({ raw: s.raw, path: l })
    continue
  }
  shapes.push(s)
}

const uniqueShapes = [...new Set(shapes.map(s => s.path))].sort()
for (const shape of uniqueShapes) {
  if (!routeExists(shape)) {
    fail(`${SITEMAP} publishes ${shape} and no App Router page matches it`)
  }
}

/* ------------------------------------------------------------------ *
 * B. no emitted path is a redirect source
 * ------------------------------------------------------------------ */

/** Every `source:` literal in the redirect table. */
const redirectSources = [...redirectSrc.matchAll(/source:\s*'([^']+)'/g)].map(m => m[1])
if (redirectSources.length === 0) {
  fail(`${REDIRECTS} declares no redirect sources; either the table moved or this guard's reader is broken`)
}

/** Namespaces (first segment) that carry at least one redirect source. */
const redirectedNamespaces = new Set(
  redirectSources.map(s => '/' + s.replace(/^\//, '').split('/')[0]),
)

for (const shape of uniqueShapes) {
  if (redirectSources.includes(shape)) {
    fail(`${SITEMAP} publishes ${shape}, which permanent-redirects.ts redirects away`)
  }
}

/**
 * A TEMPLATED shape cannot be checked by literal comparison: `/categories/PARAM`
 * is not equal to `/categories/afrobeats`, yet the loop that emits it will emit
 * exactly that on the next iteration. So any template inside a namespace that
 * carries redirect sources must consult the redirect table before pushing.
 */
for (const shape of uniqueShapes) {
  if (!shape.includes('PARAM')) continue
  const ns = '/' + shape.replace(/^\//, '').split('/')[0]
  if (!redirectedNamespaces.has(ns)) continue
  if (!/isRedirected\s*\(/.test(sitemapSrc)) {
    fail(
      `${SITEMAP} publishes the template ${shape} inside ${ns}, a namespace with permanent redirects, ` +
        `and never calls isRedirected(); it will publish a redirect the moment a slug matches`,
    )
  }
}

/* ------------------------------------------------------------------ *
 * C. every column the sitemap names exists on that table  (the 42703 check)
 * ------------------------------------------------------------------ */

/**
 * The generated types, reduced to table -> Set(column). The file is
 * `Tables: { <name>: { Row: { <col>: <type> ... } ... } }` and only the Row
 * block is read, since Row is exactly "what you may select".
 */
function tableColumns(src) {
  const tables = new Map()
  // Each table opens as `      <name>: {` at a known indent inside Tables.
  const tableRe = /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
  let m
  while ((m = tableRe.exec(src)) !== null) {
    const name = m[1]
    const cols = new Set(
      [...m[2].matchAll(/^ {10}(\w+)(\??):/gm)].map(c => c[1]),
    )
    if (cols.size > 0) tables.set(name, cols)
  }
  return tables
}

const TABLES = tableColumns(typesSrc)
if (TABLES.size === 0) {
  fail(`${TYPES} yielded no tables; this guard's reader is broken and the 42703 check is not running`)
}

/**
 * Each `.from('<table>')` in the sitemap, with the chained call text that
 * follows it up to the next `.from(` or the end of the statement block.
 */
function tableQueries(src) {
  const out = []
  const re = /\.from\('(\w+)'\)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length
    // The window ends at the next `.from(` (a different query) or 1200 chars.
    const nextFrom = src.indexOf(".from('", start)
    const end = nextFrom === -1 ? Math.min(src.length, start + 1200) : Math.min(nextFrom, start + 1200)
    out.push({ table: m[1], chain: src.slice(start, end) })
  }
  return out
}

const queries = tableQueries(sitemapSrc)
let columnsChecked = 0
for (const q of queries) {
  const cols = TABLES.get(q.table)
  if (!cols) {
    fail(`${SITEMAP} queries table '${q.table}', which does not appear in ${TYPES}`)
    continue
  }
  const named = new Set()
  // .select('a, b, c')  - embeds like `x:y(z)` are skipped, they are relationships.
  for (const sel of q.chain.matchAll(/\.select\(\s*'([^']*)'/g)) {
    for (const part of sel[1].split(',')) {
      const col = part.trim()
      if (!col || col === '*' || col.includes('(') || col.includes(':')) continue
      named.add(col)
    }
  }
  // .eq('col', ...) / .not('col', ...) / .match({ col: ... }) / .order('col', ...)
  for (const f of q.chain.matchAll(/\.(?:eq|neq|not|gt|gte|lt|lte|is|ilike|like|in|order)\(\s*'([^',]+)'/g)) {
    named.add(f[1].trim())
  }
  for (const col of named) {
    columnsChecked++
    if (!cols.has(col)) {
      fail(
        `${SITEMAP} names ${q.table}.${col}, which does not exist in ${TYPES}. ` +
          `Postgres answers 42703 and a catch turns that into an empty sitemap section.`,
      )
    }
  }
}

/* ------------------------------------------------------------------ *
 * D. no silent catch
 * ------------------------------------------------------------------ */

for (const c of sitemapSrc.matchAll(/catch\s*(?:\(([^)]*)\))?\s*\{([\s\S]{0,400}?)\n {2}\}/g)) {
  const body = c[2]
  if (!/console\.(error|warn)/.test(body)) {
    fail(
      `${SITEMAP} has a catch block that reports nothing. A silent catch on this exact shape ` +
        `hid a 42703 for the whole life of the venue block.`,
    )
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log('[sitemap-resolves] what this guard scanned:')
console.log(`[sitemap-resolves]   ${SITEMAP} with comments stripped, ${ROUTES.length} App Router page route(s) on disk`)
console.log(`[sitemap-resolves]   ${uniqueShapes.length} URL shape(s) published:`)
for (const s of uniqueShapes) console.log(`[sitemap-resolves]     ${s}`)
console.log(`[sitemap-resolves]   ${redirectSources.length} permanent redirect source(s) read from ${REDIRECTS}`)
console.log(`[sitemap-resolves]   ${queries.length} table quer(ies), ${columnsChecked} column reference(s) checked against ${TYPES}`)
console.log('[sitemap-resolves] NOT checked here (by design): whether a given ROW resolves, and whether the')
console.log('[sitemap-resolves]   deployed sitemap is stale. Both are deployment properties and are measured by')
console.log('[sitemap-resolves]   scripts/verify/sitemap-url-sweep.mjs against a running site.')

if (failures.length > 0) {
  console.error(`\n[sitemap-resolves] FAIL - ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('[sitemap-resolves] PASS - every published URL shape has a route, none is redirected, every column exists.')
