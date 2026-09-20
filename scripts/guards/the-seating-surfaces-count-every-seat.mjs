/**
 * GUARD: THE ORGANISER'S SEATING SCREENS READ EVERY SEAT, AND NO CEILING ON
 * THEM IS A NUMBER SOMEBODY TYPED.
 *
 * ---------------------------------------------------------------------------
 * WHY A FOURTH GUARD RATHER THAN A CLAUSE ON ONE OF THE THREE. It is not that
 * seating deserves its own file. It is that every existing guard in this family
 * asks ONE question, "is this read bounded", and on these screens that question
 * returned the wrong answer twice, because two of the three ceilings here WERE
 * bounds.
 *
 *   1,000   the documented PostgREST default, on the events-list sold tally,
 *           the unassigned-holder list, and the chart and section reads. This
 *           one every scanner can see.
 *   2,000   `.range(0, 1999)` in the launch kit. A bound. Bounded is what a
 *           scanner calls it, a census counts it as fixed, and it was the
 *           lowest ceiling on the platform.
 *   10,000  `for (let from = 0; from < 10000; from += PAGE)` in the seat
 *           manager's own hand-rolled pager. Also a bound, also invisible, and
 *           in a helper written specifically to defeat the 1,000-row cap.
 *
 * So this guard carries a clause the other three do not have and do not want:
 * A NUMERIC LITERAL MAY NOT BE A SEAT CEILING (clause 5). A venue is as big as
 * it is, and any number typed into this code is a guess about Australian rooms.
 *
 * ---------------------------------------------------------------------------
 * THE SCREENS, AND THE DECISION EACH IS READ FOR.
 *
 *   events/page.tsx              My Events. "{sold} / {capacity}" per row. For
 *                                reserved seating the sold figure came from a
 *                                tally of one row per sold seat, and the
 *                                thousand was shared across EVERY reserved
 *                                event at once, so two sold-out 800-seat shows
 *                                reported 1,000 between them.
 *   events/[id]/seats/page.tsx   Seat Management. The chart, and in
 *                                organiser-assigns mode the list of people who
 *                                have PAID and are waiting to be given a seat.
 *                                That list was unbounded, so past a thousand
 *                                holders the organiser could not seat them:
 *                                the only screen that can do it did not show
 *                                them.
 *   events/[id]/launch-kit       The promotion artefact. Prints "{n} seats"
 *                                and "{m} open right now", both derived from an
 *                                array capped at 2,000.
 *   venues/[id]/seat-maps        The chart list and its live-usage figure, the
 *                                one an organiser checks before editing a chart
 *                                that people already hold seats on. An
 *                                undercount there reads as "safe to edit".
 *   venues/[id]/seat-maps/actions.ts  the writes behind that screen.
 *
 * ---------------------------------------------------------------------------
 * SIX CLAUSES.
 *   1. every READ is bounded. Reads only: a chain beginning `insert`, `update`,
 *      `upsert` or `delete` is a write and clause 6 judges it instead.
 *   2. every ranged read carries an `.order(`, because paging a
 *      non-deterministic order is not paging.
 *   3. the paging order includes a UNIQUE column, so it is a TOTAL order. On a
 *      seat chart the natural order is row then seat number and neither is
 *      unique on its own, so a window boundary could land between two seats in
 *      the same row and return one of them twice and the other never.
 *   4. no read destructures `data` or `count` without `error`. The events list
 *      discarded the error on the seat tally, so a read that FAILED rendered as
 *      nought sold on every reserved-seating row.
 *   5. NO NUMERIC LITERAL CEILING. `.range(` may not take a number literal as
 *      its upper bound, and no loop in these files may compare a paging cursor
 *      against one. This is the clause the other three guards do not have and
 *      it is the reason this file exists.
 *   6. A WRITE THAT RETURNS A REPRESENTATION either asks for at most one row
 *      (`.single()` / `.maybeSingle()`) or has the count it got back compared
 *      with the count it sent. A successful insert of more rows than the
 *      ceiling returns fewer than it wrote, with no error, and paging is not
 *      the remedy because the rows are already in. Noticing is.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not judge `src/app/actions/
 * self-seat.ts` or `best-available.ts`, which are the checkout side of seating
 * and belong to the money lane under the three-lane protocol.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-seating-surfaces-count-every-seat]'

const SCREENS = [
  'src/app/(dashboard)/dashboard/events/page.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/seats/page.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx',
  'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/page.tsx',
  'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/actions.ts',
]

/** Columns that are UNIQUE on the tables these screens page. Short on purpose. */
const TOTAL_ORDER_COLUMNS = new Set(['id'])

/** A chain whose first method is one of these is a WRITE, judged by clause 6. */
const WRITE_VERBS = new Set(['insert', 'update', 'upsert', 'delete'])

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, ordered: 0, destructures: 0, writes: 0, rangeBounds: 0 }

for (const SCREEN of SCREENS) {
  const absolute = resolve(ROOT, SCREEN)
  if (!existsSync(absolute)) {
    failures.push(
      `${SCREEN} does not exist. Either a seating screen moved, in which case this guard now judges ` +
        'nothing for it and would report PASS, or it was deleted. Fix the path rather than the symptom.',
    )
    continue
  }

  const { withStrings: source } = readSource(absolute)
  const readsBefore = work.reads
  const heads = headOnlySelectLines(absolute)
  const chainsHere = selectChainsIn(absolute)

  for (const chain of chainsHere) {
    const verb = chain.methods[0]

    // ---------------------------------------------------------------- clause 6
    if (WRITE_VERBS.has(verb)) {
      if (!chain.methods.includes('select')) continue // no representation to shorten
      work.writes += 1
      if (chain.methods.includes('single') || chain.methods.includes('maybeSingle')) continue
      /*
       * The count it got back must be compared with the count it sent. Proven by
       * finding a length-against-length comparison anywhere in the file, which
       * is deliberately loose: this clause exists to make somebody WRITE the
       * check, and a guard that tried to prove the comparison binds this exact
       * insert would be parsing JavaScript badly and silently.
       */
      if (/\.length[^;\n]{0,40}(?:!==|===|!=|==)[^;\n]{0,40}\.length/.test(source)) continue
      failures.push(
        `${SCREEN}:${chain.line} writes ${chain.table} and reads the representation back with no ` +
          'single(), no maybeSingle() and no comparison of the returned length against the length ' +
          'sent. A write of more rows than the response ceiling SUCCEEDS and returns fewer rows than ' +
          'it wrote, with no error. Paging cannot help: the rows are already in. Compare the counts ' +
          'and refuse loudly.',
      )
      continue
    }

    if (!chain.methods.includes('select')) continue
    work.reads += 1

    // ---------------------------------------------------------------- clause 1
    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${SCREEN}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows in ` +
          'silence: HTTP 200, error null, a full-looking array. On these screens that is a chart ' +
          'missing its seats, a paid ticket holder who cannot be given one, or a sold count shared ' +
          'across every event in the list at once. Page it through readEveryRow.',
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue

    // ---------------------------------------------------------------- clause 2
    if (!chain.methods.includes('order')) {
      failures.push(
        `${SCREEN}:${chain.line} pages ${chain.table} with range() and no order(). Ranged paging ` +
          'over a non-deterministic order is not paging: Postgres may return one seat in two windows ' +
          'and another in none, so the chart gains a duplicate and loses a seat in the same read.',
      )
      continue
    }

    // ---------------------------------------------------------------- clause 3
    if (!chain.orderColumns.some(col => TOTAL_ORDER_COLUMNS.has(col))) {
      failures.push(
        `${SCREEN}:${chain.line} pages ${chain.table} ordered by ` +
          `${chain.orderColumns.join(', ') || 'nothing this scanner could read'}, and none of those ` +
          'is unique on that table, so the window boundaries are undefined. On a seat chart ' +
          'row_label and seat_number are the natural order and neither is unique: add id as the ' +
          'last key so the order is total.',
      )
      continue
    }
    work.ordered += 1
  }

  /*
   * A SCANNER THAT JUDGES NOTHING REPORTS PASS, which is the one thing this
   * guard must never do. The test is on CHAINS and not on reads, because
   * actions.ts legitimately holds eight writes and no read: a file parsed down
   * to eight write chains has plainly been read, and demanding a select there
   * would be a guard failing on the absence of something that should be absent.
   */
  if (chainsHere.length === 0) {
    failures.push(
      `no PostgREST chain was found in ${SCREEN} at all. Either the file stopped talking to the ` +
        'database, or the scanner can no longer read it, and the second one reports PASS.',
    )
  } else {
    notes.push(
      `${SCREEN}: ${chainsHere.length} chain(s), ${work.reads - readsBefore} read(s), all bounded`,
    )
  }

  // ------------------------------------------------------------------ clause 4
  /*
   * COMMENTS ARE ALREADY STRIPPED in `withStrings`, which matters here because
   * every one of these files QUOTES its own defective line in the header as the
   * thing being stopped, and a scanner that read comments would fail the build
   * on the explanation of the bug rather than on the bug.
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
        `${SCREEN}:${lineAt(source, match.index)} destructures ${rows ? 'data' : 'count'} and not ` +
          'error, so a read that FAILED is indistinguishable from an event that has sold nothing. On ' +
          'My Events that rendered "0 / 2000" to an organiser whose show is sold out.',
      )
    }
  }

  // ------------------------------------------------------------------ clause 5
  /*
   * A CEILING NOBODY MEASURED. Two shapes, both of which were in this code:
   *   .range(0, 1999)                       a literal upper bound
   *   for (let from = 0; from < 10000; ...) a literal loop bound over a cursor
   * The second is matched on the COMPARISON rather than on the word `for`, so a
   * `while` loop or a guard clause with the same effect is caught too.
   */
  for (const m of source.matchAll(/\.range\(\s*[^,()]*,\s*([^()]*?)\s*\)/g)) {
    work.rangeBounds += 1
    const upper = m[1].trim()
    if (!/^-?\d[\d_]*$/.test(upper)) continue
    failures.push(
      `${SCREEN}:${lineAt(source, m.index)} caps a read at the literal ${upper}. That is a guess ` +
        'about how big an Australian room is, written where nothing will ever revisit it, and it is ' +
        'the shape that put a 2,000-seat ceiling on the launch kit. Page to the end with ' +
        'readEveryRow, or take the count from the database.',
    )
  }
  for (const m of source.matchAll(/\b(?:from|offset|cursor|start)\b\s*<=?\s*(\d[\d_]*)/gi)) {
    failures.push(
      `${SCREEN}:${lineAt(source, m.index)} stops paging when the cursor reaches the literal ` +
        `${m[1]}. That is the hand-rolled pager that silently lost every seat past ten thousand, in ` +
        'a helper written to defeat the 1,000-row cap. readEveryRow stops on an empty page and ' +
        'raises rather than truncating.',
    )
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-seating-surfaces-count-every-seat', {
  did: {
    'seating screen judged': SCREENS.length,
    'read judged': work.reads,
    'read paged on a total order': work.ordered,
    'write returning a representation judged': work.writes,
    'await destructure judged': work.destructures + work.reads,
    'range upper bound read': work.rangeBounds,
  },
  found: { 'read that could come back short, or a cap nobody measured': failures.length },
})

if (failures.length > 0) process.exit(1)
