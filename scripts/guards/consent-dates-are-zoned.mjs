/**
 * GUARD: NO DATE A PERSON READS ON A CONSENT, AUDIENCE OR MARKETING SURFACE IS
 * FORMATTED WITHOUT NAMING A TIME ZONE.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on this tree on 19 September 2026.
 *
 * src/lib/consent/sentences.ts built every date in the consent ledger from
 * getUTCDate(), getUTCMonth() and getUTCFullYear() over its own month array.
 * Australian eastern time is UTC+10 or UTC+11, so every record made between
 * 10:00 and midnight local rendered A DAY EARLY. The LB-ONECLICK drive pressed
 * one-click at 07:20 on 19 September 2026 Melbourne time and the person's own
 * preferences page reported:
 *
 *     On 18 September 2026, on the one-click-unsubscribe surface, this address
 *     withdrew that agreement.
 *
 * Fourteen hours of every day, and all of the evening, which is when people
 * read email and press unsubscribe.
 *
 * WHY IT IS WORSE HERE THAN ALMOST ANYWHERE ELSE. The closing line of that same
 * page is "Records are kept as evidence of what you were shown and when". A
 * surface whose whole claim is evidence cannot be a day out. It is the screen a
 * complaint is answered from.
 *
 * THE RULE IS NOT NEW. src/lib/dates/event-time.ts has said since 18 August 2026
 * that a date belonging to an event is formatted in the EVENT's zone and "a date
 * that is not an event's ... takes the platform zone". A consent event has no
 * event behind it, so it takes PLATFORM_TIME_ZONE. The ledger simply never
 * followed the rule, and nothing could see that it did not.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD RATHER THAN THE UNIT TEST ALONE.
 *
 * The unit test pins readableDate. It cannot see the NEXT surface: an admin
 * audience screen, a proof page, a campaign report that renders its own date
 * with a bare toLocaleDateString(). That call is correct on the author's laptop,
 * correct in every test that runs in one zone, and wrong on a server in UTC,
 * which is where this platform actually runs. Nothing goes red. The date is just
 * quietly a day out for half of every day.
 *
 * ---------------------------------------------------------------------------
 * THE SECOND DEFECT, 19 September 2026, AND IT WAS THIS GUARD'S OWN BLIND SPOT.
 *
 * The clauses below were written the day the ledger was fixed, and they read
 * three getters and two formatters. They could not see the COMMONEST way to
 * render a UTC date at all: slicing the first ten characters off an ISO string.
 * An ISO timestamp is UTC by definition, so `iso.slice(0, 10)` IS the UTC
 * calendar date, and four live renderings in this very path did exactly that
 * while this guard printed OK over all four:
 *
 *   src/app/admin/(authed)/matches/page.tsx       the matcher run's own date
 *   src/app/admin/(authed)/matches/match-run-form the event picker's label
 *   src/app/admin/(authed)/pricing/targets/route  the event date beside every
 *                                                 result in the fee-override
 *                                                 target picker
 *   src/lib/consent/decide.ts, twice              the consent door's own
 *                                                 evidence sentences, stored as
 *                                                 the detail of every
 *                                                 marketing_send_skip row
 *
 * TWO OF THOSE WERE ALSO OUTSIDE THE SCOPE LIST, which is the other half of the
 * blind spot: the list named the audience and campaign screens and not the
 * matcher, the attribution, the network, the analytics or the pricing screens,
 * which are the same path with different headings. The scope now names all of
 * them, and the forecast, and it is the reason the file count is printed.
 *
 * ---------------------------------------------------------------------------
 * THE THREE CLAUSES.
 *
 *   1. NO UNZONED RENDERING IN SCOPE. Within the consent, audience, campaigner,
 *      matching, attribution, proof, forecast and growth path, and the
 *      marketing and admin surfaces built on them, a file may not call
 *      getUTCDate(), getUTCMonth() or getUTCFullYear(), and may not call a
 *      toLocale*String formatter or construct an Intl.DateTimeFormat without
 *      naming a timeZone.
 *
 *   2. THE LEDGER DELEGATES. src/lib/consent/sentences.ts must render through
 *      the shared platform formatter rather than rolling its own, because the
 *      whole point of the shared module is that one place formats a date and is
 *      never allowed to guess the zone.
 *
 *   3. NO DATE CUT OUT OF AN ISO STRING. In the same scope, `.toISOString()`
 *      may not be followed by a slice, and nothing whose name says it is a date
 *      or a timestamp may have its first ten characters taken. Both produce the
 *      UTC calendar date with no formatter anywhere for clause 1 to see.
 *
 *      THERE IS NO ESCAPE HATCH AND NOTHING IN SCOPE NEEDS ONE, checked rather
 *      than assumed. A UTC day KEY for a counter is legitimate arithmetic and is
 *      exactly what the paragraph below permits, but it belongs in a named
 *      helper outside the marketing path rather than inline on a surface, and
 *      there is no such key in this scope today.
 *
 * WHAT IS DELIBERATELY NOT IN SCOPE, so a pass is not read as more than it is.
 * UTC ARITHMETIC IS FINE AND IS NOT TOUCHED: setUTCDate for adding a day,
 * Date.UTC for a period boundary, getUTCFullYear inside a key like
 * "2026-09" for a monthly counter. Those are calculations, not renderings, and
 * banning them would be wrong. This guard reads only the three GETTERS used to
 * assemble a displayed date, plus the locale formatters. The money and payout
 * paths are outside this scope on purpose: they belong to another lane and this
 * guard is not the place to open that question.
 *
 * READ AS CODE, NOT AS TEXT. Every file is passed through stripComments first.
 * The post-mortem above names all three banned getters, and a guard that cannot
 * tell a post-mortem from the defect is a guard that punishes writing the
 * post-mortem. scripts/lib/js-source.mjs exists because this happened once
 * before, and it happened to this guard's own unit test on its first run.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[consent-dates]'
const ROOT = process.cwd()

/**
 * The marketing, consent and audience path. Mirrors the scope of
 * no-silent-row-ceiling.mjs deliberately: it is the same territory, and two
 * guards over one path should not disagree about where that path is.
 */
const SCOPE = [
  'src/lib/consent',
  'src/lib/campaigner',
  'src/lib/audience',
  'src/lib/matching',
  'src/lib/attribution',
  'src/lib/proof',
  'src/lib/growth',
  'src/lib/forecast',
  'src/app/admin/(authed)/audience',
  'src/app/admin/(authed)/campaigns',
  'src/app/admin/(authed)/matches',
  'src/app/admin/(authed)/attribution',
  'src/app/admin/(authed)/network',
  'src/app/admin/(authed)/analytics',
  'src/app/admin/(authed)/pricing',
  'src/app/marketing',
  'src/app/forecast',
]

const LEDGER_SENTENCES = 'src/lib/consent/sentences.ts'
const SHARED_FORMATTER = 'formatPlatformDateLong'

/**
 * The three getters used to ASSEMBLE a displayed date. Regex LITERALS, never
 * built from a template string: a backslash class inside a template literal is
 * not an escape, and a guard whose matcher compiled to nonsense shipped blind in
 * this tree on 18 September 2026 and reported PASS over the very thing it
 * banned.
 */
const DISPLAY_GETTER = /\.getUTC(Date|Month|FullYear)\s*\(/
const LOCALE_FORMATTER = /\.toLocale(Date|Time)?String\s*\(/
const INTL_FORMATTER = /new Intl\.DateTimeFormat\s*\(/
/** A zone is named somewhere in the same call. */
const NAMES_A_ZONE = /timeZone\s*:/

/**
 * CLAUSE 3'S TWO MATCHERS. Regex LITERALS, for the reason given above.
 *
 * ISO_SLICE is unambiguous: an ISO string is UTC, so cutting it up produces the
 * UTC calendar date and no formatter exists for clause 1 to judge.
 *
 * NAMED_SLICE is the same cut made on a value that is already a stored
 * timestamp, which is how three of the four live defects were written:
 * `run.started_at`, `event.startDate`, `deciding.occurredAt`. It captures the
 * identifier so the decision is made about the NAME rather than about ten
 * characters of anything, because `hex.slice(0, 8)` is a UUID and
 * `rows.slice(0, 10)` is a page of a list, and a guard that fires on those is a
 * guard somebody switches off.
 */
const ISO_SLICE = /\.toISOString\s*\(\s*\)\s*\.\s*(?:slice|substring|substr)\s*\(/
const NAMED_SLICE = /([A-Za-z_$][\w$]*)\s*\.\s*(?:slice|substring|substr)\s*\(\s*0\s*,\s*10\s*\)/

/**
 * Whether an identifier says it holds a date or a timestamp. The capital letter
 * is load bearing in the camelCase arm: `format` ends in "at" and `candidate`
 * ends in "date", and neither is a date.
 */
function namesADate(identifier) {
  if (/(?:_at|_date|_time|_timestamp|_on)$/.test(identifier)) return true
  if (/[a-z0-9](?:At|Date|Time|Timestamp|Iso|ISO|On)$/.test(identifier)) return true
  return ['date', 'time', 'timestamp', 'iso', 'instant', 'occurred', 'stamp'].includes(identifier)
}

const failures = []
const notes = []
let filesSwept = 0
let callsJudged = 0

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * The argument list of a call, by matching parentheses from a given offset, so
 * "does this call name a zone" is answered about THAT call rather than about a
 * window of characters that may contain the next one.
 */
function callRegion(source, openParenIndex) {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(openParenIndex, i + 1)
    }
  }
  return source.slice(openParenIndex)
}

function lineOf(source, index) {
  return source.slice(0, index).split(String.fromCharCode(10)).length
}

// --------------------------------------------------------------------------
// Clause 1: no unzoned rendering anywhere in scope.
// --------------------------------------------------------------------------
const files = []
for (const dir of SCOPE) walk(join(ROOT, dir), files)

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const code = stripComments(readFileSync(abs, 'utf8'))
  filesSwept += 1

  let m
  const getters = new RegExp(DISPLAY_GETTER.source, 'g')
  while ((m = getters.exec(code)) !== null) {
    callsJudged += 1
    failures.push(
      `${rel}:${lineOf(code, m.index)} assembles a date from .getUTC${m[1]}(). On an Australian ` +
        'platform that renders a day early for every instant after 10:00 local. A date with no ' +
        'event behind it takes PLATFORM_TIME_ZONE (src/lib/dates/event-time.ts).',
    )
  }

  for (const pattern of [LOCALE_FORMATTER, INTL_FORMATTER]) {
    const scan = new RegExp(pattern.source, 'g')
    while ((m = scan.exec(code)) !== null) {
      const open = code.indexOf('(', m.index + m[0].length - 1)
      const region = callRegion(code, open === -1 ? m.index : open)
      callsJudged += 1
      if (!NAMES_A_ZONE.test(region)) {
        failures.push(
          `${rel}:${lineOf(code, m.index)} formats a date with ${m[0].trim()} and names no timeZone. ` +
            'That is correct on the author machine and wrong on a server running UTC, which is ' +
            'where this platform runs, and nothing goes red either way.',
        )
      }
    }
  }
}

/* --------------------------------------------------------------------------
 * Clause 3: no date cut out of an ISO string.
 * ------------------------------------------------------------------------ */
let slicesJudged = 0
let sliceCallsSeen = 0

/*
 * THE MATCHERS PROVE THEMSELVES BEFORE THEY ARE TRUSTED, on every run.
 *
 * On 18 September 2026 a guard in this tree shipped BLIND: its pattern was
 * built inside a template literal, where a backslash class is not an escape, so
 * it compiled to nonsense and reported PASS over a file whose third line was the
 * thing it banned. Only the red half of a drill found it. These probes are the
 * cheap version of that drill and they run every time: two strings that MUST
 * match and two that MUST NOT, so a matcher that has stopped matching fails here
 * rather than going quietly green over the defect.
 */
const PROBES = [
  { pattern: ISO_SLICE, sample: 'new Date(x).toISOString().slice(0, 10)', shouldMatch: true },
  { pattern: ISO_SLICE, sample: 'new Date(x).toISOString()', shouldMatch: false },
  { pattern: NAMED_SLICE, sample: 'row.started_at.slice(0, 10)', shouldMatch: true },
  { pattern: NAMED_SLICE, sample: 'rows.slice(0, 5)', shouldMatch: false },
]
for (const probe of PROBES) {
  if (probe.pattern.test(probe.sample) !== probe.shouldMatch) {
    failures.push(
      `clause 3's matcher ${probe.pattern.source} ${probe.shouldMatch ? 'no longer matches' : 'now matches'} ` +
        `"${probe.sample}". The clause cannot be trusted until that is true again.`,
    )
  }
}
if (namesADate('hex') || namesADate('rows') || namesADate('format') || namesADate('candidate')) {
  failures.push('namesADate has widened and now calls a non-date identifier a date.')
}
if (!namesADate('started_at') || !namesADate('occurredAt') || !namesADate('startDate')) {
  failures.push('namesADate has narrowed and no longer recognises a stored timestamp.')
}
for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const code = stripComments(readFileSync(abs, 'utf8'))

  let m
  const iso = new RegExp(ISO_SLICE.source, 'g')
  while ((m = iso.exec(code)) !== null) {
    slicesJudged += 1
    failures.push(
      `${rel}:${lineOf(code, m.index)} cuts a date out of .toISOString(). An ISO string is UTC by ` +
        'definition, so those characters ARE the UTC calendar date and there is no formatter here ' +
        'for anything to judge. Render it through src/lib/dates/event-time.ts: an event date takes ' +
        "the EVENT's zone, anything else takes PLATFORM_TIME_ZONE.",
    )
  }

  sliceCallsSeen += (code.match(/\.(?:slice|substring|substr)\s*\(/g) ?? []).length

  const named = new RegExp(NAMED_SLICE.source, 'g')
  while ((m = named.exec(code)) !== null) {
    if (!namesADate(m[1])) continue
    slicesJudged += 1
    failures.push(
      `${rel}:${lineOf(code, m.index)} takes the first ten characters of ${m[1]}, which is a stored ` +
        'timestamp, so the result is the UTC calendar date. That is a day early for every event ' +
        'starting before its own offset and for every record made after 10:00 local.',
    )
  }
}
if (filesSwept > 0 && sliceCallsSeen === 0) {
  failures.push(
    'clause 3 found no slice, substring or substr call anywhere in scope. That is not a clean tree, ' +
      'it is a matcher or a sweep that has stopped working: this path has always contained several.',
  )
}
notes.push(`${sliceCallsSeen} slice-shaped call(s) considered, ${slicesJudged} of them a date cut from a timestamp`)

if (filesSwept === 0) {
  failures.push(
    'the scope matched no files at all. Either the marketing path moved or this guard is pointed ' +
      'at directories that no longer exist; a guard that sweeps nothing prints the same OK as one ' +
      'that sweeps everything.',
  )
} else {
  notes.push(`${filesSwept} file(s) swept across ${SCOPE.length} director(ies)`)
}

// --------------------------------------------------------------------------
// Clause 2: the ledger delegates to the one formatter.
// --------------------------------------------------------------------------
const sentencesPath = join(ROOT, LEDGER_SENTENCES)
if (!existsSync(sentencesPath)) {
  failures.push(`${LEDGER_SENTENCES} is missing. It is the module this guard was written for.`)
} else {
  const code = stripComments(readFileSync(sentencesPath, 'utf8'))
  /*
   * THE IMPORT AND THE CALL, both, and the drill is what established that this
   * matters rather than a preference.
   *
   * The first form of this clause was `code.includes(SHARED_FORMATTER)`, and the
   * drill that deletes the IMPORT line reported DID NOT FAIL: the call site
   * still spells the name, so the substring was still there and the guard said
   * OK over a module that no longer compiles. A name in a file is not a
   * dependency on it. This is the second time in two items that a clause of mine
   * was satisfied by the wrong occurrence of the right word.
   */
  const imports = /import\s*\{[^}]*formatPlatformDateLong[^}]*\}\s*from\s*'@\/lib\/dates\/event-time'/.test(code)
  const calls = /formatPlatformDateLong\s*\(/.test(code)
  if (!imports || !calls) {
    failures.push(
      `${LEDGER_SENTENCES} no longer ` +
        (!imports && !calls
          ? `imports or calls ${SHARED_FORMATTER}`
          : !imports
            ? `imports ${SHARED_FORMATTER} from '@/lib/dates/event-time'`
            : `calls ${SHARED_FORMATTER}`) +
        '. It hand-rolled a month array and UTC getters once already, and that is what put the ' +
        'wrong day on the one page whose closing line is "Records are kept as evidence of what ' +
        'you were shown and when".',
    )
  } else {
    notes.push(`${LEDGER_SENTENCES} imports and calls ${SHARED_FORMATTER}`)
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(`${TAG} ${note}`)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${failures.length} unzoned date rendering(s).`)
}

declareWork('consent-dates-are-zoned', {
  did: {
    'directory in the consent and marketing path': SCOPE.length,
    'file swept': filesSwept,
    'date rendering call judged': callsJudged,
    'slice-shaped call considered': sliceCallsSeen,
    'matcher self-probe run': PROBES.length,
  },
  zeroIsFine: {
    'date rendering call judged':
      'the scope may legitimately hold no date rendering at all; the file count is what proves ' +
      'this guard looked',
  },
  found: { 'date rendered without a zone': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(`${TAG} OK`)
