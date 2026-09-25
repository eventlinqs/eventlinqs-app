/**
 * GUARD: THE WEEKEND IS DEFINED ONCE, AND NOWHERE ELSE DECIDES IT FROM A CLOCK.
 *
 * ============================================================================
 * WHY THIS GUARD EXISTS, AND WHY A COMMENT WAS NOT ENOUGH
 * ============================================================================
 *
 * `src/lib/events/listing-window.ts` carries `weekendWindowUtc`, and its own
 * header already says what it is for:
 *
 *     "ONE DEFINITION, because there were FOUR: the /events weekend preset, the
 *      city page, the suburb page and the community-by-city page each carried
 *      their own copy built on `setHours`, so all four ran on the server's UTC
 *      day and all four had to be found separately."
 *
 * Four were found and consolidated. On 19 September 2026, TWO MORE were still
 * live, and the consolidation had no way to notice either of them:
 *
 *   src/app/page.tsx    built its own Saturday-to-Sunday window from
 *                       `getUTCDay()` and `setUTCHours`. On a platform whose
 *                       events all happen between UTC+8 and UTC+11, that ran
 *                       from Saturday 10:00 to Monday 10:00 Melbourne time.
 *                       MEASURED against the TEST catalogue the same day: three
 *                       of the twelve events on the following weekend start on
 *                       Saturday at 09:40 Melbourne, which is Friday 23:40 UTC.
 *                       A QUARTER of the weekend was missing from the rail whose
 *                       only job is to show it, and the "View all" link beneath
 *                       that rail went to `/events?preset=weekend`, which had
 *                       been asking the shared rule the whole time. The rail and
 *                       its own View-all disagreed.
 *
 *   /api/home/surprise  read `now.getDay()` and `now.getHours()`, which are the
 *                       SERVER's zone, and on Vercel that is UTC. Monday 09:00
 *                       in Melbourne is Sunday 22:00 UTC, so a Monday morning
 *                       pick was labelled "Weekend energy". Saturday 20:00 in
 *                       Melbourne is Saturday 10:00 UTC, so a Saturday night
 *                       pick was labelled "Saturday daytime pick". That file was
 *                       already careful in one direction - it carries a comment
 *                       saying the modal shows "the event's day not the
 *                       reader's" - and then read the server's for the label.
 *
 * SIX COPIES, over months, four of them removed by a consolidation that could
 * not see the other two. A prose header cannot stop the seventh. This can.
 *
 * ============================================================================
 * WHAT IT CHECKS
 * ============================================================================
 *
 *   CLAUSE 1. A file under src/ that TALKS about the weekend and also does
 *             calendar arithmetic on a Date must get the answer from the shared
 *             module. "Talks about the weekend" is a `weekend` token anywhere in
 *             the file; "calendar arithmetic" is any of the day-or-hour
 *             accessors listed in ARITHMETIC below. The remedy is one import,
 *             and the failure message names it.
 *
 *   CLAUSE 2. The shared module still EXPORTS the three functions everything
 *             else is told to use. Without this, renaming or deleting
 *             `weekendWindowUtc` would make clause 1 unsatisfiable while this
 *             guard reported a pass on a tree with no definition at all. A guard
 *             whose subject moves out from under it must go RED, never quiet:
 *             that is the lesson written into sitemap-resolves after the venue
 *             block published nothing for its whole life.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT CHECK, so the silence is not read as coverage
 * ============================================================================
 *
 * It does not ban `getHours()` or `getDay()` generally. Ten call sites in src/
 * use them and most are correct: `greeting-text.tsx` reads `new Date().getHours()`
 * on the CLIENT on purpose, so the greeting follows the reader's own clock,
 * which is exactly right and was itself a fix; the magic-draft helpers
 * manipulate a local wall clock for a `datetime-local` default; the connect
 * ledger works in UTC deliberately. A blanket ban would need an allowlist of
 * six, and an allowlist of six is a list nobody re-reads. This guard is scoped
 * to the ONE decision that has now been got wrong six times.
 *
 * It also cannot see a file that computes a weekend without using the word. That
 * is stated rather than hidden, and it is the reason clause 1 is written against
 * the token rather than against a shape: a shape test that tried to recognise
 * "Saturday arithmetic" would either miss the next variant or fire on every date
 * in the tree.
 *
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run standalone:
 *   node scripts/guards/one-weekend-definition.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[one-weekend-definition]'
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** The one file allowed to define the weekend. */
export const DEFINITION = 'src/lib/events/listing-window.ts'

/** The exports clause 2 requires the definition to keep offering. */
export const REQUIRED_EXPORTS = ['weekendWindowUtc', 'localDayOfWeek', 'localHourOfDay']

/**
 * Calendar arithmetic on a Date.
 *
 * `getUTCDay` and `setUTCHours` are the two the deleted homepage block used;
 * `getDay`, `getHours` and `setHours` are the two the surprise route used plus
 * their setter. `setUTCDate` and `setDate` are how a Saturday offset is walked.
 */
export const ARITHMETIC =
  /\.(getDay|getHours|getUTCDay|getUTCHours|setDate|setHours|setUTCDate|setUTCHours)\s*\(/

/**
 * How a file proves it asked the shared module instead of deciding for itself.
 *
 * BOTH SPELLINGS OF THE SAME IMPORT, and the reason is that the first version of
 * this pattern only accepted the `@/lib/events/...` alias and its first run
 * refused `src/lib/events/fetchers.ts`, which imports its neighbour as
 * `./listing-window` and is the very file that owns `presetWindow`. A guard that
 * fires on the correct answer teaches people to switch it off, so the match is
 * on the module NAME at the end of the specifier and not on the path used to
 * reach it.
 */
export const SHARED_IMPORT = /from\s+['"][^'"]*\/(listing-window|fetchers)['"]/

/** A file that talks about the weekend at all. */
export const WEEKEND_TOKEN = /weekend/i

/**
 * The verdict for one file, pure so the table is testable with no filesystem.
 *
 * @param {string} rel repo-relative path, forward slashes
 * @param {string} source the file's text
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function judgeFile(rel, source) {
  if (rel === DEFINITION) return { ok: true }
  if (!WEEKEND_TOKEN.test(source)) return { ok: true }
  if (!ARITHMETIC.test(source)) return { ok: true }
  if (SHARED_IMPORT.test(source)) return { ok: true }
  return {
    ok: false,
    reason:
      `${rel} decides something about the WEEKEND and does its own calendar arithmetic on a Date, ` +
      `without importing the shared definition. On this platform that is a bug by construction: the ` +
      `server runs UTC on Vercel and every reader is between UTC+8 and UTC+11, so a weekend built from ` +
      `getUTCDay/getHours starts and ends up to eleven hours out. It has been got wrong six times. ` +
      `Import weekendWindowUtc (or localDayOfWeek / localHourOfDay) from @/lib/events/listing-window, ` +
      `or presetWindow from @/lib/events/fetchers, and delete the local copy.`,
  }
}

/**
 * Clause 2, pure: the definition still offers what everything else is sent to.
 *
 * @param {string} source the text of DEFINITION
 * @returns {string[]} the missing export names
 */
export function missingExports(source) {
  return REQUIRED_EXPORTS.filter(name => !new RegExp(`export\\s+function\\s+${name}\\b`).test(source))
}

/** Every .ts/.tsx file under src/, repo-relative with forward slashes. */
export function sourceFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    out.push(relative(ROOT, full).replace(/\\/g, '/'))
  }
  return out
}

const invokedDirectly = process.argv[1] && /one-weekend-definition\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const failures = []
  const files = sourceFiles()
  let considered = 0

  for (const rel of files) {
    const source = readFileSync(join(ROOT, rel), 'utf8')
    if (rel !== DEFINITION && WEEKEND_TOKEN.test(source) && ARITHMETIC.test(source)) considered += 1
    const verdict = judgeFile(rel, source)
    if (!verdict.ok) failures.push(verdict.reason)
  }

  let definitionSource = ''
  try {
    definitionSource = readFileSync(join(ROOT, DEFINITION), 'utf8')
  } catch (error) {
    // NAMED, not swallowed. "not there" and "there but unreadable" are different
    // facts and the second one is a machine problem rather than a code one, so
    // the message carries what the filesystem actually said.
    failures.push(
      `${DEFINITION} could not be read: ${error instanceof Error ? error.message : String(error)}. ` +
        `That file IS the weekend, and every other file is told to import it, so its absence makes this ` +
        `guard's own instruction impossible to follow. This is a failure rather than a pass with nothing ` +
        `to check.`,
    )
  }
  const gone = definitionSource ? missingExports(definitionSource) : []
  if (gone.length > 0) {
    failures.push(
      `${DEFINITION} no longer exports ${gone.join(', ')}. Everything else on the platform is sent here for ` +
        `that answer, so a rename leaves this guard telling people to import something that is not there ` +
        `while reporting a pass. Restore the name or update REQUIRED_EXPORTS in this guard in the same commit.`,
    )
  }

  declareWork('one-weekend-definition', {
    did: { 'source file read': files.length, 'weekend-and-arithmetic file judged': considered },
    found: { 'private weekend definition': failures.length },
    zeroIsFine: {
      'private weekend definition': 'nothing re-derives the weekend, which is the point of the guard',
    },
  })

  if (failures.length > 0) {
    console.error(`\n${TAG} FAIL - ${failures.length} problem(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  } else {
    console.log(
      `${TAG} PASS - ${considered} file(s) talk about the weekend and do date arithmetic, ` +
        `every one of them through ${DEFINITION}, which still exports ${REQUIRED_EXPORTS.join(', ')}.`,
    )
  }
}
