/**
 * GUARD: THE ONE SCREEN THAT PROVES THE PLATFORM'S OWN WEDGE COUNTS EVERY ROW,
 * SPELLS ITS `in` LISTS IN CHUNKS, AND RECONCILES AGAINST A TOTAL IT DID NOT
 * COUNT ITSELF.
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN. `/dashboard/events/[id]/reach`, fed by `fetchReachSummary` and
 * `fetchSalesAttribution`, with `fetchReachSummary` also rendered on the launch
 * kit. It is where an organiser is told what EventLinqs brought them, which is
 * one of the two edges the whole growth doctrine turns on. Every number on it
 * being smaller than the truth is an argument for leaving the platform, and
 * that is the direction all three defects below pushed it.
 *
 * ---------------------------------------------------------------------------
 * DEFECT ONE: EIGHT UNBOUNDED READS. Every read in both modules was a bare
 * `.select()`. Supabase caps a response at 1,000 rows and the cap is invisible,
 * HTTP 200, `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19;
 * measured on this project as `Content-Range: 0-999/14364`).
 *
 * `share_link_events` takes ONE ROW PER VIEW AND ONE PER CLICK, so it is the
 * fastest growing table on the platform that a screen reads directly, and
 * `share_links` grows one row per ATTENDEE SHARE (AQ2, "the attendee is the
 * channel"). The rows dropped past the ceiling include `conversion` rows, which
 * are attributed SALES, so the panel told an organiser their own sharing sold
 * fewer tickets than it did.
 *
 * DEFECT TWO: `in` LISTS BOUNDED BY COUNT AND NOT BY BYTES. The link ids are
 * spelled into the URL and Supabase bounds URL and headers together at 16 KB,
 * naming lengthy `in` clauses as the usual cause
 * (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
 * fetched 2026-09-19). A UUID is about 40 bytes encoded, so roughly 400 share
 * links is the break. Four hundred attendee shares on one event is a good night.
 *
 * DEFECT THREE, AND IT IS THE ONE A GUARD IS REALLY FOR: THE CHECK THAT WAS
 * SUPPOSED TO CATCH THE FIRST TWO COULD NOT FAIL. `fetchSalesAttribution` ends
 * with a reconciliation whose result decides whether the panel shows a
 * percentage at all, under a comment reading "REFUSE RATHER THAN GUESS ...
 * Showing one anyway is how a wrong number ends up in a pitch deck". It read:
 *
 *     discrepancy = { orders: totals.orders - bucketOrders, ... }
 *
 * `totals.orders` is incremented once per iteration of the bucket loop, and
 * each iteration also increments exactly one bucket. Both sides were the same
 * number counted twice, for every possible input, so `reconciles` was a
 * constant `true`. Its own test file's header claimed "`reconciles` goes FALSE
 * the moment it does not" above seven assertions that it is true and none that
 * it is ever false, because none could be written.
 *
 * It now compares against `count: 'exact', head: true`, which Postgres computes
 * over the table and which no row ceiling applies to. That asymmetry is the
 * entire mechanism, and clause 6 exists so that a later tidy-up cannot quietly
 * wire it back to a number this module counted itself.
 *
 * ---------------------------------------------------------------------------
 * WHY A SEPARATE GUARD RATHER THAN A WIDER SCOPE, stated so the next person
 * does not "simplify" it. `no-silent-row-ceiling` judges nine directories and
 * `src/lib/broadcast` is not one of them. Adding it would go red today on
 * `artists.ts` (10 reads) and `digest.ts` (5, and the digest is another lane's
 * territory), and a guard that cannot go green is a guard somebody switches
 * off. Those reads are real and are enumerated in REVIEW-QUEUE-B.md rather than
 * hidden. This list grows one screen at a time, as each is fixed.
 *
 * It is also NOT added to `the-founder-screens-read-every-row`, whose own
 * header records being renamed for exactly this reason: these are the
 * ORGANISER'S screens, not the founder's, and a guard whose name is narrower
 * than its scope is a guard somebody adds the wrong file to.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-reach-panel-counts-every-row]'

/**
 * The modules behind the reach panel, each with the decision it is read for.
 *
 *   reach.ts             views, clicks, conversions and tickets per channel.
 *                        The organiser's answer to "did sharing work".
 *   sales-attribution.ts the denominator and the three buckets, and the
 *                        reconciliation that decides whether a percentage is
 *                        shown at all.
 */
const MODULES = ['src/lib/broadcast/reach.ts', 'src/lib/broadcast/sales-attribution.ts']

/** The module whose reconciliation clause 6 judges, and the names it turns on. */
const RECONCILER = 'src/lib/broadcast/sales-attribution.ts'

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, ordered: 0, inFilters: 0, destructures: 0, reconcilers: 0 }

for (const MODULE of MODULES) {
  const absolute = resolve(ROOT, MODULE)
  if (!existsSync(absolute)) {
    failures.push(
      `${MODULE} does not exist. Either the reach panel moved, in which case this guard now judges ` +
        'nothing for it and would report PASS, or it was deleted. Fix the path rather than the symptom.',
    )
    continue
  }

  const { withStrings: source } = readSource(absolute)

  // ------------------------------------------------------------- clauses 1, 2
  const readsBefore = work.reads
  const heads = headOnlySelectLines(absolute)
  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${MODULE}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'silently (HTTP 200, no error, a full-looking array), and on this screen every number then ' +
          'reads SMALLER than the truth: dropped `conversion` rows are attributed SALES, so the panel ' +
          'tells an organiser their own sharing sold fewer tickets than it did. Page it through ' +
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
          `${MODULE}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged paging ` +
            'over a non-deterministic order is not paging: Postgres may return one row in two windows ' +
            'and another in none, so the reach total is wrong in both directions at once.',
        )
      }
    }
  }

  if (work.reads === readsBefore) {
    failures.push(
      `no select was found in ${MODULE} at all. A scanner that judges nothing reports PASS, which is ` +
        'the one thing this guard must never do.',
    )
  }

  // ---------------------------------------------------------------- clause 3
  /*
   * COMMENTS STRIPPED FIRST, because this file and both modules QUOTE the
   * defective line in their headers as the thing being stopped, and a scanner
   * that read comments would fail the build on the explanation of the bug
   * rather than on the bug.
   */
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b/g)) {
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      const names = group[1]
      if (!/\bdata\b/.test(names) && !/\bcount\b/.test(names)) continue
      work.destructures += 1
      if (/\berror\b/.test(names)) continue
      failures.push(
        `${MODULE}:${lineAt(source, match.index)} destructures the result without \`error\`, so a ` +
          'read that FAILED is indistinguishable from an event nobody shared. On this panel that ' +
          'renders zero views, zero clicks and zero attributed sales under a heading that calls them ' +
          'measured facts. Use readEveryRow or countOrRaise, both of which raise.',
      )
    }
  }

  // ---------------------------------------------------------------- clause 4
  /*
   * EVERY `.in(` IS FED A CHUNK. `chunkInFilterValues` is the only thing in the
   * tree that bounds an `in` list by BYTES, and the byte bound is the real one:
   * the count bound that preceded it let a hundred legal email addresses build
   * a 25 KB URL, and GA2's first driven run found zero matches out of five
   * hundred consented people because of it.
   *
   * The literal `in` filters PostgREST needs for a small fixed set are allowed
   * by name, because `SOLD_STATUSES` is three strings and cannot grow into a
   * URL problem. Anything else must name a chunk.
   */
  const ALLOWED_IN_VALUES = [/^SOLD_STATUSES\b/]
  for (const chain of selectChainsIn(absolute)) {
    for (const call of chain.text.matchAll(/\.in\(\s*(['"])[A-Za-z0-9_]+\1\s*,\s*([^)]*)\)/g)) {
      work.inFilters += 1
      const values = call[2].trim()
      if (/\bchunk\b/.test(values)) continue
      if (ALLOWED_IN_VALUES.some(re => re.test(values))) continue
      failures.push(
        `${MODULE}:${chain.line} spells an \`in\` filter from \`${values.slice(0, 48)}\` rather than ` +
          'from a chunk. An `in` list is bounded by BYTES, not by how many things are in it: Supabase ' +
          'bounds URL and headers together at 16 KB and names lengthy `in` clauses as the usual cause, ' +
          'so about 400 uuids is the break. Wrap it in `for (const chunk of chunkInFilterValues(ids))`.',
      )
    }
  }
}

// ------------------------------------------------------------------ clause 5
/*
 * THE RECONCILIATION IS NOT ALLOWED TO GRADE ITS OWN HOMEWORK.
 *
 * Both halves are needed and neither alone is enough. Requiring a `countOrRaise`
 * somewhere in the file does not stop `discrepancy` being rewired to `totals.`
 * beside it; forbidding `totals.` does not stop the expected side being some
 * other number this module counted itself. So the object literal is read, and
 * it must reference a name that was assigned from `countOrRaise(`.
 */
const reconcilerPath = resolve(ROOT, RECONCILER)
if (existsSync(reconcilerPath)) {
  const { withStrings: source } = readSource(reconcilerPath)

  const counted = new Set()
  for (const m of source.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:0\b|countOrRaise\()/g)) {
    // `let x = 0` only qualifies once something adds a countOrRaise into it.
    if (/countOrRaise\($/.test(m[0]) || new RegExp(`${m[1]}\\s*\\+=\\s*countOrRaise\\(`).test(source)) {
      counted.add(m[1])
    }
  }

  const literal = source.match(/const\s+discrepancy\s*=\s*\{([\s\S]*?)\}/)
  if (!literal) {
    failures.push(
      `${RECONCILE_LABEL()} has no \`const discrepancy = { ... }\` for this guard to judge. It is the ` +
        'expression that decides whether the panel shows a percentage at all, so if it has been ' +
        'renamed, rename it here too rather than leaving the clause scanning nothing.',
    )
  } else {
    work.reconcilers += 1
    const body = literal[1]
    const line = lineAt(source, literal.index)

    if (/\btotals\./.test(body)) {
      failures.push(
        `${RECONCILE_LABEL()}:${line} computes \`discrepancy\` from \`totals.\`, which this module ` +
          'accumulates in the same loop that fills the buckets. Both sides are then the same number ' +
          'counted twice and `reconciles` is a constant `true`, which is exactly the defect of ' +
          '20 September 2026: the panel showed a share-of-sales percentage with no check over it at ' +
          'all. Compare against a server-side count.',
      )
    }

    const referenced = [...body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(m => m[1])
    if (!referenced.some(name => counted.has(name))) {
      failures.push(
        `${RECONCILE_LABEL()}:${line} computes \`discrepancy\` without any value that came from ` +
          '`countOrRaise(`. A reconciliation is only worth the word if the expected side is measured ' +
          'INDEPENDENTLY of the rows being checked; `count: \'exact\', head: true` is computed by ' +
          'Postgres and no row ceiling applies to it, which is the only reason it can notice a short ' +
          'read. Names seen as counted: ' +
          (counted.size > 0 ? [...counted].join(', ') : 'NONE'),
      )
    }
  }
}

function RECONCILE_LABEL() {
  return RECONCILER
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-reach-panel-counts-every-row', {
  did: {
    'reach module judged': MODULES.length,
    'read judged': work.reads,
    'read paged with an order': work.ordered,
    'in filter judged': work.inFilters,
    'await destructure judged': work.destructures + work.reads,
    'reconciliation judged': work.reconcilers,
  },
  found: { 'figure that could be short or silently unreconciled': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(
  TAG + ' OK - the reach panel reads every row, chunks every in list, and reconciles against a ' +
    'total it did not count itself.',
)
