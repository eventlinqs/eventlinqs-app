/**
 * GUARD: THE TWO SCREENS AN ORGANISER READS THEIR OWN BUSINESS OFF COUNT EVERY
 * ROW, IN A STABLE ORDER, AND FAIL LOUDLY.
 *
 * ---------------------------------------------------------------------------
 * THE SCREENS, AND THE DECISION EACH ONE IS READ FOR.
 *
 *   dashboard/page.tsx            the organiser's home. Tickets sold and
 *                                 revenue for the last 30 days, each shown
 *                                 beside a percentage change against the 30
 *                                 days before it, plus two sparklines and the
 *                                 recent-activity feed.
 *   dashboard/events/[id]/page.tsx  one event's overview. Gross revenue and
 *                                 tickets sold, summed from the order rows.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, AND ON THE HOME SCREEN IT POINTED THE FLATTERING WAY.
 *
 * Both read `orders` with no bound and with `error` discarded. Supabase caps a
 * response at 1,000 rows in silence: HTTP 200, `error` null, a full-looking
 * array (https://supabase.com/docs/reference/javascript/select, fetched
 * 2026-09-19; measured on this project as `Content-Range: 0-999/14364`).
 *
 * ON THE HOME SCREEN the read was ordered `created_at` DESCENDING over a
 * 60-day window, so the server kept the NEWEST thousand and dropped the OLDEST.
 * The oldest rows in that window are the PRIOR 30 days, which is the
 * denominator of both deltas:
 *
 *     ticketsDelta = pctChange(ticketsSold30, ticketsSoldPrior)
 *     revenueDelta = pctChange(revenueCents30, revenuePriorCents)
 *
 * So past a thousand orders in 60 days an organiser was not shown a figure that
 * was merely low. They were shown GROWTH THAT WAS TOO HIGH, because last month
 * had been trimmed by the ceiling while this month survived intact. `pctChange`
 * returns 100 when the previous period is zero, so a fully truncated prior
 * period renders as "+100%". That is the number an organiser repeats to a
 * promoter.
 *
 * ON THE EVENT OVERVIEW the read had NO `order by` at all, so a capped read
 * returns an ARBITRARY thousand rows. Gross revenue and tickets sold are sums
 * over whatever arrived, so both would have been wrong AND WOULD HAVE MOVED
 * BETWEEN PAGE LOADS for no reason the organiser could see.
 *
 * ---------------------------------------------------------------------------
 * WHY A THIRD GUARD RATHER THAN A WIDER ONE, stated so it is not "simplified".
 *
 * `no-silent-row-ceiling` judges nine directories and `src/app/(dashboard)` is
 * not one of them; adding it would go red on roughly thirty reads today across
 * seat maps, discounts, refunds and the marketplace, and a guard that cannot go
 * green is a guard somebody switches off. Those are enumerated in
 * REVIEW-QUEUE-B.md rather than hidden.
 *
 * It is not folded into `the-founder-screens-read-every-row`, which is the
 * FOUNDER'S screens, nor into `the-attribution-panels-count-every-row`, which
 * is tracked-link attribution and carries two clauses that are meaningless
 * here. Each of the three is named for exactly what it judges, which is the
 * rule both of the others record being renamed to obey.
 *
 * FOUR CLAUSES.
 *   1. every select in the file is bounded.
 *   2. every ranged read carries an `.order(`, because paging a
 *      non-deterministic order is not paging.
 *   3. no read destructures `data` or `count` without `error`.
 *   4. the paging order is a UNIQUE column. This clause is the one the other
 *      two guards do not have, and it exists because the obvious fix here is
 *      the wrong one: the home screen wants newest-first, so `.order(
 *      'created_at', { ascending: false }).range(...)` looks exactly right and
 *      is not. `created_at` is not unique, and ranged paging over a
 *      non-total order may return one row in two windows and another in none,
 *      which silently double-counts revenue. The read pages on the primary key
 *      and sorts for display afterwards.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-organiser-dashboard-reads-every-row]'

const SCREENS = [
  'src/app/(dashboard)/dashboard/page.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/page.tsx',
]

/**
 * Columns that are UNIQUE on the tables these screens page, so a ranged read
 * ordered by one of them is a total order. Deliberately a short allowlist
 * rather than a check for "not created_at": a future `.order('start_date')`
 * would be just as wrong and just as invisible.
 */
const TOTAL_ORDER_COLUMNS = new Set(['id'])

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, ordered: 0, destructures: 0 }

for (const SCREEN of SCREENS) {
  const absolute = resolve(ROOT, SCREEN)
  if (!existsSync(absolute)) {
    failures.push(
      `${SCREEN} does not exist. Either an organiser screen moved, in which case this guard now ` +
        'judges nothing for it and would report PASS, or it was deleted. Fix the path rather than ' +
        'the symptom.',
    )
    continue
  }

  const { withStrings: source } = readSource(absolute)
  const readsBefore = work.reads
  const heads = headOnlySelectLines(absolute)

  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${SCREEN}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'silently. On the home screen the read is newest-first over 60 days, so the ceiling eats ' +
          'the PRIOR 30 days, which is the denominator of both percentage changes: the organiser is ' +
          'shown growth that is too HIGH. On the event overview the sums simply move between page ' +
          'loads. Page it through readEveryRow, or state a bound where a reader can see it.',
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue

    if (!chain.methods.includes('order')) {
      failures.push(
        `${SCREEN}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged paging ` +
          'over a non-deterministic order is not paging: Postgres may return one row in two windows ' +
          'and another in none, so the revenue total is wrong in both directions at once.',
      )
      continue
    }

    /*
     * ---------------------------------------------------------------- clause 4
     * READ FROM `orderColumns`, NEVER FROM `chain.text`. `text` is truncated to
     * 220 characters for legibility, and this file's orders read is about 300,
     * so a regex over `text` could not see its `.order(` at all and reported
     * PASS on a tree where the drill had planted `created_at`. The scanner now
     * exposes the columns as data; see its header.
     */
    const offending = chain.orderColumns.filter(col => !TOTAL_ORDER_COLUMNS.has(col))
    if (offending.length > 0) {
      failures.push(
        `${SCREEN}:${chain.line} pages ${chain.table} ordered by \`${offending.join(', ')}\`, which ` +
          'is not unique on that table, so the window boundaries are undefined: a row can appear in ' +
          'two pages and another in none, which double-counts revenue. This is the obvious fix and ' +
          'it is the wrong one. Page on the primary key and sort for display afterwards, as ' +
          'dashboard/page.tsx does.',
      )
      continue
    }
    work.ordered += 1
  }

  if (work.reads === readsBefore) {
    failures.push(
      `no select was found in ${SCREEN} at all. A scanner that judges nothing reports PASS, which is ` +
        'the one thing this guard must never do.',
    )
  } else {
    notes.push(
      `${SCREEN}: ${work.bounded - readsBefore >= 0 ? work.reads - readsBefore : 0} read(s) judged, ` +
        'all bounded',
    )
  }

  // ------------------------------------------------------------------ clause 3
  /*
   * COMMENTS STRIPPED FIRST, because both screens QUOTE the defective line in
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
        `${SCREEN}:${lineAt(source, match.index)} destructures ` +
          `\`${rows ? 'data' : 'count'}\` and not \`error\`, so a read that FAILED is ` +
          'indistinguishable from an organiser who has sold nothing. This screen then renders zero ' +
          'revenue, zero tickets and an empty activity feed, under headings that present them as ' +
          'measured facts about their business.',
      )
    }
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-organiser-dashboard-reads-every-row', {
  did: {
    'organiser screen judged': SCREENS.length,
    'read judged': work.reads,
    'read paged on a unique column': work.ordered,
    'await destructure judged': work.destructures + work.reads,
  },
  found: { 'figure that could be short, unstable or silently zero': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(
  TAG + ' OK - the organiser reads their whole business, in an order that cannot double-count, ' +
    'and an outage says so rather than reporting a quiet zero.',
)
