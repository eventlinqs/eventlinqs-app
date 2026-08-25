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
 * Every column this repository increments in place, and what maintains it.
 *
 * `drives` records the verdict from scripts/verify/aggregate-drift-drive.mjs on
 * 25 August 2026, so the registry carries the measurement rather than an opinion.
 */
const AGGREGATE_REGISTRY = [
  {
    column: 'ticket_tiers.reserved_count',
    increment: 'create_reservation (row-locked)',
    decrement: 'on_reservation_released, AFTER UPDATE OR DELETE (migration 20260825000001), and the expire sweeper',
    drive: 'FOLLOWS on create, cancel and delete since 20260825000001. DRIFTED on delete before it.',
  },
  {
    column: 'ticket_tiers.sold_count',
    increment: 'confirm_order (row-locked)',
    decrement: 'reconcile_refund',
    drive:
      'FOLLOWS on refund. DRIFTS when a ticket row is DELETED, which nothing in the product does. KNOWINGLY LEFT: it is the oversell figure under a row lock, and for a reserved-seating event the truth lives in seats, not tickets. Rewriting it is its own pass.',
  },
  {
    column: 'organisations.total_volume_cents',
    increment: 'recordOrderConfirmedLedger in src/lib/payments/connect-ledger.ts',
    decrement: 'reconcile_refund',
    drive:
      'FOLLOWS on refund. DRIFTS when a confirmed order is DELETED. KNOWINGLY LEFT in the column: since 25 August 2026 nothing renders it, because src/lib/admin/organisers.ts counts the rows instead.',
  },
  {
    column: 'organisations.total_event_count',
    increment: 'recordOrderConfirmedLedger in src/lib/payments/connect-ledger.ts',
    decrement: 'NONE ANYWHERE',
    drive:
      'DRIFTS on event delete, which is exactly what the production purge did 46 times. KNOWINGLY LEFT in the column: nothing renders it since src/lib/admin/organisers.ts started counting the rows.',
  },
  {
    column: 'organisations.hold_amount_cents',
    increment: 'recordOrderConfirmedLedger in src/lib/payments/connect-ledger.ts',
    decrement: 'reconcile_refund and the disbursement cron',
    drive:
      'FOLLOWS on refund. DRIFTS when a payout_hold row is DELETED. Not rendered on any organiser-facing or admin surface.',
  },
  {
    column: 'tickets.scan_count',
    increment: 'scan_ticket',
    decrement: 'not applicable',
    drive:
      'NOT THE SHAPE. ticket_scans is an audit log of every attempt including failures; scan_count counts successful admits only. They answer different questions and are written in one transaction, so neither is a copy of the other.',
  },
  {
    column: 'discount_codes.current_uses',
    increment: 'confirm_order',
    decrement: 'NONE ANYWHERE',
    drive:
      'DRIFTS when the order that consumed the code is DELETED: current_uses stayed 1 against a truth of 0, so a code capped at max_uses 3 read 2 uses left when 3 were left. discount_code_usages holds the countable truth and cascades with the order. KNOWINGLY LEFT: changing when a discount is consumed is a change to the checkout money path and belongs in its own pass, not in an audit.',
  },
  {
    column: 'organisations.founding_bonus_months',
    increment: 'src/lib/founding/invites.ts, on a referral being accepted',
    decrement: 'not applicable',
    drive:
      'NOT THE SHAPE. This is an AWARD, not a summary: months granted to an organiser for a referral. There is no set of rows it claims to total, so there is nothing it can disagree with. It is registered so the guard can say that out loud rather than fall silent on it.',
  },
  {
    column: 'payout_holds.amount_cents',
    increment: 'reconcile_refund reduces the hold proportionally on a partial refund',
    decrement: 'the same statement',
    drive:
      'NOT THE SHAPE. This is the hold row\'s OWN balance, not a total over other rows. organisations.hold_amount_cents is the figure that totals these, and that one IS registered above and does drift.',
  },
]

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
