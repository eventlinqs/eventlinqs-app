/**
 * GUARD: THE SCREENS THE FOUNDER MAKES DECISIONS FROM READ EVERY ROW, OR SAY
 * THEY COULD NOT.
 *
 * RENAMED FROM `the-money-screens-read-every-row` ON 20 SEPTEMBER 2026, because
 * the fourth screen added to it is not a money screen. It is the demand signal:
 * per-city waitlist demand, founding spots remaining, and the list of people the
 * founder is about to email. The mechanism was always the same and only the
 * first two subjects were about money, so the name was describing the sample
 * rather than the rule. A guard whose name is narrower than its scope is a guard
 * somebody adds the wrong file to.
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
 * WHY IT IS SCOPED TO A NAMED LIST AND SAYS SO. `no-silent-row-ceiling` judges
 * nine directories and none of these files is in one of them. Widening that
 * guard to all of `src/lib/admin` would go red on roughly twenty reads today
 * across payouts, orders, organisers and marketplace, and a guard that cannot
 * go green is a guard somebody switches off. Those reads are real and are
 * enumerated by file and line in REVIEW-QUEUE-B.md rather than hidden. This
 * list grows one screen at a time, as each is fixed, and every entry below
 * names the decision the founder makes from it.
 *
 * FIVE CLAUSES.
 *   1. every select in the file is bounded.
 *   2. every ranged read carries an `.order(`, because paging a non-deterministic
 *      order is not paging.
 *   3. no read destructures `data` without `error`.
 *   4. no read destructures `count` without `error` either. Added 20 September
 *      2026 with the demand-signal screen, where five figures were rendered as
 *      `count ?? 0`. A count that FAILED and a count of zero are the same
 *      number on the screen and opposite facts about the platform: "0 events
 *      published, 0 posters downloaded, 45 of 50 founding spots free" is what
 *      an unreachable database looked like, on a page whose own header promises
 *      that all figures are live counts.
 *   5. no count is coalesced with `??` at all, through any name. Clause 4 alone
 *      is escapable by naming the result instead of destructuring it, and that
 *      is not hypothetical: it is what the first attempt at fixing the
 *      demand-signal screen produced.
 *
 * Run standalone:  node scripts/guards/the-founder-screens-read-every-row.mjs
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-founder-screens-read-every-row]'

/**
 * THE SCREENS, NAMED, EACH WITH THE DECISION IT IS READ FOR, so the guard
 * cannot quietly scan nothing and so a reader can tell why a file is on the
 * list. Each is checked to exist: a path that has been renamed away would
 * otherwise judge nothing and report PASS, which is how a scanner lies.
 *
 *   analytics.ts    the GMV dashboard. Summed two unbounded selects.
 *   pricing.ts      the fee screen. `readActiveOverrides` listed every live
 *                   per-organiser and per-event fee override from an unbounded
 *                   read of `pricing_rules`, a table that is APPEND-ONLY and
 *                   versioned and therefore grows for ever by design.
 *                   Truncation there is not an undercount, it is an ABSENCE:
 *                   the loop keeps the first row per target, so a target whose
 *                   rows fell past the ceiling vanished from the only screen
 *                   that lists what is overriding the platform default, while
 *                   still being charged.
 *   demand-signal.ts  the tipping-point aggregates. An unbounded, UNORDERED
 *                   read of `city_waitlist_signups` bucketed in memory, so past
 *                   the ceiling each city's demand would have been an arbitrary
 *                   subset that moved between page loads, plus four
 *                   `count ?? 0` figures that rendered an unreachable database
 *                   as a platform nobody is using.
 *   network/page.tsx  the screen those aggregates are rendered on, and the
 *                   waitlist-to-invite bridge under them. Its `founding_invites`
 *                   read is a SUPPRESSION list, so it is the one read here that
 *                   fails towards doing too much: truncated or failed, already
 *                   invited organisers reappear and are emailed a second
 *                   founding invitation.
 *   network/actions.ts  the founder's hand on that bridge and on a founding
 *                   fee-free window. Its discarded errors told him a person did
 *                   not exist, or minted a second invite code for somebody who
 *                   already held one.
 */
const SCREENS = [
  'src/lib/admin/analytics.ts',
  'src/lib/admin/pricing.ts',
  'src/lib/admin/demand-signal.ts',
  'src/app/admin/(authed)/network/page.tsx',
  'src/app/admin/(authed)/network/actions.ts',
]

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, ordered: 0, destructures: 0, counts: 0 }

for (const SCREEN of SCREENS) {
const absolute = resolve(ROOT, SCREEN)
if (!existsSync(absolute)) {
  failures.push(
    `${SCREEN} does not exist. Either a founder screen moved, in which case this guard now ` +
      'judges nothing for it and would report PASS, or it was deleted. Fix the path rather than the symptom.',
  )
} else {
  // ------------------------------------------------------------ clauses 1, 2
  const readsBefore = work.reads
  const boundedBefore = work.bounded
  const orderedBefore = work.ordered
  const destructuresBefore = work.destructures
  const heads = headOnlySelectLines(absolute)
  work.counts += heads.size
  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    const how = boundednessOf(chain, { headSelects: heads })
    if (!how) {
      failures.push(
        `${SCREEN}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'silently (HTTP 200, no error, a full-looking array), so past the ceiling this figure is ' +
          'wrong on a screen that cannot say so: a total that stops growing while the platform keeps ' +
          'selling, a live fee override that vanishes, a city whose demand is an arbitrary subset, or ' +
          'an already-invited organiser back on the list to be emailed again. Page it through ' +
          'readEveryRow, or state a bound in the chain where a reader can see it.',
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

  // ------------------------------------------------------------- clauses 3, 4
  /*
   * COMMENTS STRIPPED FIRST. This very file's header quotes the defective line
   * `const { data } = await db.from('orders')...` as the thing being stopped,
   * and a scanner that read comments would fail the build on the explanation of
   * the bug rather than on the bug.
   *
   * BOTH DESTRUCTURING SHAPES ARE JUDGED. `const { count } = await ...` is the
   * obvious one; `const [{ count: a }, { count: b }] = await Promise.all([...])`
   * is how the demand-signal counts were actually written, and a pattern that
   * only matched a leading brace would have walked straight past four of the
   * five figures on that screen while reporting PASS.
   */
  const { withStrings: source } = readSource(absolute)
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b/g)) {
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      const names = group[1]
      const rows = /\bdata\b/.test(names)
      const counts = /\bcount\b/.test(names)
      if (!rows && !counts) continue
      work.destructures += 1
      if (/\berror\b/.test(names)) continue
      const line = lineAt(source, match.index)
      failures.push(
        rows
          ? `${SCREEN}:${line} destructures \`data\` and not \`error\`, so a read that FAILED is ` +
              'indistinguishable from a read that found nothing. On the GMV screen that renders zero ' +
              'revenue; on the fee screen it renders a platform with no fee configured. Both are numbers ' +
              'a founder acts on, and neither can be told apart from an outage.'
          : `${SCREEN}:${line} destructures \`count\` and not \`error\`, and a count that failed is ` +
              'then rendered as `?? 0`. On the demand signal that is no waitlist demand in any city and ' +
              'all fifty founding spots free, which is what an unreachable database looks like when the ' +
              'page header promises that all figures are live counts.',
      )
    }
  }
  notes.push(`${SCREEN}: ${work.destructures - destructuresBefore} direct read destructure(s) judged for a discarded error`)

  /*
   * ---------------------------------------------------------------- clause 5
   * A COUNT IS NEVER COALESCED ON THESE SCREENS.
   *
   * Clause 4 catches the destructure that drops `error`, and clause 4 ALONE is
   * escapable by accident: rename the result instead of destructuring it, write
   * `res.count ?? 0`, and every figure on the screen is a lie again while the
   * guard reports PASS. That is not hypothetical, it is the shape the fix to
   * this very screen produced on the first attempt.
   *
   * So the rule is the one a reader can apply without knowing the mechanism: on
   * a screen a decision is made from, a count either raises or is a number.
   * `countOrRaise` (src/lib/supabase/count-or-raise.ts) is the one way to turn
   * the first into the second, and it distinguishes the three facts `?? 0`
   * collapses: nobody has done this yet, the database could not be reached, and
   * the count was never asked for.
   *
   * ALIASES ARE FOLLOWED, because `const { count: holders } = ...` then
   * `holders ?? 0` is the same defect with a different name on it, and it is
   * how the founding-window cap check was actually written.
   */
  const countNames = new Set(['count'])
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b/g)) {
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      for (const part of group[1].split(',')) {
        const alias = /^\s*count\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(part)
        if (alias) countNames.add(alias[1])
      }
    }
  }
  for (const name of countNames) {
    const coalesce = new RegExp(`(?:\\.|\\b)${name}\\s*\\?\\?`, 'g')
    for (const hit of source.matchAll(coalesce)) {
      failures.push(
        `${SCREEN}:${lineAt(source, hit.index)} coalesces the count \`${name}\` with \`??\`. A count ` +
          'that FAILED and a count of zero are the same number on the screen and opposite facts about ' +
          'the platform. Read it through countOrRaise(what, result) from src/lib/supabase/count-or-raise.ts, ' +
          'which raises for a failed read and for a count that was never asked for.',
      )
    }
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

declareWork('the-founder-screens-read-every-row', {
  did: {
    'founder screen judged': SCREENS.length,
    'read judged': work.reads,
    'read destructure judged': work.destructures + work.reads,
    'count read judged for a coalesce': work.counts,
  },
  found: { 'figure that could be short or silently zero': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(TAG + ' OK - every founder screen reads every row, in a stable order, and fails loudly.')
