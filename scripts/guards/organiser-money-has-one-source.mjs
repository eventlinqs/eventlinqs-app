/**
 * EVERY SCREEN THAT SHOWS AN ORGANISER THEIR TAKINGS MUST GET THE NUMBER FROM
 * THE SAME PLACE, AND MUST HAVE READ ALL OF IT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP. Measured against TEST on 20 September 2026.
 *
 * `RevenueSummary` was rendered for ONE event on two organiser screens.
 * /dashboard/events/[id]/orders paged every order, counted the three statuses
 * in which a sale occurred, and subtracted completed refunds.
 * /dashboard/events/[id]/edit rendered the same component from its own four
 * lines:
 *
 *     .from('orders')
 *     .select('total_cents, platform_fee_cents, processing_fee_cents, currency')
 *     .eq('event_id', id)
 *     .eq('status', 'confirmed')
 *
 * On TEST, event ea8a167d-95e2-42c6-a391-3ddf96c7d7cf holds one
 * partially_refunded order of 2,687 cents. The orders screen showed Gross
 * AUD 26.87 with the refund on its own line. The edit screen showed AUD 0.00.
 * Same event, same component, two answers, and nothing on either screen to say
 * which one the organiser should believe.
 *
 * The read was also unbounded and unordered, so past the project's row ceiling
 * ("By default, Supabase projects return a maximum of 1,000 rows",
 * https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19)
 * every figure was the sum of an arbitrary subset, and its error was discarded,
 * so a refused read rendered a sold-out event as having earned nothing.
 *
 * ---------------------------------------------------------------------------
 * WHY THREE RULES AND NOT ONE. Bounding the read would have left the two
 * screens disagreeing, and sharing the arithmetic would have left it summing a
 * truncated set. The defect needed all three to be true at once, so the guard
 * checks all three.
 *
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied. It judges the SOURCE
 * of a read, not the size of a table, and it cannot tell whether a shared
 * function is CALLED correctly. It can only tell that a screen reaches it
 * instead of writing the sum out again. Whether the two agree on real rows is
 * tests/unit/growth/the-two-revenue-cards-agree.test.ts, and whether the
 * ceiling is real at all is scripts/verify/lb-editrevenue-drive.mjs.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles, readSource } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')

/**
 * The organiser's own money surfaces, and the module that answers for them.
 * Every one is checked to exist: a scope that has been renamed away would
 * otherwise scan nothing and report PASS, which is how a scanner lies.
 */
const SCOPE = [
  'src/app/(dashboard)/dashboard/events/[id]/edit',
  'src/app/(dashboard)/dashboard/events/[id]/orders',
  'src/app/(dashboard)/dashboard/events/create',
  'src/lib/organisers',
]

/** The one home for an event's revenue arithmetic. */
const SOURCE_MODULE = 'src/lib/organisers/event-revenue.ts'

/** The pager every multi-row read in scope reaches. */
const PAGER = 'src/lib/supabase/read-every-row.ts'

/** The component whose every caller must reach SOURCE_MODULE. */
const CARD = 'RevenueSummary'

/**
 * The money columns of an order. Summing one of these outside SOURCE_MODULE is
 * a second implementation of the arithmetic, which is the defect above.
 */
const ORDER_MONEY_COLUMNS = ['total_cents', 'platform_fee_cents', 'processing_fee_cents']

const failures = []

for (const dir of SCOPE) {
  if (!existsSync(resolve(ROOT, dir))) {
    failures.push(
      `the scope names ${dir} and it does not exist; a scope that scans nothing reports PASS, so fix the list rather than the symptom`,
    )
  }
}

for (const required of [SOURCE_MODULE, PAGER]) {
  if (!existsSync(resolve(ROOT, required))) {
    failures.push(`${required} is missing, and every screen in scope depends on it`)
  }
}

const files = SCOPE.flatMap(dir =>
  existsSync(resolve(ROOT, dir)) ? sourceFiles(ROOT, { subdir: dir }) : [],
).filter(f => /\.tsx?$/.test(f))

// ─── RULE 1: no read in scope may be truncated in silence ───────────────────

let readsJudged = 0
let paged = 0
let singleRow = 0
let statedLimit = 0
let countOnly = 0

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
        `${file}:${chain.line} reads ${chain.table} with no bound, on a screen that shows an organiser their money. ` +
          `Supabase stops at 1,000 rows and says nothing. Page it through readEveryRow (${PAGER}) or state a .limit(). ` +
          `Chain: .${chain.methods.join('.')}`,
      )
      continue
    }

    if (how === 'single-row') singleRow += 1
    else if (how === 'head-only') countOnly += 1
    else if (how === 'limit') statedLimit += 1
    else if (how === 'range') {
      paged += 1
      if (!chain.methods.includes('order')) {
        failures.push(
          `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). ` +
            `Paging over an undefined order can return one row twice and skip another, ` +
            `so the total is wrong in a way no single page looks wrong.`,
        )
      }
    }
  }
}

// ─── RULE 2: the arithmetic has one home ────────────────────────────────────

let sumsChecked = 0

for (const file of files) {
  if (file.replace(/\\/g, '/') === SOURCE_MODULE) continue
  const abs = resolve(ROOT, file)
  if (!existsSync(abs)) continue
  const { raw, code } = readSource(abs)
  for (const column of ORDER_MONEY_COLUMNS) {
    sumsChecked += 1
    /*
     * A reduce whose body adds one of the order money columns. Judged on the
     * comment-blanked view, because both screens now carry a comment quoting
     * the query this guard was written for, and a guard that fires on the
     * explanation of a bug is a guard somebody deletes.
     */
    const re = new RegExp(String.raw`\.reduce\((?:[^;]{0,200}?)\+\s*(?:Number\()?[A-Za-z_$][\w$]*\.${column}`, 'g')
    let m
    while ((m = re.exec(code))) {
      const line = raw.slice(0, m.index).split('\n').length
      failures.push(
        `${file}:${line} sums ${column} itself. An event's revenue is computed in ${SOURCE_MODULE} and nowhere else: ` +
          `the edit screen and the orders screen each had their own version of this sum and they disagreed about every refund.`,
      )
    }
  }
}

// ─── RULE 3: every screen showing the card reaches the one source ───────────

/*
 * SWEPT ACROSS ALL OF src/, NOT ACROSS THE SCOPE. A THIRD screen rendering this
 * card is exactly how the platform would acquire a third answer, and it would
 * be added somewhere this guard's directory list does not name.
 */
const everySourceFile = sourceFiles(ROOT, { subdir: 'src' }).filter(f => /\.tsx?$/.test(f))
const cardCallers = []

for (const file of everySourceFile) {
  const abs = resolve(ROOT, file)
  if (!existsSync(abs)) continue
  /*
   * withStrings, NOT code. The `code` view blanks string literals, and the
   * thing being looked for here is the specifier of an import, which IS a
   * string literal. Judged on `code` this rule reported both correct screens as
   * failures on its first run. Comments are still blanked, so a file that only
   * MENTIONS the module in prose does not satisfy it.
   */
  const { withStrings } = readSource(abs)
  // The component's own definition is not a caller of itself.
  if (/\bexport function RevenueSummary\b/.test(withStrings)) continue
  if (!new RegExp(String.raw`<\s*${CARD}[\s/>]`).test(withStrings)) continue
  cardCallers.push(file)
  if (!/organisers\/event-revenue/.test(withStrings)) {
    failures.push(
      `${file} renders <${CARD}> without reaching ${SOURCE_MODULE}. ` +
        `Every screen that shows an organiser their takings computes them in one place, or the platform ` +
        `tells the same organiser two different numbers for the same event.`,
    )
  }
}

if (cardCallers.length === 0) {
  failures.push(
    `no file renders <${CARD}>, so this guard is judging nothing. Either the card was renamed, in which case ` +
      `CARD here is stale, or the organiser lost the surface that shows them their money.`,
  )
}

if (failures.length) {
  console.error('organiser-money-has-one-source: FAIL')
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('organiser-money-has-one-source', {
  did: {
    'organiser money directory swept': SCOPE.length,
    'file swept': files.length,
    'database read judged': readsJudged,
    'read paged with range': paged,
    'read bounded by a stated limit': statedLimit,
    'read bounded by single or maybeSingle': singleRow,
    'read that returns a count and no rows': countOnly,
    'file checked for a second copy of the arithmetic': sumsChecked,
    'screen rendering the revenue card': cardCallers.length,
  },
  found: { 'organiser money figure that could be wrong or disagree': failures.length },
  zeroIsFine: {
    'read bounded by a stated limit':
      'every multi-row read in this scope pages through readEveryRow instead, which is the stronger bound: ' +
      'a stated .limit() is a number a reader has to notice is too small, and a paged read has no such number. ' +
      'The count is reported so that a .limit() appearing here is visible rather than silent.',
    'read that returns a count and no rows':
      'only the waiting-list tiles count without reading rows; if this falls to zero a count has become a read.',
  },
})

if (failures.length) process.exit(1)

console.log(
  `organiser-money-has-one-source: PASS - ${readsJudged} read(s) across ${files.length} file(s) in ` +
    `${SCOPE.length} director(ies) are bounded (${paged} paged, ${statedLimit} by a stated limit, ` +
    `${singleRow} single-row, ${countOnly} count-only); ${cardCallers.length} screen(s) render <${CARD}> and ` +
    `every one of them reaches ${SOURCE_MODULE}.`,
)
