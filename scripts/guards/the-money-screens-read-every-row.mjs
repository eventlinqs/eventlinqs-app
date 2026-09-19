/**
 * GUARD: THE SCREENS THE FOUNDER READS THE MONEY OFF READ EVERY ROW, OR SAY THEY
 * COULD NOT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on TEST on 20 September 2026.
 *
 * `getAnalyticsDashboard` in src/lib/admin/analytics.ts summed two UNBOUNDED
 * selects, `orders` and `refunds`, in JavaScript. Supabase caps one response at
 * a fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * and the cap is invisible: HTTP 200, `error` null, a full-looking array.
 * Re-measured against this project the same day:
 *
 *     Content-Range: 0-999/14364
 *
 * TEST held 801 AUD orders, so the screen was 199 orders away from reporting a
 * GMV that stops growing while the platform keeps selling. There is nothing on
 * the page that could have said so.
 *
 * TWO THINGS MADE IT WORSE THAN A CAP.
 *
 *   NO `order by`. A capped read with no total order returns an ARBITRARY
 *   thousand rows, not the oldest or the newest thousand. Past the ceiling the
 *   figure would have moved between page loads for no reason a reader could see.
 *
 *   THE ERROR WAS DISCARDED. `const { data } = await db.from('orders')...`
 *   dropped `error`, and the next line was `?? []`. A read that FAILED rendered
 *   a GMV of ZERO. Zero revenue is a number a founder would act on, and on that
 *   screen it is indistinguishable from a payments outage.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD RATHER THAN THE TESTS ALONE. The tests pin the behaviour of the
 * function as it is written today. They cannot see a SIXTH read added to this
 * file next month with the same three habits, which is exactly how the first
 * two got here: nothing goes red, the page still renders, and the number is
 * just quietly wrong.
 *
 * WHY IT IS SCOPED TO ONE FILE AND SAYS SO. `no-silent-row-ceiling` judges nine
 * directories and this file is in none of them. Widening that guard to all of
 * `src/lib/admin` would go red on roughly twenty reads today across payouts,
 * orders, organisers and marketplace, and a guard that cannot go green is a
 * guard somebody switches off. Those reads are real and are raised in
 * REVIEW-QUEUE-B.md rather than hidden; this holds the money dashboard, which
 * is the one where a silently wrong total is acted on.
 *
 * THREE CLAUSES.
 *   1. every select in the file is bounded.
 *   2. every ranged read carries an `.order(`, because paging a non-deterministic
 *      order is not paging.
 *   3. no read destructures `data` without `error`.
 *
 * Run standalone:  node scripts/guards/the-gmv-screen-reads-every-row.mjs
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-money-screens-read-every-row]'

/**
 * THE MONEY SCREENS, NAMED, so the guard cannot quietly scan nothing. Each is
 * checked to exist: a path that has been renamed away would otherwise judge
 * nothing and report PASS, which is how a scanner lies.
 *
 *   analytics.ts  the GMV dashboard. Summed two unbounded selects.
 *   pricing.ts    the fee screen. `readActiveOverrides` listed every live
 *                 per-organiser and per-event fee override from an unbounded
 *                 read of `pricing_rules`, a table that is APPEND-ONLY and
 *                 versioned and therefore grows for ever by design. Truncation
 *                 there is not an undercount, it is an ABSENCE: the loop keeps
 *                 the first row per target, so a target whose rows fell past
 *                 the ceiling vanished from the only screen that lists what is
 *                 overriding the platform default, while still being charged.
 */
const SCREENS = ['src/lib/admin/analytics.ts', 'src/lib/admin/pricing.ts']

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, ordered: 0, destructures: 0 }

for (const SCREEN of SCREENS) {
const absolute = resolve(ROOT, SCREEN)
if (!existsSync(absolute)) {
  failures.push(
    `${SCREEN} does not exist. Either a money screen moved, in which case this guard now ` +
      'judges nothing for it and would report PASS, or it was deleted. Fix the path rather than the symptom.',
  )
} else {
  // ------------------------------------------------------------ clauses 1, 2
  const readsBefore = work.reads
  const boundedBefore = work.bounded
  const orderedBefore = work.ordered
  const destructuresBefore = work.destructures
  const heads = headOnlySelectLines(absolute)
  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    const how = boundednessOf(chain, { headSelects: heads })
    if (!how) {
      failures.push(
        `${SCREEN}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'silently (HTTP 200, no error), so the GMV on this screen would stop growing while the ' +
          'platform kept selling. Page it through readEveryRow, or state a bound in the source.',
      )
      continue
    }
    work.bounded += 1

    if (chain.methods.includes('range')) {
      if (chain.methods.includes('order')) {
        work.ordered += 1
      } else {
        failures.push(
          `${SCREEN}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged ` +
            'paging over a non-deterministic order is not paging: Postgres may return one row in ' +
            'two windows and another in none, so the total is wrong in both directions at once.',
        )
      }
    }
  }

  if (work.reads === readsBefore) {
    failures.push(
      `no select was found in ${SCREEN} at all. A scanner that judges nothing reports PASS, which ` +
        'is the one thing this guard must never do.',
    )
  } else {
    notes.push(
      `${SCREEN}: ${work.bounded - boundedBefore} of ${work.reads - readsBefore} read(s) bounded, ` +
        `${work.ordered - orderedBefore} of them paged with an order`,
    )
  }

  // ---------------------------------------------------------------- clause 3
  /*
   * COMMENTS STRIPPED FIRST. This very file's header quotes the defective line
   * `const { data } = await db.from('orders')...` as the thing being stopped,
   * and a scanner that read comments would fail the build on the explanation of
   * the bug rather than on the bug.
   */
  const { withStrings: source } = readSource(absolute)
  for (const match of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\b/g)) {
    const names = match[1]
    if (!/\bdata\b/.test(names)) continue
    work.destructures += 1
    if (/\berror\b/.test(names)) continue
    const line = lineAt(source, match.index)
    failures.push(
      `${SCREEN}:${line} destructures \`data\` and not \`error\`, so a read that FAILED is ` +
        'indistinguishable from a read that found nothing. On the GMV screen that renders zero ' +
        'revenue; on the fee screen it renders a platform with no fee configured. Both are numbers ' +
        'a founder acts on, and neither can be told apart from an outage.',
    )
  }
  notes.push(`${SCREEN}: ${work.destructures - destructuresBefore} direct read destructure(s) judged for a discarded error`)
}
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-money-screens-read-every-row', {
  did: {
    'money screen judged': SCREENS.length,
    'read judged': work.reads,
    'read destructure judged': work.destructures + work.reads,
  },
  found: { 'money total that could be short or silently zero': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(TAG + ' OK - every money screen reads every row, in a stable order, and fails loudly.')
