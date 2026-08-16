/**
 * BUILD-FAILING GUARD: a published event may not be excluded from a discovery
 * surface by a display-time filter.
 *
 * FOUNDER RULING, 16 August 2026: PUBLISHED MEANS VISIBLE. The audit behind it
 * is docs/roast/exclusion-audit-2026-08-16.md, and the incident behind that is
 * an event that left /events at 09:01 on the morning it was on.
 *
 * WHAT A "DISPLAY-TIME FILTER" IS, precisely, because the phrase has to be
 * checkable rather than evocative: a rule that removes a row the database has
 * already decided is published and public, applied at or after the point the
 * page is built. Four shapes have actually occurred on this platform, and this
 * guard refuses all four:
 *
 *   RULE 1  An "upcoming" window written as a SQL lower bound at now,
 *           `.gte('start_date', now)`. This is the reported defect. The
 *           sanctioned rule is listed-until-it-has-ENDED and it lives in one
 *           place, src/lib/events/listing-window.ts.
 *   RULE 2  The same lower bound written in JavaScript instead: `start_date >=
 *           now` in a filter, or `from: nowIso` in a window literal. A window
 *           that includes today starts at the START of today.
 *   RULE 3  A cover-presence test used to REMOVE a row. Founder ruling: a cover
 *           may RANK an event, never exclude it (audit item 4). A comparator is
 *           fine; a .filter() is not.
 *   RULE 4  A post-query filter running on a page the DATABASE has already
 *           chosen. This is the subtle one and it is what audit item 10 turned
 *           out to be: filtering after .range() leaves a short page whose
 *           dropped rows are never pulled forward from page 2, and reports the
 *           survivors of that one page as the total. The fix is to fetch the
 *           bounded superset and slice the page out afterwards; this rule pins
 *           that the two halves of the fix stay together.
 *
 * WHY A GUARD RATHER THAN TESTS. Nineteen tests already pin the listing window,
 * and every one of them passed while SEVEN more copies of the defect were live:
 * the homepage By City counts, the community picks rail, the This week rails on
 * the city and community-by-city pages, and the 7d, month, tomorrow and weekend
 * presets on /events. A test proves the code it calls. Only a scanner can prove
 * the absence of a shape across a tree. All seven were found by this guard on
 * its first two runs.
 *
 * HOW MUCH WORK IT DID, PUBLISHED. Every line of output names a count. The
 * scope is DERIVED (a file joins it by querying published events), never
 * hardcoded, so a discovery file that disappears shrinks the number in the
 * output instead of silently shrinking the check, and a scope below the floor
 * is itself a failure. This is the answer to the family of defects this
 * repository keeps finding: the thing that reports the outcome must publish how
 * much work it actually did.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/**
 * The scope floor. On 16 August 2026 the derived discovery scope was 25 files.
 * A collapsed scope is the "guard scanned zero files and printed PASS" failure,
 * so a number well below today's and far above zero fails the build and asks to
 * be looked at rather than quietly checking nothing.
 */
const MIN_SCOPE_FILES = 15

/** The file whose whole job is to DEFINE the sanctioned rule, so it states it. */
const RULE_AUTHORS = new Set(['src/lib/events/listing-window.ts'])

/**
 * Reviewed allowances. Each is a deliberate, named decision, printed on every
 * run so the list cannot rot into something nobody reads. An entry that matches
 * nothing FAILS the build: an allowance for a line that no longer exists is a
 * false statement in a file people trust.
 */
const ALLOWANCES = [
  {
    file: 'src/app/api/cron/notify-just-announced/route.ts',
    rule: 1,
    reason:
      'Exclusion audit item 11. A just-announced PUSH deliberately does not fire for an event already running; that is different semantics from a discovery surface and it hides nothing from anybody browsing.',
  },
]

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
})(SRC)

const rel = (p) => relative(ROOT, p).split(sep).join('/')

/**
 * A file is in the DISCOVERY SCOPE when it asks the database for published
 * events. Derived, so a new discovery surface is covered the day it is written
 * and nobody has to remember to register it.
 */
const inScope = (src) =>
  /\.from\(\s*'events'\s*\)/.test(src) && /eq\(\s*'status'\s*,\s*'published'\s*\)/.test(src)

/** Does this expression mean "now"? */
const MEANS_NOW = /\bnow\b|nowIso|new Date\(\s*\)|Date\.now/i

/**
 * The argument list of a call whose `(` is at `open`, balanced.
 *
 * A fixed character window was tried first and was WRONG in both directions: it
 * read past the end of a short filter into an unrelated line mentioning
 * cover_image_url, and it would have truncated a long one. Balanced is the only
 * honest answer to "what did this call actually receive".
 */
function balancedArgs(src, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < src.length; i += 1) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

const lineAt = (src, index) => src.slice(0, index).split('\n').length

/** Is this line inside a comment? Cheap, and enough: the tree writes block
 *  comments with a leading asterisk on every line. */
const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)

const violations = []
const allowanceHits = new Map(ALLOWANCES.map((a) => [`${a.file}#${a.rule}`, 0]))

let scopeFiles = 0
let startDatePredicates = 0
let arrayFilters = 0
let coverFiltersInspected = 0
let jsLinesInspected = 0

function allowed(file, rule) {
  const key = `${file}#${rule}`
  if (!allowanceHits.has(key)) return false
  allowanceHits.set(key, allowanceHits.get(key) + 1)
  return true
}

for (const full of files) {
  const src = readFileSync(full, 'utf8')
  const name = rel(full)
  const lines = src.split('\n')
  const commentAt = (index) => isCommentLine(lines[lineAt(src, index) - 1] ?? '')

  // RULE 3 runs over the WHOLE tree, not just the discovery scope: a cover
  // filter is wrong wherever an event list is built.
  for (const m of src.matchAll(/\.filter\(/g)) {
    arrayFilters += 1
    const open = m.index + '.filter'.length
    if (commentAt(m.index)) continue
    const args = balancedArgs(src, open)
    if (!/hasRealCover\s*\(|cover_image_url/.test(args)) continue
    coverFiltersInspected += 1
    if (RULE_AUTHORS.has(name)) continue
    if (allowed(name, 3)) continue
    violations.push({
      rule: 3,
      file: name,
      line: lineAt(src, m.index),
      detail: 'a cover test inside .filter(). A cover may RANK an event and may never remove it.',
    })
  }

  if (!inScope(src)) continue
  scopeFiles += 1
  if (RULE_AUTHORS.has(name)) continue

  // RULE 1: an upcoming window expressed as a SQL lower bound at now.
  for (const m of src.matchAll(/\.(gte|gt)\(\s*'start_date'\s*,\s*([^)]*)\)/g)) {
    if (commentAt(m.index)) continue
    startDatePredicates += 1
    const argument = m[2].trim()
    if (!MEANS_NOW.test(argument)) continue
    if (allowed(name, 1)) continue
    violations.push({
      rule: 1,
      file: name,
      line: lineAt(src, m.index),
      detail:
        `.${m[1]}('start_date', ${argument}) removes an event the moment it STARTS.\n` +
        `            Use .or(listingWindowOrPredicate(now)) so it is listed until it has ENDED.`,
    })
  }

  // RULE 2: the same lower bound written in JavaScript.
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (isCommentLine(line)) continue

    if (line.includes('start_date')) {
      jsLinesInspected += 1
      // A PostgREST op is rule 1's business.
      if (!/\.(gte|gt|lte|lt)\(/.test(line) && /start_date[^\n]{0,80}(>=|>)/.test(line)) {
        const rightOfComparison = line.split(/>=|>/).slice(1).join('>')
        if (MEANS_NOW.test(rightOfComparison) && !allowed(name, 2)) {
          violations.push({
            rule: 2,
            file: name,
            line: i + 1,
            detail:
              'start_date compared against now in JavaScript, keeping only what has not started.\n' +
              '            A window that includes today starts at the START of today: see\n' +
              '            startOfLocalDayUtc in src/lib/events/listing-window.ts.',
          })
        }
      }
    }

    // A window literal whose lower bound is now: `{ from: nowIso, to: ... }`.
    if (/\bfrom:\s*(nowIso|now\.toISOString\(\))/.test(line) && !allowed(name, 2)) {
      jsLinesInspected += 1
      violations.push({
        rule: 2,
        file: name,
        line: i + 1,
        detail:
          'a date window whose lower bound is `now`. The preset called "next 7 days" hid an\n' +
          '            event that started this morning for exactly this reason. Start the window\n' +
          '            at startOfLocalDayUtc(now, PLATFORM_TIME_ZONE).',
      })
    }
  }
}

/**
 * RULE 4: the two paginated public fetchers. A post-query row filter is only
 * safe when the query fetched the whole bounded set rather than one database
 * page, so the guard pins that every .range() in the file is driven by the
 * in-memory-pagination decision, and that the decision is taken exactly as
 * often as the price filter is.
 */
const FETCHERS = 'src/lib/events/fetchers.ts'
let ranges = 0
let paginationDecisions = 0
let priceFilterDecisions = 0
{
  const src = readFileSync(join(ROOT, FETCHERS), 'utf8')
  const lines = src.split('\n')
  if (!/function paginatesInMemory\(/.test(src)) {
    violations.push({
      rule: 4,
      file: FETCHERS,
      line: 1,
      detail:
        'paginatesInMemory() is gone. It is the single decision that keeps a post-query\n' +
        '            filter off a database-paginated page. Restore it, do not inline it.',
    })
  }
  for (const m of src.matchAll(/\.range\(/g)) {
    if (isCommentLine(lines[lineAt(src, m.index) - 1] ?? '')) continue
    ranges += 1
    const args = balancedArgs(src, m.index + '.range'.length)
    if (/inMemoryPagination/.test(args)) continue
    violations.push({
      rule: 4,
      file: FETCHERS,
      line: lineAt(src, m.index),
      detail:
        '.range() that does not consult inMemoryPagination. A price filter running on\n' +
        '            one database page drops every match from row 25 onwards and reports the\n' +
        '            survivors of that page as the total.',
    })
  }
  paginationDecisions = [...src.matchAll(/const inMemoryPagination = paginatesInMemory\(/g)].length
  priceFilterDecisions = [...src.matchAll(/const priceFiltered = hasPriceFilter\(/g)].length
  if (paginationDecisions !== priceFilterDecisions || paginationDecisions !== ranges) {
    violations.push({
      rule: 4,
      file: FETCHERS,
      line: 1,
      detail:
        `${ranges} range() call(s), ${priceFilterDecisions} price decision(s), ` +
        `${paginationDecisions} pagination decision(s).\n` +
        '            All three must agree: one price decision and one pagination decision per\n' +
        '            paginated query, or one of those queries is filtering a database page.',
    })
  }
}

const stale = [...allowanceHits.entries()].filter(([, hits]) => hits === 0)

if (violations.length > 0 || stale.length > 0 || scopeFiles < MIN_SCOPE_FILES) {
  console.error('\n[no-display-time-exclusion] FAILED\n')
  for (const v of violations) {
    console.error(`  RULE ${v.rule}  ${v.file}:${v.line}`)
    console.error(`            ${v.detail}\n`)
  }
  for (const [key] of stale) {
    console.error(`  STALE ALLOWANCE  ${key} matches nothing any more. Delete it.\n`)
  }
  if (scopeFiles < MIN_SCOPE_FILES) {
    console.error(
      `  SCOPE COLLAPSED  ${scopeFiles} discovery file(s) found, floor is ${MIN_SCOPE_FILES}.\n` +
        '            A guard that scans nothing prints the same PASS as a guard that scans\n' +
        '            everything. Either the query shape changed or this guard has stopped\n' +
        '            seeing the platform.\n',
    )
  }
  console.error(
    '  Founder ruling 16 August 2026: published means visible.\n' +
      '  docs/roast/exclusion-audit-2026-08-16.md carries every exclusion and its verdict.\n',
  )
  process.exit(1)
}

console.log(
  `[no-display-time-exclusion] PASS - scanned ${files.length} source file(s); ` +
    `${scopeFiles} in the derived discovery scope.`,
)
console.log(
  `[no-display-time-exclusion] checked ${startDatePredicates} SQL start_date predicate(s), ` +
    `${jsLinesInspected} JavaScript line(s) naming start_date or a window lower bound, ` +
    `${arrayFilters} array filter(s) of which ${coverFiltersInspected} touch a cover, ` +
    `${ranges} paginated range() call(s).`,
)
console.log(
  `[no-display-time-exclusion] ${ALLOWANCES.length} reviewed allowance(s), all still matching:` +
    (ALLOWANCES.length === 0
      ? ' none'
      : '\n' +
        ALLOWANCES.map((a) => `[no-display-time-exclusion]   rule ${a.rule}  ${a.file}`).join('\n')),
)
