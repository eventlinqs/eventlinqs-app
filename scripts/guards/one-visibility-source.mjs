/**
 * ONE SOURCE OF TRUTH FOR WHAT THE PUBLIC MAY SEE.
 *
 * ============================================================================
 * THE DEFECT, 25 August 2026, on production
 * ============================================================================
 *
 * After the demo catalogue was purged, /events rendered a page that disagreed
 * with itself on one render:
 *
 *     header count            "2 events available"   CORRECT
 *     "All events" section     2 events              CORRECT
 *     "Popular this week" rail 8 events              EVERY ONE DELETED
 *
 * A visitor clicking any of the eight got a 404 on a live ticketing platform.
 *
 * Two causes, and this guard exists for both.
 *
 *   1. THE PREDICATE WAS COPIED, NOT SHARED. `status='published'` and
 *      `visibility='public'` were written out by hand in twenty source files.
 *      Twenty copies of a rule are twenty rules, and they had already drifted:
 *      the count applied the listing window, the rail applied it to a query
 *      whose id filter it then skipped entirely whenever nothing had been
 *      bought that week.
 *
 *   2. A CACHE HELD ROWS. The rail read through `unstable_cache`, which is a
 *      SERVER-SIDE data cache keyed by cache key rather than by URL. That is why
 *      loading `/events?x=1` in a private tab, a URL never requested before,
 *      still served the deleted rows, and why "the cache is eliminated" was a
 *      reasonable but wrong conclusion. A cached ROW outlives the row it copied.
 *
 * ============================================================================
 * WHAT IT CHECKS
 * ============================================================================
 *
 * RULE 1  A public events read composes from applyPublicEventVisibility rather
 *         than spelling the predicate out again.
 *
 * RULE 2  A tag declared on a cached read is registered in EVENT_DATA_CACHE_TAGS,
 *         so revalidateEventSurfaces clears it. Before this guard, of every tag
 *         declared anywhere in the codebase exactly ONE was ever invalidated.
 *
 * IT PRINTS WHAT IT SCANNED, always, and FAILS IF IT SCANNED NOTHING, because a
 * guard whose matcher silently stopped matching is indistinguishable from a
 * guard that is passing.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const SRC = join(ROOT, 'src')

const rel = p => relative(ROOT, p).split('\\').join('/')

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

/** Comments stripped so prose describing the rule cannot trip the matcher. */
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

/**
 * Surfaces that legitimately read events the public cannot see, and why.
 *
 * These are NOT discovery. An organiser dashboard must show its own drafts; the
 * admin panel must show everything; the sale gate reads posture rather than
 * listing. Each is named with its reason so the list cannot quietly become the
 * place a real discovery surface is hidden.
 */
const NOT_DISCOVERY = [
  ['src/app/(dashboard)/', 'the organiser dashboard, which must show its own drafts and paused events'],
  ['src/app/admin/', 'the admin panel, which sees everything by definition'],
  ['src/lib/admin/', 'admin reporting, same reason'],
  ['src/app/api/cron/', 'cron jobs act on rows regardless of public visibility'],
  ['src/lib/events/public-visibility.ts', 'the rule itself'],
  ['src/lib/events/listing-window.ts', 'the WHEN half of the rule'],
  ['src/lib/events/revalidate-event.ts', 'invalidation, not reading'],
  ['src/lib/events/cache-tags.ts', 'the tag registry'],
]

const exemption = r => NOT_DISCOVERY.find(([prefix]) => r.startsWith(prefix))

const files = walk(SRC)
const rule1 = []
const rule2 = []
let discoveryReads = 0
let composed = 0
let cachedReads = 0

// The registry, read from source so the guard cannot drift from it.
const registrySrc = readFileSync(join(SRC, 'lib', 'events', 'cache-tags.ts'), 'utf8')
const REGISTERED = new Set(
  [...registrySrc.matchAll(/^\s*'([^']+)',\s*$/gm)].map(m => m[1]),
)

for (const f of files) {
  const r = rel(f)
  const raw = readFileSync(f, 'utf8')
  const c = code(raw)
  const lines = raw.split(/\r?\n/)

  // ---- RULE 1: a hand-written publication predicate on an events read -------
  const handWritten =
    /\.eq\(\s*['"]status['"]\s*,\s*['"]published['"]\s*\)/.test(c) &&
    /\.eq\(\s*['"]visibility['"]\s*,\s*['"]public['"]\s*\)/.test(c)

  const sharesRule = /applyPublicEventVisibility|PUBLIC_EVENT_MATCH/.test(c)
  const readsEvents = /\.from\(\s*['"]events['"]\s*\)/.test(c)

  if (!exemption(r) && (handWritten || (sharesRule && readsEvents))) {
    discoveryReads += 1
    if (sharesRule) composed += 1

    /*
     * A HAND-WRITTEN PAIR IS A VIOLATION EVEN WHEN THE FILE ALSO SHARES THE RULE.
     *
     * The first version of this guard treated "shares the rule" as absolution, so
     * a file that merely IMPORTED PUBLIC_EVENT_MATCH passed while spelling the
     * predicate out at the actual query site. The drill in
     * scripts/verify/guard-failure-drills.mjs found this immediately: it swapped
     * the shared call back for the literal pair and the guard reported PASS on a
     * violating tree. That is the exact shape of a guard that is not guarding,
     * and it is why every guard here has a drill.
     */
    if (handWritten) {
      const line = lines.findIndex(l => /\.eq\(\s*['"]status['"]\s*,\s*['"]published['"]/.test(l)) + 1
      rule1.push({ file: r, line })
    }
  }

  // ---- RULE 2: every cached tag is registered ------------------------------
  for (const m of c.matchAll(/tags:\s*\[([^\]]*)\]/g)) {
    // Only where it is genuinely a cache options object.
    const around = c.slice(Math.max(0, m.index - 400), m.index + 200)
    if (!/unstable_cache|cacheLife|revalidate:/.test(around)) continue
    cachedReads += 1
    for (const rawTag of m[1].split(',')) {
      const t = rawTag.trim()
      if (t === '') continue
      if (/EVENT_DATA_CACHE_TAGS/.test(t)) continue // reads the registry, fine
      const name = t.replace(/^['"`]|['"`]$/g, '')
      if (REGISTERED.has(name)) continue
      // Image/other caches that hold no event rows are out of scope.
      if (/^pexels/.test(name) || name === 'picker-cities' || name === 'inventory') continue
      const line = raw.split(/\r?\n/).findIndex(l => l.includes(name)) + 1
      rule2.push({ file: r, line, tag: name })
    }
  }
}

console.log(`[one-visibility-source] scanned ${files.length} file(s) under src/`)
console.log(`[one-visibility-source] discovery event reads: ${discoveryReads}; composing from the shared rule: ${composed}`)
console.log(`[one-visibility-source] cached reads carrying a tag: ${cachedReads}; registered tags: ${REGISTERED.size}`)
console.log(`[one-visibility-source] surfaces exempt as NOT discovery: ${NOT_DISCOVERY.length}`)
for (const [prefix, why] of NOT_DISCOVERY) console.log(`    ${prefix}  ${why}`)

if (files.length === 0) {
  console.error('[one-visibility-source] FAIL - scanned nothing. The matcher is broken.')
  process.exit(1)
}

/*
 * THE SCOPE FLOOR. Borrowed straight from no-display-time-exclusion.mjs, which
 * on the very day this guard was written caught its own scope collapsing from 15
 * files to 12 because the migration changed the query shape it detected.
 *
 * Without a floor, a guard whose matcher stops matching prints exactly the same
 * PASS as a guard that checked everything, and it does it quietly, forever. The
 * number below was the measured scope on 25 August 2026 (18 discovery reads),
 * less a margin for surfaces that are legitimately removed.
 */
const MIN_DISCOVERY_READS = 14
if (discoveryReads < MIN_DISCOVERY_READS) {
  console.error('')
  console.error(`[one-visibility-source] FAIL - SCOPE COLLAPSED. ${discoveryReads} discovery read(s) found, floor is ${MIN_DISCOVERY_READS}.`)
  console.error('  Either the query shape changed and this matcher no longer sees the platform,')
  console.error('  or discovery surfaces were removed. A guard that scans less than it used to')
  console.error('  must say so rather than get quieter. Update the matcher, or lower the floor')
  console.error('  deliberately and say why.')
  process.exit(1)
}

const failed = rule1.length > 0 || rule2.length > 0
if (rule1.length > 0) {
  console.error('')
  console.error('[one-visibility-source] FAIL - a discovery query spells out the publication')
  console.error('                        predicate instead of composing from the shared rule.')
  console.error('')
  for (const v of rule1) console.error(`  ${v.file}:${v.line}`)
  console.error('')
  console.error("  Use:  import { applyPublicEventVisibility } from '@/lib/events/public-visibility'")
  console.error('        let q = applyPublicEventVisibility(supabase.from(\'events\').select(COLS))')
  console.error('')
  console.error('  Two parts of one page asking this question in two different ways is exactly')
  console.error('  how /events came to print a correct count of 2 beside a rail of 8 deleted events.')
}
if (rule2.length > 0) {
  console.error('')
  console.error('[one-visibility-source] FAIL - a cached read declares a tag that nothing invalidates.')
  console.error('')
  for (const v of rule2) console.error(`  ${v.file}:${v.line}   tag "${v.tag}" is not in EVENT_DATA_CACHE_TAGS`)
  console.error('')
  console.error('  Add it to src/lib/events/cache-tags.ts so revalidateEventSurfaces clears it,')
  console.error('  or do not cache event rows at all: cache a ranking or an id list and read the')
  console.error('  rows live. A cached row outlives the row.')
}

if (failed) process.exit(1)
console.log('[one-visibility-source] PASS - one visibility rule, and every event cache tag is invalidated.')
