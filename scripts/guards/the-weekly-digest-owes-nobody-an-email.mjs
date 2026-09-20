/**
 * THE WEEKLY CITY EMAIL MAY NOT SILENTLY DECIDE WHO IT WRITES TO, AND MAY NOT
 * SILENTLY STOP PART WAY THROUGH.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECTS THIS EXISTS TO STOP, all four found on 20 September 2026 in the
 * oldest send path on the platform: the one that writes to strangers.
 *
 * 1. THE SUPPRESSION READ FAILED OPEN. `fetchDigestRecipients` asked which of a
 *    city's waitlist addresses had withdrawn with ONE un-chunked
 *    `.in('email', waitlistEmails)`, and `const { data }` discarded the error.
 *    An `in` list is bounded by BYTES: Supabase bounds URL and headers together
 *    at 16 KB and names lengthy `in` clauses as the usual cause
 *    (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
 *    fetched 2026-09-19), and the break was measured on this project's own TEST
 *    instance, on this very table, between 15,038 and 16,083 joined bytes
 *    (src/lib/supabase/in-chunks.ts). A few hundred addresses in one city
 *    therefore produced a request that failed, `data` came back null,
 *    `suppressed` was `[]`, and rule 1 of `mergeDigestAudience`, "SUPPRESSION
 *    WINS", was not weakened, it was switched off. Everybody who had withdrawn
 *    was put back into the send by their waitlist row.
 *
 * 2. THE AUDIENCE READS WERE UNBOUNDED. A Supabase project caps a response at a
 *    fixed number of rows, 1,000 by default, in silence: HTTP 200, `error`
 *    null, a full-looking array
 *    (https://supabase.com/docs/reference/javascript/select, fetched
 *    2026-09-19). Past a thousand consenting people in a city, the rest were
 *    simply not written to.
 *
 * 3. `fetchDigestCities` READ THE WHOLE PLATFORM UNBOUNDED AND UNORDERED, only
 *    to reduce it to a set of city slugs. Past the ceiling an arbitrary subset
 *    came back and whole cities were never considered for a send at all, with
 *    no error anywhere and no stable answer between one week and the next.
 *
 * 4. THE SEND LOOP TRUNCATED PERMANENTLY. `recipients.slice(0, 500)` followed
 *    by an unconditional `digest_sends` insert, whose unique key the next
 *    invocation read as "already sent". The cron fires once a week, so a city
 *    with nine hundred lawful recipients wrote to five hundred and the other
 *    four hundred never received that week's email. EVERY SCANNER IN THIS
 *    REPOSITORY JUDGED THAT SLICE BOUNDED, CORRECTLY. A bound is not safety:
 *    the same lesson the seating screens taught on 20 September, where a
 *    `.range(0, 1999)` was the lowest ceiling on the platform.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FOURTH FILE RATHER THAN A SCOPE ADDED TO AN EXISTING ONE.
 *
 * `no-silent-row-ceiling` holds the consent ledger, the campaigner and the
 * attribution panels; `the-attendee-list-is-every-attendee` holds the
 * organiser's own exports. Neither names the weekly digest, which is why five
 * unbounded reads lived in it while six registered guards reported PASS.
 * Adding `src/lib/broadcast` wholesale to either would pull in the poster and
 * social-card renderers, which are red today on the error-destructure clause,
 * and a guard that cannot go green is a guard somebody switches off. Those
 * remainders are enumerated in REVIEW-QUEUE-B.md rather than hidden here.
 *
 * `share-links.ts` IS in scope, and was added after its own eight discarded
 * errors were corrected rather than declared out of reach. It belongs here
 * because the digest reaches it: every event line in the email is a tracked
 * short link, and a failed lookup used to read as "no such link" and mint a
 * SECOND code for an event that already had one, splitting that event's clicks
 * into two buckets.
 *
 * Clause 6 is the one that belongs to no other guard: it judges the SEND LOOP
 * rather than a read, because defect 4 was invisible to every read-shaped
 * check.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CANNOT SEE, stated rather than implied. It judges the SOURCE, never
 * the size of a table or the contents of a database, so a `.limit(10)` on the
 * events query is a bound it accepts and a product decision a reader has to
 * argue with. It cannot see that the resume offset lands on the right person;
 * that is what tests/unit/broadcast/digest-run.test.ts and the driven proof are
 * for.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-weekly-digest-owes-nobody-an-email]'

/**
 * THE DECISION PATH, BY FILE. Who is in the audience, and who this invocation
 * writes to. Named files rather than a directory because the decision is these
 * four and `src/lib/broadcast` is thirty modules, most of which render pictures.
 * Every one is checked to exist: a scope that has been renamed away would scan
 * nothing and report PASS, which is how a scanner lies.
 */
const SCOPE = [
  'src/lib/broadcast/digest.ts',
  'src/lib/broadcast/digest-audience.ts',
  'src/lib/broadcast/digest-run.ts',
  'src/lib/broadcast/share-links.ts',
  'src/app/api/cron/weekly-digest/route.ts',
]

/** The file whose send loop clause 6 judges. */
const SEND_LOOP = 'src/app/api/cron/weekly-digest/route.ts'

/** The pure planner the send window must come from. */
const PLANNER = 'planDigestRun'

/**
 * THE SKIP MUST READ THE CLOSURE MARKER OFF THE ROW, and this clause is
 * deliberately coupled to how that expression is spelled.
 *
 * A looser test, "the file mentions completed_at somewhere", is satisfied by the
 * column appearing in the select list while the decision below it still asks
 * only whether a row exists, which is the original defect wearing a new column.
 * The coupling costs a rename; a guard that cannot tell the fixed shape from the
 * broken one costs a week of somebody's marketing email.
 */
const IDEMPOTENCE_DECISION = /already\?\.completed_at/

/**
 * Columns UNIQUE on the tables this path reads, verified against the migrations
 * rather than assumed: `id` is the primary key on marketing_consents
 * (20260704000003 line 26), city_waitlist_signups (20260709000001 line 27),
 * digest_sends (20260704000003 line 71) and events. An order may name others
 * for readability as long as one of these breaks the ties, because a page
 * boundary on a non-unique order is undefined.
 */
const TOTAL_ORDER_COLUMNS = new Set(['id'])

/**
 * `in` filters whose values cannot grow into a URL, allowed by name. A
 * SCREAMING_CASE identifier is a module constant, which is the shape a fixed
 * status list takes, and `chunk` is the loop variable of chunkInFilterValues.
 */
const ALLOWED_IN_VALUES = [/^[A-Z][A-Z0-9_]*$/, /^chunk$/]

const failures = []
const notes = []
const work = {
  files: 0,
  reads: 0,
  bounded: 0,
  paged: 0,
  inFilters: 0,
  destructures: 0,
  sendLoops: 0,
}

for (const file of SCOPE) {
  if (!existsSync(resolve(ROOT, file))) {
    failures.push(
      `the scope names ${file} and it does not exist. Either the digest moved, in which case this ` +
        'guard now judges nothing and would report PASS, or it was deleted. Fix the list rather ' +
        'than the symptom.',
    )
  }
}

const files = SCOPE.filter(file => existsSync(resolve(ROOT, file)))
if (files.length === 0) {
  failures.push(
    'the scope matched no file at all. A scanner that judges nothing reports PASS, which is the ' +
      'one thing this guard must never do.',
  )
}

for (const file of files) {
  const absolute = resolve(ROOT, file)
  work.files += 1

  const { withStrings: source } = readSource(absolute)
  const heads = headOnlySelectLines(absolute)

  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    // --------------------------------------------------------------- clause 1
    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${file}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'and says nothing, so on this path that is a city whose members past the thousandth ' +
          'never receive the email, or a suppression list that comes back short and lets somebody ' +
          'who unsubscribed be written to. Page it through readEveryRow ' +
          '(src/lib/supabase/read-every-row.ts) or state a .limit() where a reader can see it. ' +
          `Chain: .${chain.methods.join('.')}`,
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue

    // --------------------------------------------------------------- clause 2
    if (!chain.methods.includes('order')) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged paging ` +
          'over a non-deterministic order is not paging: Postgres may return one row in two ' +
          'windows and another in none. On this path the audience is also the RESUME ORDER, so an ' +
          'undefined order means the next invocation steps over real people.',
      )
      continue
    }

    /*
     * --------------------------------------------------------------- clause 3
     * READ FROM `orderColumns`, NEVER FROM `chain.text`, which is truncated for
     * legibility: the audience select is longer than the display string, so a
     * regex over `text` could not see the `.order(` of any real chain here and
     * would report PASS on a tree carrying the exact defect.
     */
    if (!chain.orderColumns.some(col => TOTAL_ORDER_COLUMNS.has(col))) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} ordered by ` +
          `\`${chain.orderColumns.join(', ') || '(nothing)'}\`, and none of those is unique on ` +
          'that table, so the window boundaries are undefined: one recipient can appear in two ' +
          'pages and another in none. Break the tie on the primary key, as the audience reads do.',
      )
      continue
    }
    work.paged += 1
  }

  // ------------------------------------------------------------------ clause 4
  /*
   * EVERY `.in(` IS FED A CHUNK. Read from the FILE rather than from
   * `chain.text`: an `.in(` past the display truncation is invisible to a
   * scanner reading the chain string, and this is the clause that would have
   * caught defect 1.
   */
  for (const call of source.matchAll(/\.in\(\s*(['"])[A-Za-z0-9_]+\1\s*,\s*([^)]*)\)/g)) {
    work.inFilters += 1
    const values = call[2].trim()
    if (ALLOWED_IN_VALUES.some(re => re.test(values))) continue
    if (/\bchunk\b/.test(values)) continue
    failures.push(
      `${file}:${lineAt(source, call.index)} spells an \`in\` filter from ` +
        `\`${values.slice(0, 48)}\` rather than from a chunk. An \`in\` list is bounded by BYTES, ` +
        'not by how many things are in it: Supabase bounds URL and headers together at 16 KB and ' +
        'names lengthy `in` clauses as the usual cause, measured on this project between 15,038 ' +
        'and 16,083 bytes. On this path the list is a city\'s addresses, so the request fails at a ' +
        'few hundred people and the suppression list comes back EMPTY. Wrap it in ' +
        '`for (const chunk of chunkInFilterValues(emails))`.',
    )
  }

  // ------------------------------------------------------------------ clause 5
  /*
   * A READ THAT FAILED MUST NOT LOOK LIKE AN ANSWER. The patterns below match
   * CODE shapes (a destructure of an await) that a prose sentence in these
   * files' own headers cannot accidentally form, which is why the source is not
   * stripped of comments first.
   */
  for (const match of source.matchAll(/const\s*(\{[^}]*\})\s*=\s*await\b/g)) {
    const names = match[1]
    const rows = /\bdata\b/.test(names)
    const counts = /\bcount\b/.test(names)
    if (!rows && !counts) continue
    work.destructures += 1
    if (/\berror\b/.test(names)) continue
    failures.push(
      `${file}:${lineAt(source, match.index)} destructures \`${rows ? 'data' : 'count'}\` and not ` +
        '`error`, so a read that FAILED is indistinguishable from an answer. On this path that is ' +
        'how the suppression list became empty, how a city with events became ' +
        '`skipped: no_events`, and how an unreadable audit row became "this city has never been ' +
        'sent to".',
    )
  }
}

// ------------------------------------------------------------------- clause 6
/*
 * THE SEND WINDOW COMES FROM THE PLANNER, NEVER FROM A SLICE.
 *
 * This is the clause no read-shaped check could carry. `recipients.slice(0, N)`
 * is a bound, every scanner agreed it was a bound, and it dropped four hundred
 * people a week without a word. `planDigestRun` is pure, exhaustively tested,
 * and hands back what is STILL OWED alongside the window, so a caller cannot
 * take one without the other.
 */
const loopPath = resolve(ROOT, SEND_LOOP)
if (existsSync(loopPath)) {
  work.sendLoops += 1
  const { withStrings: loop } = readSource(loopPath)

  if (!new RegExp(`\\b${PLANNER}\\b`).test(loop)) {
    failures.push(
      `${SEND_LOOP} does not call ${PLANNER}. The window one invocation may write to, and the ` +
        'remainder it still owes, are one decision and they live in ' +
        'src/lib/broadcast/digest-run.ts so that taking the window without the remainder is not ' +
        'expressible.',
    )
  }

  for (const call of loop.matchAll(/\b(recipients|candidates|audience|toSend)\s*\.slice\(/g)) {
    failures.push(
      `${SEND_LOOP}:${lineAt(loop, call.index)} slices \`${call[1]}\` directly. That is exactly ` +
        'the defect: `recipients.slice(0, 500)` followed by the period\'s audit row meant the next ' +
        'invocation answered `already_sent_this_period` and the people past the cap never received ' +
        `that week's email at all. Take the window from ${PLANNER} instead.`,
    )
  }

  /*
   * THE PERIOD IS CLOSED ON PURPOSE, NEVER BY ARRIVING. `completed_at` is what
   * tells "the whole audience was written to" from "we stopped at the cap", so
   * the skip has to read it. A skip that reads only the row's existence is the
   * original defect wearing a new column.
   */
  if (!IDEMPOTENCE_DECISION.test(loop)) {
    failures.push(
      `${SEND_LOOP} never reads completed_at off the row it found, so its idempotence check can ` +
        'only ask whether a row EXISTS. A row exists as soon as the first batch goes out, so that ' +
        'question answers "already sent" to a period that still owes people an email. The check ' +
        `this clause is looking for is \`${IDEMPOTENCE_DECISION.source}\`.`,
    )
  }
}

// ---------------------------------------------------------------------------
notes.push(
  `${work.files} file(s) on the digest send path, ${work.reads} read(s) judged, ` +
    `${work.inFilters} in-filter(s), ${work.destructures} await destructure(s), ` +
    `${work.sendLoops} send loop(s)`,
)
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
} else {
  console.log(
    `${TAG} PASS - ${work.reads} read(s) across ${work.files} file(s); ` +
      `${work.bounded} bounded, ${work.paged} paged on a unique column.`,
  )
}

declareWork('the-weekly-digest-owes-nobody-an-email', {
  did: {
    'digest send-path file judged': work.files,
    'read judged': work.reads,
    'read paged on a unique column': work.paged,
    'in filter judged': work.inFilters,
    'await destructure judged': work.destructures,
    'send loop judged': work.sendLoops,
  },
  found: {
    'recipient this email could drop, duplicate or write to after they said stop': failures.length,
  },
})

if (failures.length > 0) process.exit(1)
