/**
 * GUARD: NO ROW LEAVES THE PUBLIC API WITHOUT THE ORGANISER SCOPE IN THE QUERY.
 *
 * Close-out API1. The API's one promise is that a key for organiser A cannot
 * see organiser B, and the whole of that promise rests on a single predicate,
 * `.eq('organisation_id', scope.organisationId)`, being present on every query
 * the surface makes. A predicate that is present by convention is a predicate
 * somebody eventually forgets, and the way it fails is silent: the route works,
 * the tests pass, and it returns everybody's rows.
 *
 * So the surface is built so that the rule is CHECKABLE rather than merely
 * followed, and this reads it:
 *
 *   1. NO ROUTE FILE READS ANYTHING. Every file under src/app/api/v1 delegates
 *      to src/lib/api/v1/handlers.ts. It may not hold a Supabase client, may not
 *      call `.from(`, and may not build its own response. A route that cannot
 *      query cannot query unscoped.
 *   2. EVERY QUERY IN THE READER IS SCOPED. Every `createAdminClient()` chain in
 *      src/lib/api/v1/reads.ts must name one of the three API views and must
 *      carry the organisation predicate in the same chain, and may not carry a
 *      mutating call.
 *   3. THE READER IS THE ONLY READER. No other file in src/ names an
 *      `api_v1_*` object, so the scope rule cannot be walked around by a second
 *      reader somewhere else.
 *   4. THE VIEWS CARRY THE COLUMN THE PREDICATE NAMES. Read from the migration,
 *      because a predicate on a column that is not there is a predicate that
 *      matches nothing, or worse, errors into a fail-open branch.
 *   5. THE VIEWS ARE NOT WRITABLE. The migration must revoke insert, update and
 *      delete on each one from every role including service_role. `api_v1_events`
 *      and `api_v1_orders` are auto-updatable views and the service role
 *      bypasses row level security, so "read only" is a privilege, not a wish.
 *   6. NO 403 ANYWHERE ON THE SURFACE. A 403 tells the holder of organiser A's
 *      key that a given uuid is a real row belonging to somebody. The acceptance
 *      asks for 404 and this is why.
 *   7. EVERY RESPONSE NAMES THE ORGANISATION. There is one response builder and
 *      it injects the id, and nothing else on the surface calls
 *      `NextResponse.json`.
 *   8. THE KEY LOOKUP IS NOT CACHED. "A revoked key is refused within one
 *      request" is only true while every request re-reads the row.
 *   9. THE KEY SCREEN DOES NOT TYPE THE NUMBERS IT DOCUMENTS. The page size,
 *      the ceiling and the rate are read from the modules that enforce them, so
 *      a screen cannot quietly disagree with the system it describes.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build
 * host, in CI and in the pre-push gate alike, and needs no database. The
 * migration it reads lives under supabase/, which `.vercelignore` does not
 * exclude (types-cover-migrations already depends on that and proves it).
 *
 * WHAT IT CANNOT SEE, said rather than implied: it judges the SHAPE of the
 * query, not its result. That a scoped query actually returns only one
 * organiser's rows is proven by driving it, in
 * scripts/verify/api1-organiser-api-drive.mjs, against two real organisers on
 * TEST.
 *
 * Proven red and green: C:\\dev\\EVIDENCE\\API1\\guard-drills.txt, and drilled
 * in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/api-v1-organiser-scope.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[api-v1-organiser-scope]'

const ROUTES_DIR = join('src', 'app', 'api', 'v1')
const READS = join('src', 'lib', 'api', 'v1', 'reads.ts')
const HANDLERS = join('src', 'lib', 'api', 'v1', 'handlers.ts')
const RESPONSE = join('src', 'lib', 'api', 'v1', 'response.ts')
const KEYS = join('src', 'lib', 'api', 'v1', 'keys.ts')
const SCREEN = join('src', 'app', '(dashboard)', 'dashboard', 'api-keys', 'page.tsx')
const MIGRATION = join('supabase', 'migrations', '20260918000010_organiser_api_keys.sql')

/** The three objects the API may read, and the one column every one of them carries. */
const VIEWS = ['api_v1_events', 'api_v1_orders', 'api_v1_attendees']
const SCOPE_COLUMN = 'organisation_id'
const SCOPE_PREDICATE = `.eq('${SCOPE_COLUMN}', scope.organisationId)`

/** The named map `reads.ts` uses, so `.from(API_V1_RESOURCES.events)` resolves. */
const RESOURCE_CONSTANT = 'API_V1_RESOURCES'

const faults = []
const did = {
  'route file read': 0,
  'query chain judged': 0,
  'view judged against the migration': 0,
  'source file scanned for a second reader': 0,
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const NL = String.fromCharCode(10)

/** Comments out, so an apostrophe in prose cannot be read as a string. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** Strings out, so a Tailwind class name cannot be read as code. */
function stripStrings(src) {
  return src
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
}

// ---------------------------------------------------------------------------
// 1. NO ROUTE FILE READS ANYTHING.
// ---------------------------------------------------------------------------
function routeFiles(dir) {
  const here = join(ROOT, dir)
  const out = []
  for (const entry of readdirSync(here)) {
    const abs = join(here, entry)
    if (statSync(abs).isDirectory()) out.push(...routeFiles(join(dir, entry)))
    else if (entry === 'route.ts') out.push(join(dir, entry))
  }
  return out
}

const routes = routeFiles(ROUTES_DIR)
if (routes.length === 0) {
  faults.push(`${ROUTES_DIR} holds no route.ts; the API surface has vanished, or this guard is pointed at the wrong place`)
}

const BANNED_IN_A_ROUTE = [
  { needle: '.from(', why: 'a route file may not query; it delegates to src/lib/api/v1/handlers.ts' },
  { needle: 'createAdminClient', why: 'a route file may not hold a database client' },
  { needle: 'createClient', why: 'a route file may not hold a database client' },
  { needle: 'NextResponse.json', why: 'a route file may not build a response; every payload comes from src/lib/api/v1/response.ts' },
]

for (const rel of routes) {
  did['route file read']++
  const src = read(rel)
  const code = stripComments(src)
  for (const { needle, why } of BANNED_IN_A_ROUTE) {
    if (code.includes(needle)) faults.push(`${rel} contains ${needle}: ${why}`)
  }
  if (!/from '@\/lib\/api\/v1\/handlers'/.test(code)) {
    faults.push(`${rel} does not delegate to @/lib/api/v1/handlers`)
  }
  if (!/handleList\(|handleItem\(/.test(code)) {
    faults.push(`${rel} calls neither handleList nor handleItem`)
  }
}

// ---------------------------------------------------------------------------
// 2. EVERY QUERY IN THE READER IS SCOPED.
//
// The chain is walked rather than line-matched: from `createAdminClient()`,
// consume `.method( ... )` with balanced parentheses until the chain ends. That
// way a chain broken across eight lines is one unit, and a second chain further
// down the file cannot lend it a predicate it does not have.
// ---------------------------------------------------------------------------
function chainsFrom(src, start) {
  const chains = []
  let at = src.indexOf(start)
  while (at !== -1) {
    let i = at + start.length
    for (;;) {
      let j = i
      while (j < src.length && /\s/.test(src[j])) j++
      if (src[j] !== '.') break
      let k = j + 1
      while (k < src.length && /[\w$]/.test(src[k])) k++
      while (k < src.length && /\s/.test(src[k])) k++
      if (src[k] !== '(') break
      let depth = 0
      let end = k
      for (; end < src.length; end++) {
        if (src[end] === '(') depth++
        else if (src[end] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      if (end >= src.length) break
      i = end + 1
    }
    chains.push({ index: at, text: src.slice(at, i) })
    at = src.indexOf(start, at + start.length)
  }
  return chains
}

const readsSrc = read(READS)
const readsCode = stripComments(readsSrc)
const chains = chainsFrom(readsCode, 'createAdminClient()')

if (chains.length === 0) faults.push(`${READS} makes no query at all; this guard would pass vacuously`)

const MUTATIONS = ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']

for (const chain of chains) {
  did['query chain judged']++
  const line = readsCode.slice(0, chain.index).split(NL).length

  const from = /\.from\(([^)]*)\)/.exec(chain.text)
  if (!from) {
    faults.push(`${READS}:${line} a client chain with no .from(): it cannot be judged, so it may not exist`)
    continue
  }
  const arg = from[1].trim()
  const named = new RegExp(`^${RESOURCE_CONSTANT}\\.(\\w+)$`).exec(arg)
  const literal = /^'([^']+)'$/.exec(arg)
  let object = null
  if (named) {
    const key = named[1]
    const mapped = new RegExp(`${key}:\\s*'([^']+)'`).exec(readsCode)
    object = mapped ? mapped[1] : null
    if (!object) faults.push(`${READS}:${line} .from(${arg}) names a key that ${RESOURCE_CONSTANT} does not define`)
  } else if (literal) {
    object = literal[1]
  } else {
    faults.push(`${READS}:${line} .from(${arg}) is neither a ${RESOURCE_CONSTANT} member nor a string, so what it reads cannot be established`)
    continue
  }

  if (object && !VIEWS.includes(object)) {
    faults.push(`${READS}:${line} reads ${object}, which is not one of the scoped API views (${VIEWS.join(', ')})`)
  }
  if (!chain.text.includes(SCOPE_PREDICATE)) {
    faults.push(`${READS}:${line} the query on ${object ?? arg} does not carry ${SCOPE_PREDICATE}`)
  }
  for (const mutation of MUTATIONS) {
    if (chain.text.includes(mutation)) {
      faults.push(`${READS}:${line} the query on ${object ?? arg} calls ${mutation}: this surface is read only`)
    }
  }
}

// ---------------------------------------------------------------------------
// 3. THE READER IS THE ONLY READER.
// ---------------------------------------------------------------------------
function sourceFiles(dir) {
  const here = join(ROOT, dir)
  const out = []
  for (const entry of readdirSync(here)) {
    const abs = join(here, entry)
    if (statSync(abs).isDirectory()) out.push(...sourceFiles(join(dir, entry)))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(join(dir, entry))
  }
  return out
}

/** The reader owns the names; the types file merely describes the schema. */
const MAY_NAME_A_VIEW = new Set([READS, join('src', 'types', 'database.ts')])

for (const rel of sourceFiles('src')) {
  did['source file scanned for a second reader']++
  if (MAY_NAME_A_VIEW.has(rel)) continue
  const code = stripComments(read(rel))
  for (const view of VIEWS) {
    if (code.includes(view)) {
      faults.push(`${rel} names ${view}; only ${READS} may, so the scope predicate has one place to be forgotten rather than many`)
    }
  }
}

// ---------------------------------------------------------------------------
// 4 and 5. THE VIEWS CARRY THE SCOPE COLUMN, AND ARE NOT WRITABLE.
// ---------------------------------------------------------------------------
const migration = read(MIGRATION)
for (const view of VIEWS) {
  did['view judged against the migration']++
  const start = migration.indexOf(`create or replace view public.${view}`)
  if (start === -1) {
    faults.push(`${MIGRATION} does not create ${view}`)
    continue
  }
  const end = migration.indexOf(';', start)
  const body = migration.slice(start, end === -1 ? migration.length : end)
  if (!new RegExp(`\\b${SCOPE_COLUMN}\\b`).test(body)) {
    faults.push(`${view} does not select ${SCOPE_COLUMN}; the predicate every API query carries would match nothing`)
  }
  const revoke = new RegExp(`revoke[^;]*insert[^;]*update[^;]*delete[^;]*public\\.${view}[^;]*service_role`, 'i')
  if (!revoke.test(migration)) {
    faults.push(`${MIGRATION} does not revoke insert, update and delete on ${view} from service_role; a read only surface must be read only in the database`)
  }
}

// ---------------------------------------------------------------------------
// 6, 7 and 8. NO 403. ONE RESPONSE BUILDER. NO CACHE ON THE KEY LOOKUP.
// ---------------------------------------------------------------------------
const SURFACE = [...routes, READS, HANDLERS, RESPONSE, KEYS]
for (const rel of SURFACE) {
  const code = stripComments(read(rel))
  if (/\b403\b/.test(code)) {
    faults.push(`${rel} produces a 403; an out of scope id must answer 404, or the status is an existence oracle`)
  }
  if (rel !== RESPONSE && code.includes('NextResponse.json')) {
    faults.push(`${rel} builds its own response; every payload comes from ${RESPONSE} so the organisation id is on all of them`)
  }
}

const responseCode = stripComments(read(RESPONSE))
if (!responseCode.includes(`${SCOPE_COLUMN}: scope.organisationId`)) {
  faults.push(`${RESPONSE} does not put ${SCOPE_COLUMN} on the payload it builds`)
}
for (const builder of ['apiV1NotFound', 'apiV1BadRequest', 'apiV1Unavailable']) {
  const at = responseCode.indexOf(`export function ${builder}`)
  if (at === -1) {
    faults.push(`${RESPONSE} no longer exports ${builder}`)
    continue
  }
  const body = responseCode.slice(at, responseCode.indexOf(NL + '}', at))
  if (!body.includes(`${SCOPE_COLUMN}: scope.organisationId`)) {
    faults.push(`${RESPONSE} ${builder} answers without naming the organisation`)
  }
}

const keysCode = stripComments(read(KEYS))
const CACHES = ['unstable_cache', 'from \'react\'', 'new Map(', 'new WeakMap(', 'revalidate']
for (const cache of CACHES) {
  if (keysCode.includes(cache)) {
    faults.push(`${KEYS} contains ${cache}; the key lookup must read the database on every request, or a revoked key is not refused within one`)
  }
}

// ---------------------------------------------------------------------------
// 9. THE KEY SCREEN DOES NOT TYPE THE NUMBERS IT DOCUMENTS.
// ---------------------------------------------------------------------------
const screenCode = stripStrings(stripComments(read(SCREEN)))
for (const symbol of ['DEFAULT_PAGE_SIZE', 'MAX_PAGE_SIZE', 'POLICIES']) {
  if (!screenCode.includes(symbol)) {
    faults.push(`${SCREEN} does not read ${symbol}; the documented figure would be a claim rather than a reading`)
  }
}
/*
 * Zero and one are structure (an index, a count of one), never a cap. Every
 * other bare number on this page is a figure somebody typed.
 */
for (const match of screenCode.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)) {
  if (match[1] !== '0' && match[1] !== '1') {
    const line = screenCode.slice(0, match.index).split(NL).length
    faults.push(`${SCREEN}:${line} the literal ${match[1]} is typed onto the key screen; read it from the module that enforces it`)
  }
}

// ---------------------------------------------------------------------------
declareWork('api-v1-organiser-scope', {
  did,
  found: { 'unscoped or unprovable read on the public API': faults.length },
})

console.log(
  `${TAG} judged ${routes.length} route file(s), ${chains.length} query chain(s) and ${VIEWS.length} view(s) ` +
    `against ${did['source file scanned for a second reader']} source file(s)`,
)

if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  process.exitCode = 1
} else {
  console.log(`${TAG} PASS - every public API read names one organisation, and only that organisation can be named.`)
}
