/**
 * GUARD: THE ORGANISER'S OWN AUDIENCE IS HANDED BACK WHOLE, IN AN ORDER THAT
 * CANNOT DOUBLE-COUNT, AND AN OUTAGE SAYS SO RATHER THAN EXPORTING NOBODY.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROTECTS, AND WHY IT IS THE WEDGE RATHER THAN A SCREEN.
 *
 * The growth plan's second blade is data ownership: "you own every attendee
 * relationship: no walled gardens, no withheld emails". DICE withholds attendee
 * emails and Eventbrite limits them, and the whole switching argument is that
 * EventLinqs does not. The surfaces in this guard's scope ARE that promise:
 *
 *   attendees/page.tsx          who is coming, and who may lawfully be emailed
 *   attendees/export/route.ts   the CSV and XLSX an organiser loads into their
 *                               own mailing list, and the PDF door list a
 *                               person stands at a door holding
 *   orders/page.tsx             the money this event has taken
 *   orders/export/route.ts      the financial report
 *   src/lib/reporting/          the reads all four of them are built on
 *
 * A promise that quietly hands back the first thousand rows is not a smaller
 * version of that promise. It is the same withholding, with nobody to blame.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, measured. Supabase caps a response at 1,000 rows in silence:
 * "By default, Supabase projects return a maximum of 1,000 rows ... You can use
 * range() queries to paginate through your data"
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * HTTP 200, `error` null, a full-looking array.
 *
 * Every read behind these surfaces was unbounded, and each was wrong in a
 * different direction:
 *
 *   tickets            oldest-first, so the ceiling dropped the LATEST buyers.
 *                      They are missing from the door list, holding a valid
 *                      ticket, and they are the ones who bought most recently.
 *   marketing consents one row per attendee per organiser, so truncation DROPS
 *                      people, and a dropped person reads as not consented.
 *                      The organiser is shown their own lawfully consented
 *                      audience as smaller than it is.
 *   orders             newest-first, so the OLDEST sales fell off the financial
 *                      report and every fee and revenue column totalled short.
 *   orders (screen)    the same, and `remaining = capacity - ticketsSold` then
 *                      reads too HIGH: inventory that is already sold.
 *   refunds            subtracted from revenue, so truncating them left NET
 *                      revenue too high.
 *   ticket_scans       no `order by` at all, and the loop kept the first row it
 *                      met, so which admission won a double-scan was undefined
 *                      and could change between two loads of the same page.
 *
 * ---------------------------------------------------------------------------
 * FIVE CLAUSES.
 *   1. every select in scope is bounded.
 *   2. every ranged read carries an `.order(`.
 *   3. the paging order is a UNIQUE column, because the obvious fix is the
 *      wrong one: these surfaces want a reading order, so
 *      `.order('created_at').range(...)` looks right and is not. `created_at`
 *      is not unique on tickets, orders, refunds or ticket_scans, so windows
 *      overlap and a row can be counted twice. Page on the key, sort after.
 *   4. every `.in(` is fed a chunk, because an `in` list is bounded by BYTES.
 *   5. no read destructures `data` or `count` without `error`.
 *
 * ---------------------------------------------------------------------------
 * WHY A FOURTH ROW-CEILING GUARD RATHER THAN A WIDER ONE.
 *
 * `no-silent-row-ceiling` judges the consent, marketing, matching and
 * attribution path and nothing here is in it. `the-organiser-dashboard-reads-
 * every-row` judges two named FILES, the organiser's home and their per-event
 * overview, and this is a different question about different surfaces. Adding
 * either scope to the other would pull in directories that are red today
 * (seat maps, discounts, the marketplace), and a guard that cannot go green is
 * a guard somebody switches off. Those remain enumerated in REVIEW-QUEUE-B.md.
 *
 * THIS ONE SCANS DIRECTORIES, NOT A FILE LIST, on purpose: the export routes
 * are the surfaces most likely to gain a sibling, and a new file in one of
 * these directories should be judged the day it lands rather than the day
 * somebody remembers to add it here.
 *
 * WHAT IT CANNOT SEE, stated rather than implied. It judges the SOURCE of a
 * read, never the size of a table, so a `.limit(200)` on a set that grows past
 * 200 is a bound it accepts and a truncation a reader has to notice. It also
 * cannot see that the JS sort after a paged read restores the right order; that
 * is what tests/unit/reporting/attendee-ordering.test.ts is for.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-attendee-list-is-every-attendee]'

/**
 * Each directory is checked to exist. A scope that has been renamed away would
 * otherwise scan nothing and report PASS, which is how a scanner lies.
 */
const SCOPE = [
  'src/lib/reporting',
  'src/app/(dashboard)/dashboard/events/[id]/attendees',
  'src/app/(dashboard)/dashboard/events/[id]/orders',
]

/**
 * Columns that are UNIQUE on the tables in scope, verified against the
 * migrations rather than assumed: tickets.ticket_code (20260517000001 line 51)
 * and orders.order_number (baseline line 594) both carry UNIQUE, and `id` is
 * the primary key everywhere. Deliberately a short allowlist rather than a
 * check for "not created_at": a future `.order('scanned_at')` would be just as
 * wrong and just as invisible.
 */
const TOTAL_ORDER_COLUMNS = new Set(['id', 'ticket_code', 'order_number'])

/**
 * `in` filters whose values are a small fixed set that cannot grow into a URL,
 * allowed by name. A SCREAMING_CASE identifier is a module constant, which is
 * the shape a fixed status filter takes.
 */
const ALLOWED_IN_VALUES = [/^[A-Z][A-Z0-9_]*$/]

const failures = []
const notes = []
const work = { files: 0, reads: 0, bounded: 0, paged: 0, inFilters: 0, destructures: 0 }

for (const dir of SCOPE) {
  if (!existsSync(resolve(ROOT, dir))) {
    failures.push(
      `the scope names ${dir} and it does not exist. Either a surface moved, in which case this ` +
        'guard now judges nothing for it and would report PASS, or it was deleted. Fix the list ' +
        'rather than the symptom.',
    )
  }
}

const files = SCOPE.flatMap(dir =>
  existsSync(resolve(ROOT, dir)) ? sourceFiles(ROOT, { subdir: dir }) : [],
).filter(f => /\.tsx?$/.test(f))

if (files.length === 0) {
  failures.push(
    'the scope matched no TypeScript file at all. A scanner that judges nothing reports PASS, ' +
      'which is the one thing this guard must never do.',
  )
}

for (const file of files) {
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  work.files += 1

  const { withStrings: source } = readSource(absolute)
  const heads = headOnlySelectLines(absolute)

  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    // --------------------------------------------------------------- clause 1
    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${file}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows and ` +
          'says nothing, so this is an organiser being handed part of their own audience and told it ' +
          'is all of it. Page it through readEveryRow (src/lib/supabase/read-every-row.ts) or state ' +
          `a .limit() where a reader can see it. Chain: .${chain.methods.join('.')}`,
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue

    // --------------------------------------------------------------- clause 2
    if (!chain.methods.includes('order')) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged paging ` +
          'over a non-deterministic order is not paging: Postgres may return one row in two windows ' +
          'and another in none, so the export is short and double-counted at the same time.',
      )
      continue
    }

    /*
     * --------------------------------------------------------------- clause 3
     * READ FROM `orderColumns`, NEVER FROM `chain.text`. `text` is truncated to
     * 220 characters for legibility and the attendee select alone is about 200,
     * so a regex over `text` cannot see the `.order(` of any real chain here
     * and would report PASS on a tree carrying the exact defect. The scanner
     * exposes the columns as data for this reason; see its header.
     */
    const offending = chain.orderColumns.filter(col => !TOTAL_ORDER_COLUMNS.has(col))
    if (offending.length > 0) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} ordered by \`${offending.join(', ')}\`, which is ` +
          'not unique on that table, so the window boundaries are undefined: an attendee can appear ' +
          'in two pages and another in none. This is the obvious fix and it is the wrong one. Page ' +
          'on the primary key and sort for reading afterwards, as src/lib/reporting/ordering.ts does.',
      )
      continue
    }
    work.paged += 1
  }

  // ------------------------------------------------------------------ clause 4
  /*
   * EVERY `.in(` IS FED A CHUNK. Read from the FILE rather than from
   * `chain.text`, which is truncated: an `.in(` past character 220 of a chain
   * is invisible to a scanner reading the display string, and every chain in
   * this scope is longer than that.
   */
  for (const call of source.matchAll(/\.in\(\s*(['"])[A-Za-z0-9_]+\1\s*,\s*([^)]*)\)/g)) {
    work.inFilters += 1
    const values = call[2].trim()
    if (/\bchunk\b/.test(values)) continue
    if (ALLOWED_IN_VALUES.some(re => re.test(values))) continue
    failures.push(
      `${file}:${lineAt(source, call.index)} spells an \`in\` filter from \`${values.slice(0, 48)}\` ` +
        'rather than from a chunk. An `in` list is bounded by BYTES, not by how many things are in ' +
        'it: Supabase bounds URL and headers together at 16 KB and names lengthy `in` clauses as the ' +
        'usual cause, so about 400 uuids is the break. Past the row ceiling it truncates as well, ' +
        'and a row missing from the lookup does not read as missing, it reads as a fact: a buyer ' +
        'with no profile renders as a blank name and a blank email, and a scan with no admission ' +
        'renders as though nothing beat it. Wrap it in ' +
        '`for (const chunk of chunkInFilterValues(ids))`.',
    )
  }

  // ------------------------------------------------------------------ clause 5
  /*
   * COMMENTS STRIPPED FIRST, because these files QUOTE the defective line in
   * their own headers as the thing being stopped, and a scanner that read
   * comments would fail the build on the explanation of the bug rather than on
   * the bug.
   */
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b/g)) {
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      const names = group[1]
      const rows = /\bdata\b/.test(names)
      const counts = /\bcount\b/.test(names)
      if (!rows && !counts) continue
      work.destructures += 1
      if (/\berror\b/.test(names)) continue
      failures.push(
        `${file}:${lineAt(source, match.index)} destructures \`${rows ? 'data' : 'count'}\` and not ` +
          '`error`, so a read that FAILED is indistinguishable from an event nobody has bought a ' +
          'ticket to. The door list then prints empty, the export downloads nobody, and both are ' +
          'presented to the organiser as the complete and correct answer.',
      )
    }
  }
}

// ---------------------------------------------------------------------------
notes.push(
  `${work.files} file(s) across ${SCOPE.length} scope director(ies), ${work.reads} read(s) judged`,
)
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-attendee-list-is-every-attendee', {
  did: {
    'attendee and orders file judged': work.files,
    'read judged': work.reads,
    'read paged on a unique column': work.paged,
    'in filter judged': work.inFilters,
    'await destructure judged': work.destructures + work.reads,
  },
  found: {
    'attendee, consent or money figure that could be short or silently empty': failures.length,
  },
})

if (failures.length > 0) process.exit(1)

console.log(
  TAG +
    ' OK - the organiser is handed every attendee, every consent and every order, in an order ' +
    'that cannot double-count, and an outage fails the surface rather than exporting nobody.',
)
