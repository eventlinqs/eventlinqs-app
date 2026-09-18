/**
 * NO READ IN THE MARKETING, CONSENT AND ATTRIBUTION PATH MAY BE TRUNCATED
 * WITHOUT ANYBODY BEING TOLD.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on TEST on 19 September 2026.
 *
 * A Supabase project returns at most a fixed number of rows per response, 1,000
 * by default: "By default, Supabase projects return a maximum of 1,000 rows ...
 * You can use range() queries to paginate through your data"
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 *
 * The truncation is SILENT. HTTP 200, `error` is null, and the array looks
 * complete. `consent_events` held 9,490 rows on TEST and an unbounded select
 * returned exactly 1,000 of them, with the true total visible only in a
 * Content-Range header nothing was reading.
 *
 * `src/lib/audience/read.ts` read that table unbounded, ordered OLDEST FIRST,
 * and kept the last answer per address, so the ceiling removed precisely the
 * newest events: the decisions. The admin audience screen was reporting
 *
 *                       screen      ledger
 *     people asked         997       9,364
 *     withdrawn              1          53
 *     declined               0         102
 *     opt-in rate         100%       98.9%
 *
 * and the drive that covers that screen could not see it, because the one
 * number it checked (`audience_members`) was under the ceiling.
 *
 * THE SAME SHAPE, ELSEWHERE IN THIS PATH, FAILS OPEN RATHER THAN SHORT:
 *
 *   the recipient filter    drop a withdrawal, keep the grant under it, and a
 *                           person who unsubscribed is mailed
 *   prior sends             a recipient missing from the "already sent" map is
 *                           sent to a second time
 *   spent clicks            a click missing from the "already spent" set is
 *                           billed against a second order
 *   ticket holders          a truncated holder list mails "come to this" to
 *                           people already holding a ticket
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS BOUNDED, and why `count: 'exact'` does not.
 *
 *   single / maybeSingle   one row asked for, one row returned
 *   head: true             no rows at all, only a count
 *   limit / range          the bound is IN THE SOURCE, where a reader can see
 *                          it and a reviewer can argue with it
 *
 * `count: 'exact'` reports the true total in a header while the body still
 * stops at the ceiling. It is the shape that looks careful and is not, so it
 * is not accepted as a bound.
 *
 * WHY A RANGED READ MUST ALSO CARRY AN ORDER. Paging over a non-deterministic
 * order is not paging: Postgres may hand back one row in two windows and no
 * window at all for another. The hand-rolled pager this guard replaced ordered
 * on `created_at` alone, which is not unique, so a tie across a page boundary
 * could duplicate or lose an order.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied. It judges the SOURCE
 * of a read, not the size of a table. A `.limit(200)` on a set that grows past
 * 200 is a bound this guard accepts and a truncation a reader has to notice.
 * That is a deliberate trade: the alternative is a guard that cannot be
 * satisfied, and a guard that cannot be satisfied gets switched off.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')

/**
 * The path a marketing message travels, from the consent that permits it to the
 * proof page that defends the fee it earned. Every one of these directories is
 * checked to exist: a scope that has been renamed away would otherwise scan
 * nothing and report PASS, which is how a scanner lies.
 */
const SCOPE = [
  'src/lib/consent',
  'src/lib/campaigner',
  'src/lib/audience',
  'src/lib/matching',
  'src/lib/attribution',
  'src/lib/proof',
  'src/lib/growth',
  'src/app/admin/(authed)/audience',
  'src/app/admin/(authed)/campaigns',
]

/** The one pager. A read in scope reaches it or states its own bound. */
const PAGER = 'src/lib/supabase/read-every-row.ts'

const failures = []

for (const dir of SCOPE) {
  if (!existsSync(resolve(ROOT, dir))) {
    failures.push(
      `the scope names ${dir} and it does not exist; a scope that scans nothing reports PASS, so fix the list rather than the symptom`,
    )
  }
}

/*
 * WALKED, NOT ASKED OF GIT. `git ls-files` would have been shorter and would
 * have made this guard need a repository on the build host, which is a
 * dependence `build-host-needs-declared` exists to surface and which this guard
 * has no reason to take on: every path it judges is a working-tree file under
 * src/, and `sourceFiles` is the shared git-free walk.
 */
const files = SCOPE.flatMap(dir =>
  existsSync(resolve(ROOT, dir)) ? sourceFiles(ROOT, { subdir: dir }) : [],
)
  .filter(f => /\.tsx?$/.test(f))

let readsJudged = 0
let bounded = { 'single-row': 0, 'head-only': 0, limit: 0, range: 0 }
let rangedReads = 0

for (const file of files) {
  const abs = resolve(ROOT, file)
  if (!existsSync(abs)) continue
  const heads = headOnlySelectLines(abs)
  for (const chain of selectChainsIn(abs)) {
    if (!chain.methods.includes('select')) continue
    readsJudged += 1

    const how = boundednessOf(chain, { headSelects: heads })
    if (!how) {
      failures.push(
        `${file}:${chain.line} reads ${chain.table} with no bound. ` +
          `Supabase stops at 1,000 rows and says nothing; page it through readEveryRow ` +
          `(${PAGER}) or state a .limit(). Chain: .${chain.methods.join('.')}`,
      )
      continue
    }
    bounded[how] += 1

    if (how === 'range') {
      rangedReads += 1
      if (!chain.methods.includes('order')) {
        failures.push(
          `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). ` +
            `Paging over an undefined order can return one row twice and skip another. ` +
            `Order on something unique, or on a column plus the id as a tie-break.`,
        )
      }
    }
  }
}

/*
 * THE PAGER'S OWN TWO MISTAKES, PINNED. Both were made before this file
 * existed, one of them in this repository (the hand-rolled loop in
 * src/lib/attribution/store.ts), and neither is visible in a passing test
 * unless the test fakes a server with a LOWER ceiling than the page size.
 */
const pagerPath = resolve(ROOT, PAGER)
if (!existsSync(pagerPath)) {
  failures.push(`${PAGER} is missing, and every read in scope depends on it`)
} else {
  const pager = readFileSync(pagerPath, 'utf8')
  if (!/from \+= batch\.length/.test(pager)) {
    failures.push(
      `${PAGER} no longer advances by the rows it received. Advancing by the page size skips rows on any project whose ceiling is lower than the page size, and reports the short read as the whole table.`,
    )
  }
  if (/batch\.length < pageSize/.test(pager)) {
    failures.push(
      `${PAGER} stops on a SHORT page. A project whose ceiling is below the page size makes every page short, so the loop stops after the first one. Stop on an EMPTY page.`,
    )
  }
  if (!/batch\.length === 0/.test(pager)) {
    failures.push(`${PAGER} no longer stops on an empty page, which is the only stop condition that is correct at any ceiling`)
  }
}

if (failures.length) {
  console.error('no-silent-row-ceiling: FAIL')
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('no-silent-row-ceiling', {
  did: {
    'directory in the marketing and consent path': SCOPE.length,
    'file swept': files.length,
    'database read judged': readsJudged,
    'read bounded by single or maybeSingle': bounded['single-row'],
    'read that returns a count and no rows': bounded['head-only'],
    'read bounded by a stated limit': bounded.limit,
    'read paged with range': bounded.range,
    'paged read checked for a stable order': rangedReads,
  },
  found: { 'read that could be truncated in silence': failures.length },
})

if (failures.length) process.exit(1)

console.log(
  `no-silent-row-ceiling: PASS - ${readsJudged} read(s) across ${files.length} file(s) in ${SCOPE.length} director(ies); ` +
    `${bounded.range} paged, ${bounded.limit} bounded by a stated limit, ${bounded['single-row']} single-row, ` +
    `${bounded['head-only']} count-only, and every paged read carries a stable order.`,
)
