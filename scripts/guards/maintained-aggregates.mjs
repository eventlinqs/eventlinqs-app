/**
 * A SECOND COPY MUST HAVE SOMETHING KEEPING IT IN STEP.
 *
 * ============================================================================
 * THE CLASS
 * ============================================================================
 *
 * A number written down in a second place, where the second place can disagree
 * with the rows it summarises. This platform has been bitten by it four times in
 * one week, in four different mechanisms:
 *
 *   a cached RAIL   eight deleted events rendered beside a correct count of 2
 *   a cached FILE   a sitemap advertising 48 URLs whose rows were gone
 *   a cached FIGURE ticket_tiers.reserved_count holding seats nobody holds
 *   a stored TOTAL  event_addons.sold_count stuck at 0 while the checkout
 *                   capped an addon at total_capacity minus it
 *
 * Not one failed a test, because in every case the code was correct. What was
 * missing was a link between the write and the copy. This guard is that link,
 * made unskippable.
 *
 * ============================================================================
 * CHECK 1: EVERY CACHE TAG IS CLEARED BY SOMETHING
 * ============================================================================
 *
 * A tag declared where a cache is BUILT and never named where the data CHANGES
 * is a tag nothing invalidates. On 25 August 2026 an audit of this tree found
 * that of every tag declared on a cached read, exactly one (`picker-cities`) was
 * ever passed to a clearing call.
 *
 * So: every tag in a `tags: [...]` cache option under src/ must either appear in
 * a revalidateTag / updateTag / expireTag call under src/, or carry a written
 * exemption below. The exemption list is printed on every run so it cannot rot
 * into an unexamined allowlist.
 *
 * ============================================================================
 * CHECK 2: EVERY IN-PLACE INCREMENT IS DECLARED, WITH ITS DECREMENT
 * ============================================================================
 *
 * An increment can miss a path. A recompute cannot. `events.is_free` proves the
 * point: its trigger fires on INSERT, UPDATE and DELETE and recomputes from the
 * whole tier set, and the drift drive shows it following in both directions.
 * Every figure that DRIFTED in that drive is maintained by an increment instead.
 *
 * So any column this repository increments in place, in SQL or in TypeScript,
 * must appear in the registry below naming what maintains it and, where it is
 * knowingly one-directional, saying so in writing. A new counter added with no
 * entry fails the build; an entry whose named site has vanished also fails,
 * because a registry that can point at nothing is worse than none.
 *
 * ============================================================================
 * CHECK 3: EVERY AGGREGATE-SHAPED COLUMN THAT EXISTS IS ADJUDICATED
 * ============================================================================
 *
 * Checks 1 and 2 catch a figure once somebody WRITES to it, which is one edit
 * too late. event_addons.sold_count and tier_access_codes.current_uses both
 * existed for months with NOTHING writing them, so neither appeared as an
 * in-place increment, and a checkout enforced a cap against each of them.
 *
 * So check 3 looks at what EXISTS: every column in the generated types whose
 * name ends in _count, or is exactly current_uses, must carry a verdict in
 * scripts/lib/stored-aggregates.mjs. Adding one without an entry fails the
 * build, whether or not anything has been written to touch it yet.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE
 * ============================================================================
 *
 *   - whether a maintainer is CORRECT. It reads that a decrement exists, not
 *     that it subtracts the right amount. That is
 *     scripts/verify/aggregate-drift-drive.mjs, which changes real rows in a
 *     real database and looks.
 *   - drift that has already happened in live data. Also the drive; its census
 *     reports it.
 *   - a tag cleared in a file outside src/ (a cron script, say). None exists
 *     today; if one is added, the exemption below is where it is recorded.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORED_AGGREGATES } from '../lib/stored-aggregates.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const fail = m => failures.push(m)

/* ------------------------------------------------------------------ *
 * Reviewed exemptions. Printed every run, on purpose.
 * ------------------------------------------------------------------ */

/**
 * A cache tag with no invalidation, admitted because there is no write to
 * invalidate FROM. Each entry names the reason; an entry that stops matching is
 * reported so the list cannot rot.
 */
const TAG_EXEMPTIONS = [
  {
    tag: 'pexels',
    reason:
      'the licensed stock-photo pool, cached 7 days. Its source is the Pexels API, which this platform never writes to, so there is no mutation that could invalidate it. A 7 day window on a photograph is the whole design.',
  },
  { tag: 'pexels-city', reason: 'same pool, keyed per city. Same reason as pexels above.' },
  { tag: 'pexels-community', reason: 'same pool, keyed per community. Same reason as pexels above.' },
  { tag: 'pexels-sub-community', reason: 'same pool, keyed per sub-community. Same reason as pexels above.' },
  { tag: 'pexels-suburb', reason: 'same pool, keyed per suburb. Same reason as pexels above.' },
]

/**
 * THE REGISTRY MOVED, and this guard reads it rather than carrying a copy.
 *
 * It used to be a literal in this file. That made it invisible to the recurring
 * reconciliation and to anyone reading the codebase for what maintains a figure,
 * and it put the guard one careless edit away from disagreeing with the report.
 * scripts/lib/stored-aggregates.mjs is now the single source for the verdict per
 * column; the recount SQL is the view public.stored_aggregate_drift; this file
 * is only the thing that fails the build.
 */
const AGGREGATE_REGISTRY = STORED_AGGREGATES

/* ------------------------------------------------------------------ *
 * File walking
 * ------------------------------------------------------------------ */

function walk(dir, test, out = []) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const full = join(dir, name)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) walk(full, test, out)
    else if (test(name)) out.push(full)
  }
  return out
}

const srcFiles = walk(SRC, n => n.endsWith('.ts') || n.endsWith('.tsx'))
const migrationFiles = existsSync(MIGRATIONS) ? walk(MIGRATIONS, n => n.endsWith('.sql')) : []
if (srcFiles.length === 0) fail('no TypeScript files found under src/; this guard is not scanning anything')

/* ------------------------------------------------------------------ *
 * CHECK 1: cache tags
 * ------------------------------------------------------------------ */

/** tag -> [file:line] where it is DECLARED on a cache. */
const declared = new Map()
/** tag -> [file:line] where it is CLEARED. */
const cleared = new Map()
/** Identifier -> its string value, for `const X = 'tag'` indirection. */
const constants = new Map()

for (const file of srcFiles) {
  const rel = relative(ROOT, file).split('\\').join('/')
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) {
    constants.set(m[1], m[2])
  }
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    // A DECLARATION is a `tags: [...]` in the same expression as a revalidate.
    const dec = line.match(/tags:\s*\[([^\]]*)\]/)
    if (dec && /revalidate\s*:/.test(line)) {
      for (const raw of dec[1].split(',')) {
        const t = raw.trim()
        if (!t) continue
        if (!declared.has(t)) declared.set(t, [])
        declared.get(t).push(at)
      }
    }
    // A CLEAR is any of the three invalidation calls.
    const clr = line.match(/\b(?:revalidateTag|updateTag|expireTag)\(\s*([^,)]+)/)
    if (clr && !/^\s*(\*|\/\/)/.test(line)) {
      const t = clr[1].trim()
      if (!cleared.has(t)) cleared.set(t, [])
      cleared.get(t).push(at)
    }
  })
}

/**
 * Resolve a tag expression to the string it will actually be at runtime.
 *
 * Three spellings are in use and they must compare equal or the guard reports a
 * tag as uncleared when the clearing call spells it differently:
 *   'inventory'                  a literal
 *   INVENTORY_CACHE_TAG          a named constant
 *   EVENT_DATA_CACHE_TAGS[0      an index into the registry array
 */
const eventTagsFile = join(SRC, 'lib', 'events', 'cache-tags.ts')
const eventTags = existsSync(eventTagsFile)
  ? [...readFileSync(eventTagsFile, 'utf8').matchAll(/^\s*'([a-z0-9:_-]+)',$/gm)].map(m => m[1])
  : []
if (eventTags.length === 0) fail('src/lib/events/cache-tags.ts yielded no tags; this guard cannot resolve the event registry')

function resolveTag(expr) {
  const e = expr.trim()
  const lit = e.match(/^'([^']+)'$/)
  if (lit) return lit[1]
  const idx = e.match(/^EVENT_DATA_CACHE_TAGS\[(\d+)$/)
  if (idx) return eventTags[Number(idx[1])] ?? e
  if (constants.has(e)) return constants.get(e)
  return e
}

/** `for (const tag of EVENT_DATA_CACHE_TAGS) updateTag(tag)` clears them all. */
const clearsWholeEventRegistry = srcFiles.some(f => {
  const t = readFileSync(f, 'utf8')
  return /for\s*\(\s*const\s+(\w+)\s+of\s+EVENT_DATA_CACHE_TAGS\s*\)[\s\S]{0,120}?updateTag\(\s*\1\s*\)/.test(t)
})

const clearedSet = new Set()
for (const [expr, sites] of cleared) {
  const t = resolveTag(expr)
  if (t) clearedSet.add(t)
  void sites
}
if (clearsWholeEventRegistry) for (const t of eventTags) clearedSet.add(t)

const exemptTags = new Set(TAG_EXEMPTIONS.map(e => e.tag))
const declaredResolved = new Map()
for (const [expr, sites] of declared) declaredResolved.set(resolveTag(expr), sites)

const tagVerdicts = []
for (const [tag, sites] of [...declaredResolved].sort()) {
  let verdict
  if (clearedSet.has(tag)) verdict = 'CLEARED'
  else if (exemptTags.has(tag)) verdict = 'EXEMPT'
  else {
    verdict = 'NOTHING CLEARS IT'
    fail(
      `cache tag '${tag}' is declared at ${sites.join(', ')} and nothing anywhere calls revalidateTag, ` +
        `updateTag or expireTag with it. Either invalidate it where the data changes, or add a written ` +
        `exemption to TAG_EXEMPTIONS in this guard.`,
    )
  }
  tagVerdicts.push({ tag, verdict, sites })
}

for (const e of TAG_EXEMPTIONS) {
  if (!declaredResolved.has(e.tag)) {
    fail(`TAG_EXEMPTIONS names '${e.tag}', which is no longer declared anywhere. Remove the entry.`)
  }
}

/* ------------------------------------------------------------------ *
 * CHECK 2: in-place increments
 * ------------------------------------------------------------------ */

const registered = new Set(AGGREGATE_REGISTRY.map(a => a.column))
/** column -> [file:line] where it is incremented in place. */
const increments = new Map()

const noteIncrement = (col, at) => {
  if (!increments.has(col)) increments.set(col, [])
  increments.get(col).push(at)
}

/**
 * SQL: `SET <col> = <col> + ...` inside an UPDATE of a known table.
 *
 * COMMENTS ARE STRIPPED FIRST, AND THE TABLE RESETS AT EVERY `;`. Without both,
 * the first run of this guard reported five columns that do not exist:
 * orders.sold_count, tickets.views, tickets.clicks, tickets.conversions and
 * organisations.founding_bonus_months. Every one came from a line inside a `--`
 * comment, attributed to whichever UPDATE happened to appear earlier in the
 * file. A guard that invents columns teaches people to ignore it.
 */
const stripSqlComments = sql =>
  sql
    .split('\n')
    .map(l => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

for (const file of migrationFiles) {
  const rel = relative(ROOT, file).split('\\').join('/')
  const lines = stripSqlComments(readFileSync(file, 'utf8')).split('\n')
  let currentTable = ''
  lines.forEach((line, i) => {
    const upd = line.match(/UPDATE\s+(?:public\.)?(\w+)/i)
    if (upd) currentTable = upd[1]
    const inc = line.match(/\b(\w+)\s*=\s*(?:GREATEST\s*\(\s*\d+\s*,\s*)?(?:\w+\.)?\1\s*[+-]/i)
    if (inc && currentTable) noteIncrement(`${currentTable}.${inc[1]}`, `${rel}:${i + 1}`)
    // A statement ends; the next `x = x + 1` belongs to whatever comes next, not
    // to this UPDATE.
    if (line.includes(';')) currentTable = ''
  })
}

/**
 * TypeScript: `<col>: (row.<col> as number) + ...` or `<col>: row.<col> + ...`
 *
 * A WRITE IS REQUIRED, NOT JUST THE SHAPE. The window must contain BOTH a
 * `.from('<table>')` and an `.update(`, because `x: acc.x + c.x` is also the
 * shape of an ordinary in-memory reduce. The first run of this guard reported
 * tickets.views, tickets.clicks, tickets.conversions and tickets.tickets, all
 * four of which are one `reduce` in src/lib/broadcast/reach.ts that touches no
 * database at all and was attributed to whatever `.from(` was nearest.
 */
for (const file of srcFiles) {
  const rel = relative(ROOT, file).split('\\').join('/')
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(\w+):\s*\(?\s*\w+\.(\1)\b[^)]*\)?\s*(?:as\s+number\s*\)?)?\s*[+-]/)
    if (!m) return
    const windowLines = lines.slice(Math.max(0, i - 40), Math.min(lines.length, i + 40))
    if (!windowLines.some(l => /\.update\(/.test(l))) return
    const before = lines.slice(Math.max(0, i - 40), i).reverse()
    const fromLine = before.find(l => /\.from\('(\w+)'\)/.test(l))
    const table = fromLine?.match(/\.from\('(\w+)'\)/)?.[1]
    if (table) noteIncrement(`${table}.${m[1]}`, `${rel}:${i + 1}`)
  })
}

const incrementVerdicts = []
for (const [column, sites] of [...increments].sort()) {
  const known = registered.has(column)
  incrementVerdicts.push({ column, known, sites })
  if (!known) {
    fail(
      `${column} is incremented in place at ${sites.join(', ')} and is not in AGGREGATE_REGISTRY. ` +
        `A stored figure with no declared maintainer is the shape that put eight deleted events on /events. ` +
        `Add it, naming what increments it, what decrements it, and what the drift drive says.`,
    )
  }
}

/* ------------------------------------------------------------------ *
 * CHECK 3: EVERY AGGREGATE-SHAPED COLUMN THAT EXISTS IS ADJUDICATED
 * ------------------------------------------------------------------ */

/**
 * FOUNDER RULING, 25 August 2026: "make the class impossible rather than the
 * instances fixed."
 *
 * Checks 1 and 2 catch a figure once somebody WRITES to it. That is one edit too
 * late: `event_addons.sold_count` and `tier_access_codes.current_uses` both
 * existed for months with NOTHING writing them, so neither showed up as an
 * in-place increment and both were enforced against by a checkout. A column that
 * exists and is maintained by nothing is the worst case in the class, and it is
 * invisible to a detector that looks for writes.
 *
 * So this looks at what EXISTS. Every column in the generated types whose name
 * ends in `_count`, or is exactly `current_uses`, must carry a verdict in
 * scripts/lib/stored-aggregates.mjs. Adding one without an entry fails the
 * build, whether or not a line of code has been written to touch it yet.
 *
 * THE PATTERN IS DELIBERATELY TIGHT. Widening it to every `_cents` or `_total`
 * would sweep in per-row transaction amounts (orders.total_cents,
 * payments.amount_cents), which are the primary record rather than a copy of
 * one, and a gate that fires on a hundred false positives is a gate somebody
 * switches off. Columns outside the pattern that ARE in the class
 * (organisations.total_volume_cents, hold_amount_cents) are caught by check 2
 * when they are written, and are registered here anyway.
 */
const AGGREGATE_NAME = /(_count$|^current_uses$)/

/**
 * The generated types, reduced to table -> Set(column).
 *
 * The types are read rather than the migrations, because the migrations are the
 * HISTORY of the schema and a column added in one and dropped in another would
 * be found twice and adjudicated wrongly. src/types/database.ts is what the
 * schema IS, and the `types-drift guard` in CI is what keeps it honest.
 */
const TYPES = 'src/types/database.ts'

function tableColumns() {
  const file = join(ROOT, TYPES)
  if (!existsSync(file)) {
    fail(`${TYPES} does not exist; check 3 cannot see which columns exist and is not running`)
    return new Map()
  }
  const src = readFileSync(file, 'utf8')
  const tables = new Map()
  const tableRe = /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
  let m
  while ((m = tableRe.exec(src)) !== null) {
    const cols = new Set([...m[2].matchAll(/^ {10}(\w+)(\??):/gm)].map(c => c[1]))
    if (cols.size > 0) tables.set(m[1], cols)
  }
  if (tables.size === 0) {
    fail(`${TYPES} yielded no tables; check 3's reader is broken and the check is not running`)
  }
  return tables
}

const TABLES = tableColumns()

const shapedColumns = new Map()
for (const [table, cols] of TABLES) {
  for (const col of cols) {
    if (AGGREGATE_NAME.test(col)) shapedColumns.set(`${table}.${col}`, table)
  }
}

const shapedVerdicts = []
for (const [column] of [...shapedColumns].sort()) {
  const entry = AGGREGATE_REGISTRY.find(a => a.column === column)
  shapedVerdicts.push({ column, maintenance: entry?.maintenance ?? null })
  if (!entry) {
    fail(
      `${column} exists and carries no verdict in scripts/lib/stored-aggregates.mjs. ` +
        `A column that stores a count and is maintained by nothing is the shape that left ` +
        `event_addons.sold_count at 0 while the checkout capped an addon against it. ` +
        `Add an entry saying whether it is trigger-maintained, application-maintained, ` +
        `unmaintained or not-in-class, and why.`,
    )
    continue
  }
  const allowed = ['trigger', 'application', 'unmaintained', 'not-in-class']
  if (!allowed.includes(entry.maintenance)) {
    fail(`${column} has a registry entry whose maintenance is "${entry.maintenance}", not one of ${allowed.join(', ')}.`)
  }
  if (!entry.maintainedBy || entry.maintainedBy.length < 10) {
    fail(`${column} has a registry entry that does not say what maintains it.`)
  }
}

/**
 * A registry entry naming a column that no longer exists.
 *
 * The reverse rot: a list that can point at nothing is worse than no list,
 * because it reads as coverage. Only checked for the shaped names, since the
 * registry deliberately also carries columns outside the pattern.
 */
for (const entry of AGGREGATE_REGISTRY) {
  const [table, col] = entry.column.split('.')
  if (!AGGREGATE_NAME.test(col ?? '')) continue
  if (!TABLES.has(table) || !TABLES.get(table).has(col)) {
    fail(`scripts/lib/stored-aggregates.mjs registers ${entry.column}, which does not exist in ${TYPES}. Remove the entry.`)
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log('[maintained-aggregates] what this guard scanned:')
console.log(`[maintained-aggregates]   ${srcFiles.length} file(s) under src/, ${migrationFiles.length} migration(s)`)
console.log(`[maintained-aggregates]   event cache registry: ${eventTags.length} tag(s); the loop that clears them all was ${clearsWholeEventRegistry ? 'FOUND' : 'NOT FOUND'}`)
console.log('')
console.log('[maintained-aggregates] CACHE TAGS, verdict per tag:')
for (const v of tagVerdicts) {
  console.log(`[maintained-aggregates]   ${v.verdict.padEnd(18)} ${v.tag}`)
}
console.log('[maintained-aggregates] reviewed tag exemptions, printed so they cannot rot:')
for (const e of TAG_EXEMPTIONS) {
  console.log(`[maintained-aggregates]   ${e.tag}`)
  console.log(`[maintained-aggregates]       ${e.reason}`)
}
console.log('')
console.log('[maintained-aggregates] AGGREGATE-SHAPED COLUMNS THAT EXIST, verdict per column:')
for (const v of shapedVerdicts) {
  console.log(`[maintained-aggregates]   ${(v.maintenance ?? 'NO VERDICT').toUpperCase().padEnd(14)} ${v.column}`)
}
console.log('')
console.log('[maintained-aggregates] IN-PLACE INCREMENTS found:')
for (const v of incrementVerdicts) {
  console.log(`[maintained-aggregates]   ${(v.known ? 'registered' : 'UNREGISTERED').padEnd(14)} ${v.column}  (${v.sites.length} site(s))`)
}
console.log('[maintained-aggregates] registry, with the drive verdict of 25 August 2026:')
for (const a of AGGREGATE_REGISTRY) {
  console.log(`[maintained-aggregates]   ${a.column}`)
  console.log(`[maintained-aggregates]       increment: ${a.increment}`)
  console.log(`[maintained-aggregates]       decrement: ${a.decrement}`)
  console.log(`[maintained-aggregates]       drive:     ${a.drive}`)
}
console.log('')
console.log('[maintained-aggregates] NOT checked here (by design): whether a maintainer is CORRECT, and')
console.log('[maintained-aggregates]   whether live data has already drifted. Both need a real database and')
console.log('[maintained-aggregates]   are measured by scripts/verify/aggregate-drift-drive.mjs.')

if (failures.length > 0) {
  console.error(`\n[maintained-aggregates] FAIL - ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('\n[maintained-aggregates] PASS - every cache tag is cleared or exempt, every increment is registered.')
